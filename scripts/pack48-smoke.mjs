// Smoke harness cho các endpoint Pack48: import thẳng Cloudflare Worker bằng Node,
// chạy trên SQLite in-memory (node:sqlite) phía sau một wrapper giả lập D1.
//
//   node scripts/pack48-smoke.mjs
//
// Không cần cài thêm gì: chỉ dùng node:sqlite (Node >= 22.5) + crypto tích hợp.

import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const workerMod = await import(path.join(root, 'worker', 'worker.js'));
const worker = workerMod.default;

// ---------- D1 fake wrapper ----------
function d1(db) {
  const bound = (stmt, args) => ({
    run: async () => {
      const r = stmt.run(...args);
      return { meta: { changes: Number(r.changes || 0), last_row_id: Number(r.lastInsertRowid || 0) } };
    },
    all: async () => ({ results: stmt.all(...args) || [] }),
    first: async () => stmt.get(...args),
  });
  return {
    prepare(sql) {
      const stmt = db.prepare(sql);
      return {
        bind: (...args) => bound(stmt, args),
        run: async () => { const r = stmt.run(); return { meta: { changes: Number(r.changes || 0) } }; },
        all: async () => ({ results: stmt.all() || [] }),
        first: async () => stmt.get(),
      };
    },
    async batch(items) {
      const out = [];
      for (const it of items || []) {
        if (it && typeof it.run === 'function') out.push(await it.run());
        else if (it && typeof it.all === 'function') out.push(await it.all());
        else out.push({});
      }
      return out;
    },
    exec(sql) { db.exec(sql); return { success: true }; },
  };
}

const db = new DatabaseSync(':memory:');
const DB = d1(db);
const SECRET = 'smoke-test-secret-0123456789';
const env = {
  DB,
  JWT_SECRET: SECRET,
  PASSWORD_PEPPER: SECRET,
  ADMIN_MASTER_TOKEN: 'smoke-admin-master',
  ENVIRONMENT: 'test',
};

// ---------- JWT giống hệt worker (HS256, base64 chuẩn qua btoa) ----------
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64');
const sha256hex = (s) => crypto.createHash('sha256').update(s).digest('hex');
function jwt(userId, extra = {}) {
  const h = b64({ alg: 'HS256', typ: 'JWT' });
  const p = b64({ userId, iat: Date.now(), exp: Date.now() + 3600_000, ...extra });
  return `${h}.${p}.${sha256hex(`${h}.${p}${SECRET}`)}`;
}

const ctx = { waitUntil: () => {} };
let pass = 0, fail = 0;
const failures = [];

async function call(method, pathname, { token, body, headers = {} } = {}) {
  const h = { Accept: 'application/json', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  const req = new Request(`http://smoke.local${pathname}`, {
    method,
    headers: h,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const res = await worker.fetch(req, env, ctx);
  let j = null;
  try { j = await res.clone().json(); } catch { /* non-json */ }
  return { status: res.status, j };
}

function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; failures.push(`${name} — ${detail}`); console.log(`  ❌ ${name} — ${detail}`); }
}

// ---------- setup ----------
console.log('Bootstrap schema + users…');
await call('GET', '/api/status');
const tokUser = jwt(1, { role: 'user' });
const tokAdmin = jwt(2, { role: 'admin' });
db.prepare("INSERT INTO users (id, username, email, password_hash, role, display_name, plan) VALUES (1,'smokeu','smokeu@x.vn','x','user','Smoke User','ultimate')").run();
db.prepare("INSERT INTO users (id, username, email, password_hash, role, display_name, plan) VALUES (2,'smokea','smokea@x.vn','x','admin','Smoke Admin','ultimate')").run();
const insSess = db.prepare("INSERT INTO sessions (user_id, token, expires_at, user_agent, created_at) VALUES (?, ?, ?, 'smoke', CURRENT_TIMESTAMP)");
insSess.run(1, tokUser, Date.now() + 3600_000);
insSess.run(2, tokAdmin, Date.now() + 3600_000);

// ============ A. Mã chia sẻ phim (movie_share_codes) ============
console.log('\nA. Share codes / movie');
{
  // auth-lim 20/h, code 6 ký tự, hết hạn 10 phút
  const r = await call('POST', '/api/codes', { token: tokUser, body: { kind: 'movie', media_type: 'movie', tmdb_id: 12345, season: 0, episode: 0 } });
  check('POST /api/codes tạo mã movie', r.status === 200 && /^[A-Z0-9]{6}$/.test(r.j?.code || ''), JSON.stringify(r.j));
  const code = r.j?.code;
  if (code) {
    const g = await call('GET', `/api/codes?code=${code}`);
    check('GET /api/codes public trả đúng phim', g.status === 200 && g.j?.kind === 'movie' && Number(g.j?.tmdb_id) === 12345, JSON.stringify(g.j));
    const g2 = await call('GET', `/api/codes?code=${code}`);
    check('redeem không giới hạn (2 lần đều được)', g2.status === 200 && g2.j?.tmdb_id !== undefined, JSON.stringify(g2.j));
    const again = await call('GET', '/api/codes?code=ZZZZZZ');
    check('mã sai trả lỗi', again.status !== 200 || again.j?.error, JSON.stringify(again.j));
  }
  const bad = await call('POST', '/api/codes', { body: { kind: 'movie', tmdb_id: 1 } });
  check('POST /api/codes không auth bị chặn', bad.status === 401 || bad.status === 403, `status=${bad.status}`);
}

// ============ A2. Playlist chia sẻ (#11): tạo mã playlist từ Watchlist ============
console.log('\nA2. Share playlist code');
{
  const pl = await call('POST', '/api/codes', { token: tokUser, body: { kind: 'playlist', ttl_min: 60 * 24, payload: { title: 'Phim cuối tuần', items: [{ tmdb_id: 550, media_type: 'movie', title: 'Fight Club', poster_path: '/x.jpg' }, { tmdb_id: 1399, media_type: 'tv', title: 'Game of Thrones', poster_path: '/y.jpg' }] } } });
  check('POST /api/codes kind=playlist', pl.status === 200 && /^[A-Z0-9]{6}$/.test(pl.j?.code || ''), JSON.stringify(pl.j));
  const plCode = pl.j?.code;
  if (plCode) {
    const g = await call('GET', `/api/codes?code=${plCode}`, {});
    const items = g.j?.payload?.items || [];
    check('GET playlist code trả đủ payload', g.status === 200 && g.j?.kind === 'playlist' && items.length === 2 && items.some((x) => Number(x.tmdb_id) === 550), JSON.stringify(g.j));
    const bad2 = await call('GET', '/api/codes?code=AAAAAA', {});
    check('mã sai trả lỗi', bad2.status === 404 || bad2.status === 410, JSON.stringify(bad2.j));
  }
}

// ============ B. Mã mời (#10): invite → claim → XP + ngày gói ============
console.log('\nB. Invite code + claim');
{
  const inv = await call('POST', '/api/codes', { token: tokUser, body: { kind: 'invite' } });
  check('POST /api/codes kind=invite', inv.status === 200 && /^[A-Z0-9]{6}$/.test(inv.j?.code || ''), JSON.stringify(inv.j));
  const invCode = inv.j?.code;
  const my = await call('GET', '/api/codes/my', { token: tokUser });
  check('GET /api/codes/my', my.status === 200 && Array.isArray(my.j?.codes), JSON.stringify(my.j));
  if (invCode) {
    // user thứ 3 (mới) claim
    const tokB = jwt(3, { role: 'user' });
    db.prepare("INSERT INTO users (id, username, email, password_hash, role, display_name, plan) VALUES (3,'smokeb','smokeb@x.vn','x','user','Smoke B','standard')").run();
    insSess.run(3, tokB, Date.now() + 3600_000);
    const cl = await call('POST', '/api/codes/claim', { token: tokB, body: { code: invCode } });
    check('POST /api/codes/claim tặng thưởng', cl.status === 200 && (cl.j?.success || cl.j?.rewarded || cl.j?.gift_code || cl.j?.days), JSON.stringify(cl.j));
    const again = await call('POST', '/api/codes/claim', { token: tokB, body: { code: invCode } });
    check('claim 2 lần bị chặn (1 user/code)', again.status === 200 ? !!again.j?.already : true, JSON.stringify(again.j));
  }
}

// ============ C. Xem chung (#1): party join/say/react/state/feed ============
console.log('\nC. Watch party');
{
  const room = 'party:SMOKE1';
  const j1 = await call('POST', '/api/party/join', { token: tokUser, body: { room, name: 'Smoke User', channelId: 'chn1', channelName: 'Kênh 1' } });
  check('join phòng', j1.status === 200 && (j1.j?.success || j1.j?.room), JSON.stringify(j1.j));
  const j2 = await call('POST', '/api/party/join', { token: tokAdmin, body: { room, name: 'Smoke Admin', channelId: 'chn1', channelName: 'Kênh 1' } });
  check('người 2 join', j2.status === 200, JSON.stringify(j2.j));
  const say = await call('POST', '/api/party/say', { token: tokUser, body: { room, name: 'Smoke User', text: 'Chào cả phòng 👋' } });
  check('say', say.status === 200, JSON.stringify(say.j));
  const react = await call('POST', '/api/party/react', { token: tokAdmin, body: { room, name: 'Smoke Admin', emoji: '🔥' } });
  check('react', react.status === 200, JSON.stringify(react.j));
  const st = await call('POST', '/api/party/state', { token: tokUser, body: { room, channelId: 'chn2', channelName: 'Kênh 2' } });
  check('state host đổi kênh', st.status === 200, JSON.stringify(st.j));
  const feed = await call('GET', `/api/party/feed?room=${encodeURIComponent(room)}`);
  check('feed có tin chat + thành viên', feed.status === 200 && (feed.j?.messages?.length >= 1) && (feed.j?.members?.length >= 1), JSON.stringify(feed.j));
}

// ============ D. Resume TV (#7): progress + mã 6 số ============
console.log('\nD. Movie progress + resume code');
{
  const put = await call('PUT', '/api/movie/progress', { token: tokUser, body: { tmdb_id: 999, media_type: 'tv', season: 2, episode: 5, position_sec: 1320, duration_sec: 2700 } });
  check('PUT /api/movie/progress', put.status === 200 && put.j?.success !== false, JSON.stringify(put.j));
  const got = await call('GET', '/api/movie/progress?tmdb_id=999', { token: tokUser });
  check('GET /api/movie/progress trả vị trí', got.status === 200 && Number(got.j?.items?.[0]?.position_sec) === 1320 && Number(got.j?.items?.[0]?.tmdb_id) === 999, JSON.stringify(got.j));
  const rc = await call('POST', '/api/movie/progress/code', { token: tokUser });
  check('POST /api/movie/progress/code tạo mã 6 số', rc.status === 200 && /^\d{6}$/.test(rc.j?.code || ''), JSON.stringify(rc.j));
  const code = rc.j?.code;
  if (code) {
    const res = await call('GET', `/api/resume?code=${code}`);
    check('GET /api/resume mở đúng tập/phút', res.status === 200 && Number(res.j?.item?.tmdb_id) === 999 && Number(res.j?.item?.position_sec) === 1320, JSON.stringify(res.j));
  }
}

// ============ E. Series follow (#8) + sao creator (#37) + challenge (#40) ============
console.log('\nE. Series follow / stars / weekly / challenges');
{
  const f = await call('POST', '/api/movie/series-follow', { token: tokUser, body: { tmdb_id: 10001, season: 1, episode: 3 } });
  check('POST series-follow', f.status === 200 && f.j?.success !== false && f.j?.following === true, JSON.stringify(f.j));
  const lf = await call('GET', '/api/movie/series-follow', { token: tokUser });
  check('GET series-follow (danh sách theo dõi)', lf.status === 200 && (lf.j?.follows || []).some((x) => Number(x.tmdb_id) === 10001), JSON.stringify(lf.j));
  const cnt = await call('GET', '/api/movie/series-follow/latest?tmdb_id=10001', { token: tokUser });
  check('GET series-follow/latest đếm follower', cnt.status === 200 && Number(cnt.j?.followers) >= 1, JSON.stringify(cnt.j));
  // chuẩn bị creator + short + XP để tặng sao
  db.prepare("INSERT INTO short_creator_profiles (id, user_id, handle, display_name) VALUES (5, 3, 'smokecreator', 'Smoke Creator')").run();
  db.prepare("INSERT INTO shorts (id, title, caption, video_url, status, user_id, creator_id) VALUES (77, 'Short test', 'clip', 'https://x/v.mp4', 'live', 3, 5)").run();
  db.prepare("INSERT OR IGNORE INTO user_xp (user_id, xp, watch_sec, updated_at) VALUES (1, 0, 0, 0)").run();
  db.prepare("UPDATE user_xp SET xp = MAX(xp, 1000) WHERE user_id = 1").run();
  const st = await call('POST', '/api/shorts/star', { token: tokUser, body: { short_id: 77, stars: 2 } });
  check('POST /api/shorts/star (2 sao = 100 XP)', st.status === 200 && Number(st.j?.stars) === 2 && Number(st.j?.spent_xp) === 100, JSON.stringify(st.j));
  db.prepare("UPDATE user_xp SET xp = 50 WHERE user_id = 1").run(); // giả sử người dùng chỉ còn 50 XP
  const st2 = await call('POST', '/api/shorts/star', { token: tokUser, body: { short_id: 77, stars: 5 } });
  check('tặng quá XP bị chặn (402 LOW_XP)', st2.status === 402 || st2.j?.code === 'LOW_XP', JSON.stringify(st2.j));
  const wl = await call('GET', '/api/shorts/creator/weekly', {});
  check('GET creator/weekly có creator vừa được sao', wl.status === 200 && (wl.j?.board || []).some((x) => Number(x.stars) >= 2), JSON.stringify(wl.j));
  const ch = await call('GET', '/api/challenges', {});
  check('GET /api/challenges (công khai)', ch.status === 200, JSON.stringify(ch.j));
}

// ============ E2. Bình luận gắn phút + voice-note (#9/#68) ============
console.log('\nE2. Minute comments + voice note');
{
  const c1 = await call('POST', '/api/comments', { token: tokUser, body: { target: 'movie-4242', body: 'Phân cảnh này đỉnh!', tstamp: 75 } });
  check('POST /api/comments gắn phút 75', c1.status === 200, JSON.stringify(c1.j));
  const c2 = await call('POST', '/api/comments', { token: tokUser, body: { target: 'movie-4242', body: '🎙️ Ghi chú thoại', tstamp: 120, voice_url: 'data:audio/webm;base64,SUQzBAAAAA', kind: 'voice' } });
  check('POST voice-note kèm dataURL', c2.status === 200, JSON.stringify(c2.j));
  const g = await call('GET', '/api/comments?target=movie-4242', {});
  const hasMin = (g.j?.comments || []).some(x => Number(x.tstamp) === 75);
  const hasVoice = (g.j?.comments || []).some(x => x.kind === 'voice' && String(x.voice_url || '').startsWith('data:audio'));
  check('GET comments trả tstamp + voice', g.status === 200 && hasMin && hasVoice, JSON.stringify(g.j));
}

// ============ H. Trending search (#64) + wishlist (#29) + actor follow (#65) ============
console.log('\nH. Trending / wishlist / actors');
{
  await call('POST', '/api/stats/search', { body: { q: 'Doraemon' } });
  await call('POST', '/api/stats/search', { body: { q: 'Doraemon' } });
  await call('POST', '/api/stats/search', { body: { q: 'UEFA' } });
  const tr = await call('GET', '/api/stats/trending-search?limit=10', {});
  check('trending-search xếp theo lượt', tr.status === 200 && (tr.j?.trending || []).some(x => x.query === 'Doraemon' && Number(x.cnt) >= 2), JSON.stringify(tr.j));
  const wl = await call('POST', '/api/movie/wishlist', { token: tokUser, body: { tmdb_id: 550, media_type: 'movie', want: true } });
  check('POST wishlist thêm phim', wl.status === 200 && wl.j?.wishing === true, JSON.stringify(wl.j));
  const wg = await call('GET', '/api/movie/wishlist', { token: tokUser });
  check('GET wishlist trả phim', wg.status === 200 && (wg.j?.items || []).some(x => Number(x.tmdb_id) === 550), JSON.stringify(wg.j));
  const af = await call('POST', '/api/actors/follow', { token: tokUser, body: { person_id: 18918, name: 'Dwayne Johnson', follow: true } });
  check('POST actor follow', af.status === 200 && af.j?.following === true, JSON.stringify(af.j));
  const ag = await call('GET', '/api/actors/follow', { token: tokUser });
  check('GET actor follows', ag.status === 200 && (ag.j?.follows || []).some(x => Number(x.person_id) === 18918), JSON.stringify(ag.j));
}

// ============ I. Poll phòng (#33) + team notify (#32) ============
console.log('\nI. Party polls + team notify');
{
  const mk = await call('POST', '/api/party/poll', { token: tokUser, body: { room: 'party:SMOKE1', question: 'Ai vô địch?', options: ['A', 'B', 'C'] } });
  check('POST party/poll tạo poll', mk.status === 200 && Number(mk.j?.id) > 0, JSON.stringify(mk.j));
  const pid = mk.j?.id;
  if (pid) {
    const vt = await call('POST', '/api/party/vote', { token: tokUser, body: { room: 'party:SMOKE1', poll_id: pid, option: 0 } });
    check('POST party/vote (user1)', vt.status === 200 && vt.j?.success !== false, JSON.stringify(vt.j));
    const v2 = await call('POST', '/api/party/vote', { token: tokAdmin, body: { room: 'party:SMOKE1', poll_id: pid, option: 1 } });
    check('POST party/vote (user2 khác user1)', v2.status === 200 && v2.j?.success !== false, JSON.stringify(v2.j));
    const dup = await call('POST', '/api/party/vote', { token: tokUser, body: { room: 'party:SMOKE1', poll_id: pid, option: 2 } });
    check('vote 2 lần bị chặn (ALREADY)', dup.status === 409 || dup.j?.code === 'ALREADY', JSON.stringify(dup.j));
    const pl = await call('GET', '/api/party/polls?room=party:SMOKE1', {});
    const poll = (pl.j?.polls || []).find(x => Number(x.id) === pid);
    check('GET polls có kết quả đếm', pl.status === 200 && poll && poll.total === 2 && poll.votes[0]?.count === 1 && poll.votes[1]?.count === 1, JSON.stringify(pl.j));
  }
  // team notify: người admin follow đội, user khác báo goal -> admin nhận notification vi
  const tfa = await call('POST', '/api/sports/follow', { token: tokAdmin, body: { team: 'Arsenal' } });
  check('setup follow đội Arsenal', tfa.status === 200, JSON.stringify(tfa.j));
  const nt = await call('POST', '/api/team/notify', { token: tokUser, body: { team: 'Arsenal', kind: 'goal', score: '2-1' } });
  check('POST team/notify fan-out', nt.status === 200 && Number(nt.j?.fans) >= 1, JSON.stringify(nt.j));
  const nf = await call('GET', '/api/notifications', { token: tokAdmin });
  check('fan nhận notification goal', nf.status === 200 && (nf.j?.notifications || []).some(x => String(x.body || '').includes('2-1')), JSON.stringify(nf.j));
}

// ============ F. Team follow (#32) + country top (#5) + wrapped (#84) + affiliate (#85) ============
console.log('\nF. Sports / country / wrapped / affiliates');
{
  const tf = await call('POST', '/api/sports/follow', { token: tokUser, body: { team: 'Arsenal' } });
  check('POST /api/sports/follow', tf.status === 200 && tf.j?.success !== false, JSON.stringify(tf.j));
  const tg = await call('GET', '/api/sports/follow', { token: tokUser });
  check('GET /api/sports/follow', tg.status === 200 && (tg.j?.teams || []).includes('Arsenal'), JSON.stringify(tg.j));
  const ct = await call('GET', '/api/stats/top-country', { headers: { 'cf-ipcountry': 'VN' } });
  check('GET /api/stats/top-country', ct.status === 200, JSON.stringify(ct.j));
  const wr = await call('GET', '/api/wrapped', { token: tokUser });
  check('GET /api/wrapped', wr.status === 200 && wr.j?.success !== false, JSON.stringify(wr.j));
  const af = await call('GET', '/api/affiliates', {});
  check('GET /api/affiliates (public)', af.status === 200, JSON.stringify(af.j));
}

// ============ G. Admin pack (#53/#57/#54/#56/#38/#85) ============
console.log('\nG. Admin endpoints');
{
  const rt = await call('GET', '/admin/realtime', { token: tokAdmin });
  check('GET /admin/realtime', rt.status === 200, JSON.stringify(rt.j));
  const rg = await call('GET', '/admin/regions?type=channel', { token: tokAdmin });
  check('GET /admin/regions', rg.status === 200, JSON.stringify(rg.j));
  const al = await call('GET', '/admin/alerts/rules', { token: tokAdmin });
  check('GET /admin/alerts/rules', al.status === 200, JSON.stringify(al.j));
  const fd = await call('GET', '/admin/alerts/feed', { token: tokAdmin });
  check('GET /admin/alerts/feed', fd.status === 200, JSON.stringify(fd.j));
  const mt = await call('GET', '/admin/maintenance', { token: tokAdmin });
  check('GET /admin/maintenance', mt.status === 200, JSON.stringify(mt.j));
  const cl = await call('GET', '/admin/challenges', { token: tokAdmin });
  check('GET /admin/challenges', cl.status === 200, JSON.stringify(cl.j));
  const aff = await call('GET', '/admin/affiliates', { token: tokAdmin });
  check('GET /admin/affiliates', aff.status === 200, JSON.stringify(aff.j));
  const sch = await call('GET', '/admin/scheduled?limit=5', { token: tokAdmin });
  check('GET /admin/scheduled', sch.status === 200, JSON.stringify(sch.j));
  const mk = await call('POST', '/admin/scheduled', { token: tokAdmin, body: { kind: 'broadcast', title: 'Cúp C1 đêm nay', body: 'Xem trực tiếp từ 23h', publish_at: '2099-01-01 12:00:00', end_at: '2099-01-02 12:00:00', is_active: 1 } });
  check('POST /admin/scheduled tạo bài hẹn giờ', mk.status === 200 && mk.j?.success !== false, JSON.stringify(mk.j));
  const list = await call('GET', '/admin/scheduled?limit=20', { token: tokAdmin });
  const post = (list.j?.posts || list.j?.scheduled || []).find((p) => String(p.title || '').includes('Cúp C1'));
  if (post?.id) {
    const prev = await call('POST', '/admin/scheduled/preview', { token: tokAdmin, body: { id: post.id } });
    check('POST /admin/scheduled/preview', prev.status === 200 && prev.j?.preview?.type === 'broadcast' && prev.j?.preview?.expires_at > 0, JSON.stringify(prev.j));
  } else {
    check('POST /admin/scheduled/preview (cần bài hẹn giờ)', false, 'không thấy bài vừa tạo');
  }
}

console.log(`\nKẾT QUẢ: ${pass} pass / ${fail} fail`);
if (failures.length) {
  console.log('FAILURES:');
  for (const f of failures) console.log('  -', f);
  process.exit(1);
}
