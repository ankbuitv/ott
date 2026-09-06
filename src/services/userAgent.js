/**
 * User-Agent upstream cho luồng phát (CHRTV PLAY)
 * Nhiều nguồn (TV360, FPT, VThanh...) kiểm tra UA — sai UA là 403 / không tải được manifest.
 * Worker ưu tiên: override từ client (header X-CHRTV-Upstream-UA) > UA của kênh (M3U #EXTVLCOPT) > VLC mặc định.
 */

export const UA_PRESETS = [
  { id: 'auto', label: 'Tự động (theo kênh)', hint: 'Dùng UA yêu cầu của kênh, fallback VLC', ua: '' },
  { id: 'dalvik', label: 'Dalvik/2.1.0', hint: 'Android TV360 / FPT — nhiều kênh cần cái này', ua: 'Dalvik/2.1.0' },
  { id: 'dalvik-full', label: 'Dalvik Android 13', hint: 'Dalvik đầy đủ cho box Android', ua: 'Dalvik/2.1.0 (Linux; U; Android 13; SM-G991B Build/TP1A.220624.014)' },
  { id: 'vlc', label: 'VLC', hint: 'Mặc định server', ua: 'VLC/3.0.21 LibVLC/3.0.21' },
  { id: 'vthanhtivi', label: 'VThanhTivi', hint: 'Một số kênh Outdoor/FPT', ua: 'VThanhTivi' },
  { id: 'chrome', label: 'Chrome Windows', hint: 'Giả trình duyệt PC', ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
  { id: 'okhttp', label: 'okhttp', hint: 'App Android dùng okhttp', ua: 'okhttp/4.9.3' },
  { id: 'exoplayer', label: 'ExoPlayer', hint: 'Android ExoPlayer', ua: 'ExoPlayer/2.18.0 (Linux;Android 13) ExoPlayerLib/2.18.0' },
];

const GLOBAL_KEY = 'chrtv_ua_global';
const PREFIX = 'chrtv_ua_';

function clean(s) {
  return String(s || '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, 300);
}

export function getGlobalUA() {
  try { return clean(localStorage.getItem(GLOBAL_KEY) || ''); } catch { return ''; }
}
export function setGlobalUA(ua) {
  try {
    if (ua) localStorage.setItem(GLOBAL_KEY, clean(ua));
    else localStorage.removeItem(GLOBAL_KEY);
  } catch {}
}

export function getChannelUA(channelId) {
  if (!channelId) return '';
  try { return clean(localStorage.getItem(PREFIX + channelId) || ''); } catch { return ''; }
}
export function setChannelUA(channelId, ua) {
  if (!channelId) return;
  try {
    if (ua) localStorage.setItem(PREFIX + channelId, clean(ua));
    else localStorage.removeItem(PREFIX + channelId);
  } catch {}
}
export function clearChannelUA(channelId) {
  if (!channelId) return;
  try { localStorage.removeItem(PREFIX + channelId); } catch {}
}

// UA hiệu lực gửi lên server: override kênh > override global > '' (để server dùng UA kênh/VLC)
export function effectiveUA(channel) {
  const per = getChannelUA(channel?.channel_id);
  if (per) return per;
  const g = getGlobalUA();
  if (g) return g;
  return '';
}

export function presetLabel(ua) {
  if (!ua) return 'Tự động';
  const p = UA_PRESETS.find((x) => x.ua === ua);
  if (p) return p.label;
  return ua.length > 26 ? ua.slice(0, 26) + '…' : ua;
}

export function shortUA(ua) {
  if (!ua) return '';
  if (/dalvik/i.test(ua)) return 'Dalvik';
  if (/vlc/i.test(ua)) return 'VLC';
  if (/vthanhtivi/i.test(ua)) return 'VThanhTivi';
  if (/chrome/i.test(ua)) return 'Chrome';
  if (/okhttp/i.test(ua)) return 'okhttp';
  if (/exoplayer/i.test(ua)) return 'ExoPlayer';
  return ua.slice(0, 18);
}
