import { releaseState, fmtDateVi } from '../src/utils/release.js';
const cases = [
  ['HP 2026 (chưa chiếu)', { first_air_date: '2026-12-25', status: 'Returning Series' }, { released: false }],
  ['Oppenheimer (chiếu rồi)', { release_date: '2023-07-20' }, { released: true }],
  ['chiếu hôm nay', { release_date: new Date().toISOString().slice(0,10) }, { released: true }],
  ['không ngày + Planned', { status: 'Planned' }, { released: false, known: false }],
  ['không ngày không status', { id: 1 }, { released: true, known: false }],
  ['ngày rác', { release_date: 'n/a' }, { released: true }],
  ['chiếu ngày mai', { release_date: new Date(Date.now()+864e5).toISOString().slice(0,10) }, { released: false }],
  ['chiếu hôm qua', { release_date: new Date(Date.now()-864e5).toISOString().slice(0,10) }, { released: true }],
];
let bad = 0;
for (const [name, input, expect] of cases) {
  const got = releaseState(input);
  const ok = Object.entries(expect).every(([k,v]) => got[k] === v);
  if (!ok) bad++;
  console.log(`${ok ? '✓' : '✗'} ${name.padEnd(28)} → released=${got.released} known=${got.known} label="${got.dateLabel}"`);
}
console.log('fmtDateVi:', fmtDateVi('2026-12-25'), '| rỗng:', JSON.stringify(fmtDateVi('')));
process.exit(bad ? 1 : 0);
