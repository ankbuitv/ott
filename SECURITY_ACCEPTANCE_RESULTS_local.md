==============================================================
 CHRTV ACCEPTANCE TEST — target: http://127.0.0.1:8787
==============================================================

[1] P0-A: /api/playlist công khai KHÔNG chứa token=/stream_url
  ✅ grep -c 'token=' trong /api/playlist (= 0 ≤ 0)
  ✅ grep -c 'stream_url' trong /api/playlist (= 0 ≤ 0)
  ✅ playlist trả JSON success (= true)

[2] P0-A: Admin Token Stream Engine CŨ (Ken1402@) phải fail trên cả 2 subdomain
  ⚠️ sg002-cdw039026playnow.ankb.qzz.io không reachable từ máy này — kiểm tra tay sau khi deploy
  ⚠️ sg001-cdw18826playnow.ankb.qzz.io không reachable từ máy này — kiểm tra tay sau khi deploy

[3] P0-B: /api/stream/token KHÔNG đăng nhập (chỉ X-CHRTV-Client) phải 401
  ✅ stream/token không JWT (= 401)
  ✅ stream/token không JWT (UA browser) (= 401)

[3b] P0-B: EPG yêu cầu phiên — không JWT phải 401
  ✅ /api/epg không JWT (= 401)

[4] P0-B: user FREE (gói standard) xem kênh premium phải bị chặn
  ✅ user FREE xin token kênh premium (ON_SPORTS.vn) (= PLAN_REQUIRED)
  ✅ user FREE xin token kênh VN (VTV1.vn) vẫn được (200) (= 200)

[5] P1: /api/proxy — open proxy đã khoá
  ✅ proxy example.com (= 403)
  ✅ proxy metadata IP 169.254.169.254 (= 403)
  ✅ proxy 127.0.0.1 (= 403)
  ✅ proxy 10.0.0.1 (= 403)
  ✅ proxy scheme ftp (= 403)

[6] P2: Security headers
  ✅ header strict-transport-security
  ✅ header x-frame-options
  ✅ header x-content-type-options
  ✅ header content-security-policy
  ✅ header referrer-policy
  ✅ header permissions-policy

[7] P2: CORS — origin lạ không được echo; origin allowlist thì echo
  ✅ CORS origin lạ bị chặn
  ✅ CORS echo origin cho phép

[8] P2: /auth/verify brute-force — 6 lần sai liên tiếp → khoá
  ✅ lần 6 bị khoá (khác phản hồi lần 1)
  ✅ mã đã huỷ sau khoá

[9] P0-A: /admin/* — bypass master secret cũ (JWT_SECRET trong repo) phải fail
  ✅ master-secret-cũ → 403
  ✅ /admin/stats không auth (= 403)

[10] P0-A: guest JWT — kênh FTA vẫn xem được, premium bị chặn
  ✅ lấy guest JWT
  ✅ guest xin token kênh VN (VTV1.vn) (= 200)
  ✅ guest xin token kênh premium (= PLAN_REQUIRED)
  ✅ guest đọc /api/epg (= 200)

[11] P0-A: stream token TTL + scope (kỹ thuật)
  ✅ nhận stream token (ttl=60s)
  ✅ TTL token ≤ 60s (= 60 ≤ 60)

==============================================================
 KẾT QUẢ: 31 passed, 0 failed
==============================================================
