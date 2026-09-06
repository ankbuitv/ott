/**
 * Tìm kiếm + ra lệnh bằng giọng nói (Web Speech API, ưu tiên tiếng Việt).
 * Cần HTTPS (hoặc localhost) + quyền micro. Không hỗ trợ → trả { supported: false }.
 */

export function voiceSupported() {
  if (typeof window === 'undefined') return false;
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

// Nghe 1 câu rồi resolve transcript (hoặc null nếu lỗi/huỷ)
export function listenOnce({ lang = 'vi-VN', timeout = 8000 } = {}) {
  return new Promise((resolve) => {
    try {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SR) return resolve(null);
      const rec = new SR();
      rec.lang = lang;
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      let done = false;
      const finish = (v) => { if (!done) { done = true; try { rec.abort(); } catch {} resolve(v); } };
      rec.onresult = (e) => {
        const txt = (e.results?.[0]?.[0]?.transcript || '').trim();
        finish(txt || null);
      };
      rec.onerror = () => finish(null);
      rec.onend = () => finish(null);
      try { rec.start(); } catch { return finish(null); }
      setTimeout(() => finish(null), timeout);
    } catch {
      resolve(null);
    }
  });
}

// Phân tích lệnh tiếng Việt: "mở vtv1", "xem htv7", "tìm phim ma", "mở phim", "về trang chủ"...
export function parseVoiceCommand(raw) {
  const text = String(raw || '').trim().toLowerCase();
  if (!text) return { type: 'empty' };
  let m = text.match(/^(mở|mo|xem|chuyển sang|chuyen sang|bật|bat)\s+(kênh|kenh)?\s*(.+)$/);
  if (m && m[3] && !/^(phim|nhạc|nhac|epg|shorts|gói|goi|cài đặt|cai dat)/.test(m[3])) {
    return { type: 'open-channel', query: m[3].trim(), raw: text };
  }
  m = text.match(/^(tìm|tim|kiếm|kiem)\s+(phim\s+)?(.+)$/);
  if (m && m[3]) return { type: 'search', query: m[3].trim(), raw: text };
  if (/(trang chủ|trang chu|home)/.test(text)) return { type: 'tab', tab: 'channels', raw: text };
  if (/(lịch phát|lich phat|epg)/.test(text)) return { type: 'tab', tab: 'epg', raw: text };
  if (/phim/.test(text) && !/tìm|tim/.test(text)) return { type: 'tab', tab: 'movies', raw: text };
  if (/shorts|short/.test(text)) return { type: 'tab', tab: 'shorts', raw: text };
  if (/(yêu thích|yeu thich|favor)/.test(text)) return { type: 'tab', tab: 'favorites', raw: text };
  if (/(lịch sử|lich su|history)/.test(text)) return { type: 'tab', tab: 'history', raw: text };
  if (/(mua gói|mua goi|gói|goi|vip|nâng cấp|nang cap)/.test(text)) return { type: 'tab', tab: 'plans', raw: text };
  return { type: 'search', query: String(raw || '').trim(), raw: text };
}

// Chuẩn hoá để so khớp tên kênh nói ("vê tê vê một" → "vtv1")
export function normVoice(s) {
  let x = String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const numWords = { mot: '1', hai: '2', ba: '3', bon: '4', nam: '5', sau: '6', bay: '7', tam: '8', chin: '9', muoi: '10', khong: '0' };
  for (const [w, d] of Object.entries(numWords)) x = x.replace(new RegExp(`\\b${w}\\b`, 'g'), d);
  return x.replace(/[^a-z0-9]+/g, '');
}

export function findChannelByVoice(channels, query) {
  const q = normVoice(query);
  if (!q || !channels?.length) return null;
  let best = null; let bestScore = 0;
  for (const ch of channels) {
    const n = normVoice(ch.name) + ' ' + normVoice(ch.channel_id);
    if (!n.trim()) continue;
    if (n.replace(/\s+/g, '').includes(q) || q.includes(n.replace(/\s+/g, ''))) {
      const score = Math.min(q.length, 12);
      if (score > bestScore) { bestScore = score; best = ch; }
    }
  }
  if (!best) {
    for (const ch of channels) {
      const n = normVoice(ch.name);
      let hit = 0;
      for (let i = 0; i < q.length - 1; i++) if (n.includes(q.slice(i, i + 2))) hit++;
      if (hit >= 3 && hit > bestScore) { bestScore = hit; best = ch; }
    }
  }
  return bestScore > 0 ? best : null;
}
