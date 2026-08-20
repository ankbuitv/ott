/**
 * CHRTV - M3U Playlist Client-side Parser
 * Tác giả: CHRTV OTT Full-stack Architect
 */

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
    } else if (line && !line.startsWith('#') && current) {
      current.stream_url = line;
      channels.push(current);
      current = null;
    }
  }

  return channels;
}
