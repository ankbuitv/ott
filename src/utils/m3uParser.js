/**
 * CHRTV - M3U Playlist Client-side Parser
 * Tác giả: CHRTV OTT Full-stack Architect
 *
 * Hỗ trợ:
 * - #EXTINF: thông tin kênh
 * - #EXTVLCOPT: tùy chọn VLC (user-agent)
 * - #KODIPROP: manifest_type, license_type, license_key (ClearKey)
 */

function base64ToHex(b64) {
  try {
    const raw = atob(b64.replace(/-/g, '+').replace(/_/g, '/'));
    let hex = '';
    for (let i = 0; i < raw.length; i++) {
      hex += raw.charCodeAt(i).toString(16).padStart(2, '0');
    }
    return hex;
  } catch { return ''; }
}

function parseLicenseKey(jsonStr) {
  try {
    const obj = JSON.parse(jsonStr);
    if (obj && obj.keys && Array.isArray(obj.keys) && obj.keys.length > 0) {
      const first = obj.keys[0];
      let kid = first.kid || '';
      let k = first.k || '';
      // Base64 -> hex
      if (kid && !/^[a-fA-F0-9]{32}$/.test(kid)) {
        const h = base64ToHex(kid);
        if (h.length === 32) kid = h;
      }
      if (k && !/^[a-fA-F0-9]{32}$/.test(k)) {
        const h = base64ToHex(k);
        if (h.length === 32) k = h;
      }
      if (kid.length === 32 && k.length === 32) {
        return { clearKeyId: kid, clearKey: k };
      }
    }
  } catch {}
  return null;
}

export function parseM3U(m3uText) {
  if (!m3uText) return [];
  const lines = m3uText.split(/\r?\n/);
  const channels = [];
  let current = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.startsWith('#EXTINF:')) {
      current = {};

      const idMatch = line.match(/tvg-id="([^"]+)"/i);
      current.channel_id = idMatch ? idMatch[1] : `ch_${channels.length + 1}`;

      const nameMatch = line.match(/tvg-name="([^"]+)"/i);
      const commaIdx = line.lastIndexOf(',');
      const displayName = commaIdx !== -1 ? line.substring(commaIdx + 1).trim() : '';
      current.name = nameMatch ? nameMatch[1] : (displayName || `Kênh ${channels.length + 1}`);

      const logoMatch = line.match(/tvg-logo="([^"]+)"/i);
      current.logo = logoMatch ? logoMatch[1] : '';

      const groupMatch = line.match(/group-title="([^"]+)"/i);
      current.group_title = groupMatch ? groupMatch[1] : 'Tổng Hợp';

      const typeMatch = line.match(/catchup-type="([^"]+)"/i);
      current.catchup_type = typeMatch ? typeMatch[1] : 'append';

      const daysMatch = line.match(/catchup-days="([^"]+)"/i);
      current.catchup_days = daysMatch ? parseInt(daysMatch[1], 10) : 7;
    } else if (line.startsWith('#KODIPROP:')) {
      if (!current) continue;
      const prop = line.substring('#KODIPROP:'.length).trim();
      // inputstream.adaptive.manifest_type=mpd
      const typeMatch = prop.match(/manifest_type=([^\s]+)/i);
      if (typeMatch) current.manifest_type = typeMatch[1];
      // inputstream.adaptive.license_type=clearkey
      const licTypeMatch = prop.match(/license_type=([^\s]+)/i);
      if (licTypeMatch) current.license_type = licTypeMatch[1];
      // inputstream.adaptive.license_key={"keys":...}
      const licKeyMatch = prop.match(/license_key=(.*)/);
      if (licKeyMatch) {
        const parsed = parseLicenseKey(licKeyMatch[1]);
        if (parsed) {
          current.clearKeyId = parsed.clearKeyId;
          current.clearKey = parsed.clearKey;
        }
      }
    } else if (line.startsWith('#EXTVLCOPT:')) {
      if (!current) continue;
      const opt = line.substring('#EXTVLCOPT:'.length).trim();
      const eqIdx = opt.indexOf('=');
      if (eqIdx !== -1) {
        const key = opt.substring(0, eqIdx).trim();
        const val = opt.substring(eqIdx + 1).trim();
        if (key === 'http-user-agent') current.user_agent = val;
      }
    } else if (line && !line.startsWith('#') && current) {
      current.stream_url = line;
      channels.push(current);
      current = null;
    }
  }

  return channels;
}
