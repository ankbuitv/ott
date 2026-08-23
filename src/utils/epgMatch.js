/**
 * CHRTV - EPG channel matching utilities
 * Real EPG XML sources often use channel IDs that differ slightly from the
 * M3U tvg-id (e.g. "VTV1" vs "VTV1.vn", or "vtv1.vn" vs "VTV1.vn").
 * This helper tries several strategies so EPG data shows up reliably.
 */
import { parseEpgDate } from './dateUtils';

function normalize(str) {
  if (!str) return '';
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9\u00e0-\u00ff\u0100-\u017f]+/g, '') // strip punctuation/dots/dashes/spaces
    .trim();
}

/**
 * Find the currently-airing (and optionally next) programme for a channel.
 * @param {Array} programmes - EPG programmes list
 * @param {Object} channel - channel object with channel_id + name
 * @param {Date} [now] - reference time (defaults to new Date())
 * @returns {{now: Object|null, next: Object|null}}
 */
export function findEpgForChannel(programmes, channel, now = new Date()) {
  if (!programmes || !Array.isArray(programmes) || !channel) return { now: null, next: null };

  const chId = normalize(channel.channel_id);
  const chName = normalize(channel.name);

  // 1) exact ID match
  let progs = programmes.filter(p => p.channel === channel.channel_id);
  // 2) normalized ID match
  if (progs.length === 0) progs = programmes.filter(p => normalize(p.channel) === chId);
  // 3) name match (EPG display-name vs channel name)
  if (progs.length === 0 && chName) {
    progs = programmes.filter(p => {
      const pn = normalize(p.display_name || p.channel);
      return pn && (pn === chName || pn.includes(chName) || chName.includes(pn));
    });
  }
  if (progs.length === 0) return { now: null, next: null };

  progs.sort((a, b) => parseEpgDate(a.start) - parseEpgDate(b.start));

  let epgNow = null, epgNext = null;
  for (let i = 0; i < progs.length; i++) {
    const start = parseEpgDate(progs[i].start);
    const stop = parseEpgDate(progs[i].stop);
    if (start <= now && stop >= now) {
      epgNow = progs[i];
      epgNext = progs[i + 1] || null;
      break;
    }
    // If we passed the current time and nothing matched yet, the first future one is "next"
    if (start > now && !epgNext) epgNext = progs[i];
  }
  // If nothing is airing right now (gap), pick closest programme
  if (!epgNow) {
    for (const p of progs) {
      const stop = parseEpgDate(p.stop);
      if (stop <= now) epgNow = p; // last ended one
      else break;
    }
    if (!epgNow && progs.length) epgNow = progs[0];
  }
  return { now: epgNow, next: epgNext };
}
