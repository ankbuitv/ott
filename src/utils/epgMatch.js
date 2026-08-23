import { parseEpgDate } from './dateUtils';
function norm(s) { return (s||'').toLowerCase().replace(/[^a-z0-9]/g,''); }
export function findEpgForChannel(pgms, ch, now=new Date()) {
  if (!pgms || !ch) return { now: null, next: null };
  const id = norm(ch.channel_id);
  let progs = pgms.filter(p => p.channel === ch.channel_id);
  if (!progs.length) progs = pgms.filter(p => norm(p.channel) === id);
  if (!progs.length) return { now: null, next: null };
  progs.sort((a,b) => parseEpgDate(a.start) - parseEpgDate(b.start));
  let nowP = null, nextP = null;
  for (let i=0; i<progs.length; i++) {
    const s=parseEpgDate(progs[i].start), e=parseEpgDate(progs[i].stop);
    if (s<=now && e>=now) { nowP=progs[i]; nextP=progs[i+1]||null; break; }
    if (s>now && !nextP) nextP=progs[i];
  }
  return { now: nowP, next: nextP };
}