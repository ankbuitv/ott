/**
 * Watch Party — rooms xem chung + chat + reaction.
 *
 * LƯU Ý KIẾN TRÚC: Cloudflare Workers (workerd) KHÔNG cho phép WebSocket gửi
 * chéo giữa 2 request khác nhau ("Cannot perform I/O on behalf of a different
 * request"), nên party dùng D1 + polling (feed mỗi ~1.6s). Message persist được
 * trong D1 nên còn xem lại được lịch sử phòng.
 *
 * API service này giữ nguyên interface cũ để UI không phải đổi:
 *   joinRoom(room, name) | sendPartyChat | sendPartyReaction | sendPartyState |
 *   leaveRoom | onPartyMessage(fn)
 * Event emit: {type:'joined'|'chat'|'reaction'|'state'|'presence', ...}
 */
import { API_BASE } from './config';

let currentRoom = null;
let myName = 'Khách';
let pollTimer = null;
let lastMsgId = 0;
let lastStateTs = 0;
let isHost = false;
const listeners = new Set();

function emit(msg) { listeners.forEach((fn) => { try { fn(msg); } catch {} }); }

export function onPartyMessage(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

async function api(path, body) {
  const res = await fetch(`${API_BASE}/api/party/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json().catch(() => ({}));
}

export function joinRoom(room, name = 'Khách', host = false) {
  leaveRoom();
  currentRoom = room;
  myName = (name || 'Khách').slice(0, 24);
  isHost = !!host;
  lastMsgId = 0;
  lastStateTs = 0;

  api('join', { room, name: myName });

  // Poll feed: chat + reaction + state + presence
  const poll = async () => {
    if (!currentRoom) return;
    try {
      const res = await fetch(`${API_BASE}/api/party/feed?room=${encodeURIComponent(currentRoom)}&after=${lastMsgId}`);
      const data = await res.json();
      if (data.success) {
        for (const m of data.messages || []) {
          lastMsgId = Math.max(lastMsgId, m.id);
          if (m.kind === 'chat') emit({ type: 'chat', room, from: m.from_name, text: m.text });
          else if (m.kind === 'reaction') emit({ type: 'reaction', room, emoji: m.text, from: m.from_name });
          else if (m.kind === 'join' && m.from_name !== myName) emit({ type: 'chat', room, from: 'Hệ thống', text: m.text, sys: true });
          else if (m.kind === 'leave' && m.from_name !== myName) emit({ type: 'chat', room, from: 'Hệ thống', text: m.text, sys: true });
        }
        if (data.state && data.state.updatedAt > lastStateTs) {
          const newer = lastStateTs > 0;
          lastStateTs = data.state.updatedAt;
          // Lần đầu vào phòng (lastStateTs===0) cũng áp dụng — bắt kịp kênh host đang xem
          emit({ type: 'state', room, state: data.state, initial: !newer });
        }
        emit({ type: 'presence', room, members: data.members || [], count: (data.members || []).length });
      }
    } catch {}
    // heartbeat cuối chu kỳ
    if (currentRoom) api('heartbeat', { room: currentRoom, name: myName }).catch(() => {});
  };

  poll();
  pollTimer = setInterval(poll, 1600);
}

export function sendPartyState(state) {
  if (!currentRoom || !isHost) return;
  api('state', { room: currentRoom, channelId: state.channelId, channelName: state.channelName }).catch(() => {});
}

export function sendPartyChat(text) {
  if (!currentRoom) return;
  api('say', { room: currentRoom, name: myName, text }).catch(() => {});
}

export function sendPartyReaction(emoji) {
  if (!currentRoom) return;
  api('react', { room: currentRoom, name: myName, emoji }).catch(() => {});
}

export function leaveRoom() {
  if (currentRoom) api('leave', { room: currentRoom, name: myName }).catch(() => {});
  currentRoom = null;
  clearInterval(pollTimer);
  pollTimer = null;
}

export const PARTY_EMOJIS = ['❤️', '🔥', '😂', '😮', '😭', '👏'];
