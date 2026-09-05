#!/usr/bin/env bash
# ============================================================================
# CHRTV OTT — KIỂM THỬ NGHIỆM THU BẢO MẬT (báo cáo 2026-09-05)
#
# Cách dùng:
#   ./scripts/acceptance-test.sh                      # test production
#   BASE=https://play.ankb.qzz.io ./scripts/acceptance-test.sh
#   BASE=http://127.0.0.1:8787 ./scripts/acceptance-test.sh   # local wrangler dev
#
# Lưu ý:
#   - Test 2 (admin Stream Engine token cũ fail) phải chạy TRỰC TIẾP trên 2
#     subdomain Stream Engine sau khi rotate — script tự chạy nếu reachable.
#   - Test 4 cần 1 tài khoản FREE thật: set FREE_EMAIL/FREE_PASS (hoặc để trống
#     để tự tạo tài khoản test mới trên server local).
# ============================================================================
set -u
BASE="${BASE:-https://play.ankb.qzz.io}"
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
PASS=0; FAIL=0

ok()   { PASS=$((PASS+1)); echo "  ✅ $1"; }
bad()  { FAIL=$((FAIL+1)); echo "  ❌ $1"; }
check_eq() { # desc expected actual
  if [ "$2" = "$3" ]; then ok "$1 (= $3)"; else bad "$1 (mong đợi: $2, thực tế: $3)"; fi
}
check_le() { # desc limit actual
  if [ "$3" -le "$2" ]; then ok "$1 (= $3 ≤ $2)"; else bad "$1 (>$2: $3)"; fi
}

echo "=============================================================="
echo " CHRTV ACCEPTANCE TEST — target: $BASE"
echo "=============================================================="

echo ""
echo "[1] P0-A: /api/playlist công khai KHÔNG chứa token=/stream_url"
PL=$(curl -s --max-time 20 "$BASE/api/playlist")
C1=$(printf '%s' "$PL" | grep -c 'token=' || true)
C2=$(printf '%s' "$PL" | grep -c 'stream_url' || true)
check_le "grep -c 'token=' trong /api/playlist" 0 "$C1"
check_le "grep -c 'stream_url' trong /api/playlist" 0 "$C2"
check_eq "playlist trả JSON success" "true" "$(printf '%s' "$PL" | sed -n 's/.*"success":\([a-z]*\).*/\1/p' | head -1)"

echo ""
echo "[2] P0-A: Admin Token Stream Engine CŨ (Ken1402@) phải fail trên cả 2 subdomain"
for H in sg002-cdw039026playnow.ankb.qzz.io sg001-cdw18826playnow.ankb.qzz.io; do
  CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 -H 'Authorization: Bearer Ken1402@' "https://$H/api/admin/config")
  case "$CODE" in
    401|403|404|407|530) ok "$H → $CODE (token cũ đã chết/không expose)";;
    000) echo "  ⚠️ $H không reachable từ máy này — kiểm tra tay sau khi deploy";;
    *) bad "$H → $CODE (VẪN CHẤP NHẬN TOKEN CŨ?!)";;
  esac
done

echo ""
echo "[3] P0-B: /api/stream/token KHÔNG đăng nhập (chỉ X-CHRTV-Client) phải 401"
CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 -H "X-CHRTV-Client: CHRTV-OTT/0.0.1" \
  "$BASE/api/stream/token?u=https%3A%2F%2Fvtv.sub.id%2Fvtv1%2Findex.m3u8")
check_eq "stream/token không JWT" "401" "$CODE"
CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 -A "$UA" "$BASE/api/stream/token?u=https%3A%2F%2Fvtv.sub.id%2Fvtv1%2Findex.m3u8")
check_eq "stream/token không JWT (UA browser)" "401" "$CODE"

echo ""
echo "[3b] P0-B: EPG yêu cầu phiên — không JWT phải 401"
CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 -A "$UA" "$BASE/api/epg")
check_eq "/api/epg không JWT" "401" "$CODE"

echo ""
echo "[4] P0-B: user FREE (gói standard) xem kênh premium phải bị chặn"
# Lấy 1 kênh VN (FTA) và 1 kênh premium từ playlist
CH_VN=$(printf '%s' "$PL" | python3 -c '
import json,sys,re
d=json.load(sys.stdin).get("data",[])
vn=[c for c in d if re.search(r"vtv|htv|thvl|truyền hình việt", (c.get("group_title","")+c.get("name","")), re.I)]
print(vn[0]["channel_id"] if vn else "")' 2>/dev/null)
CH_PREMIUM=$(printf '%s' "$PL" | python3 -c '
import json,sys,re
d=json.load(sys.stdin).get("data",[])
p=[c for c in d if not re.search(r"vtv|htv|thvl|sctv|antv|truyền hình việt|phim|movie", (c.get("group_title","")+c.get("name","")), re.I)]
print(p[0]["channel_id"] if p else "")' 2>/dev/null)

# Tạo tài khoản free (nếu chưa có)
EMAIL="${FREE_EMAIL:-free-test-$(date +%s)@chrtv-test.local}"
USERPASS="${FREE_PASS:-FreePass123!}"
REG=$(curl -s --max-time 20 -A "$UA" -H 'Content-Type: application/json' -d "{\"username\":\"${EMAIL%@*}\",\"email\":\"$EMAIL\",\"password\":\"$USERPASS\"}" "$BASE/auth/register")
DEV_CODE=$(printf '%s' "$REG" | sed -n 's/.*"devCode":"\([0-9]*\)".*/\1/p' | head -1)
if [ -n "$DEV_CODE" ]; then
  curl -s --max-time 15 -A "$UA" -H 'Content-Type: application/json' -d "{\"email\":\"$EMAIL\",\"code\":\"$DEV_CODE\"}" "$BASE/auth/verify" > /dev/null
else
  echo "  ⚠️ server đã gửi email thật (không có devCode) — dùng FREE_EMAIL/FREE_PASS với tài khoản đã verify"
fi
LOGIN=$(curl -s --max-time 15 -A "$UA" -H 'Content-Type: application/json' -d "{\"login\":\"$EMAIL\",\"password\":\"$USERPASS\"}" "$BASE/auth/login")
UTOKEN=$(printf '%s' "$LOGIN" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p' | head -1)
# Kích hoạt gói standard (free)
curl -s --max-time 15 -A "$UA" -H "Authorization: Bearer $UTOKEN" -H 'Content-Type: application/json' -d '{"plan":"standard"}' "$BASE/user/plan/activate" > /dev/null

if [ -n "$UTOKEN" ] && [ -n "$CH_PREMIUM" ]; then
  BODY=$(curl -s --max-time 15 -A "$UA" -H "Authorization: Bearer $UTOKEN" "$BASE/api/stream/token?channel=$CH_PREMIUM" || echo {})
  CODE=$(printf '%s' "$BODY" | sed -n 's/.*"error":"\([A-Z_]*\)".*/\1/p' | head -1)
  check_eq "user FREE xin token kênh premium ($CH_PREMIUM)" "PLAN_REQUIRED" "$CODE"
  if [ -n "$CH_VN" ]; then
    CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 -A "$UA" -H "Authorization: Bearer $UTOKEN" "$BASE/api/stream/token?channel=$CH_VN")
    check_eq "user FREE xin token kênh VN ($CH_VN) vẫn được (200)" "200" "$CODE"
  fi
else
  [ -z "$UTOKEN" ] && bad "không lấy được JWT user free (check đăng nhập)"
  [ -z "$CH_PREMIUM" ] && echo "  ⚠️ playlist không có kênh premium — bỏ qua sub-test"
fi

echo ""
echo "[5] P1: /api/proxy — open proxy đã khoá"
CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 -A "$UA" "$BASE/api/proxy?url=https%3A%2F%2Fexample.com%2F")
check_eq "proxy example.com" "403" "$CODE"
CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 -A "$UA" "$BASE/api/proxy?url=http%3A%2F%2F169.254.169.254%2F")
check_eq "proxy metadata IP 169.254.169.254" "403" "$CODE"
CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 -A "$UA" "$BASE/api/proxy?url=http%3A%2F%2F127.0.0.1%2F")
check_eq "proxy 127.0.0.1" "403" "$CODE"
CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 -A "$UA" "$BASE/api/proxy?url=http%3A%2F%2F10.0.0.1%2F")
check_eq "proxy 10.0.0.1" "403" "$CODE"
CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 -A "$UA" "$BASE/api/proxy?url=ftp%3A%2F%2Fexample.com%2F")
check_eq "proxy scheme ftp" "403" "$CODE"

echo ""
echo "[6] P2: Security headers"
HDRS=$(curl -sI --max-time 15 "$BASE/" 2>/dev/null || curl -sI --max-time 15 "$BASE/api/geo")
for H in strict-transport-security x-frame-options x-content-type-options content-security-policy referrer-policy permissions-policy; do
  if printf '%s' "$HDRS" | grep -qi "^$H:"; then ok "header $H"; else bad "thiếu header $H"; fi
done

echo ""
echo "[7] P2: CORS — origin lạ không được echo; origin allowlist thì echo"
CORS_BAD=$(curl -sI --max-time 15 -H 'Origin: https://evil.example.com' "$BASE/api/geo" | grep -i '^access-control-allow-origin' | tr -d '\r')
if printf '%s' "$CORS_BAD" | grep -q 'evil.example.com'; then bad "CORS echo origin lạ: $CORS_BAD"; else ok "CORS origin lạ bị chặn"; fi
CORS_OK=$(curl -sI --max-time 15 -H 'Origin: https://play.ankb.qzz.io' "$BASE/api/geo" | grep -i '^access-control-allow-origin' | tr -d '\r')
if printf '%s' "$CORS_OK" | grep -q 'play.ankb.qzz.io'; then ok "CORS echo origin cho phép"; else echo "  ℹ️ CORS allowlist test: '$CORS_OK' (khác origin production thì bỏ qua)"; fi

echo ""
echo "[8] P2: /auth/verify brute-force — 6 lần sai liên tiếp → khoá"
EMAIL_LK="lock-test-$(date +%s)@chrtv-test.local"
curl -s --max-time 15 -A "$UA" -H 'Content-Type: application/json' -d "{\"username\":\"lk$(date +%s%N | cut -c1-8)\",\"email\":\"$EMAIL_LK\",\"password\":\"LockPass123!\"}" "$BASE/auth/register" > /dev/null
R1=$(curl -s --max-time 15 -A "$UA" -H 'Content-Type: application/json' -d "{\"email\":\"$EMAIL_LK\",\"code\":\"000001\"}" "$BASE/auth/verify")
C6=""
for i in 2 3 4 5 6; do
  C6=$(curl -s --max-time 15 -A "$UA" -H 'Content-Type: application/json' -d "{\"email\":\"$EMAIL_LK\",\"code\":\"00000$i\"}" "$BASE/auth/verify")
done
if printf '%s' "$C6" | grep -q 'VERIFY_LOCKED\|khoá\|429'; then ok "lần 6 bị khoá (khác phản hồi lần 1)"; else bad "lần 6 không khoá: $C6"; fi
# Sau khi khoá, mã ĐÚNG cũng phải fail (mã đã huỷ)
R7=$(curl -s --max-time 15 -A "$UA" -H 'Content-Type: application/json' -d "{\"email\":\"$EMAIL_LK\",\"code\":\"000001\"}" "$BASE/auth/verify")
if printf '%s' "$R7" | grep -q '"success":true'; then bad "mã vẫn verify được sau khi khoá?!"; else ok "mã đã huỷ sau khoá"; fi

echo ""
echo "[9] P0-A: /admin/* — bypass master secret cũ (JWT_SECRET trong repo) phải fail"
CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 -H 'Authorization: Bearer chrtv_ott_secret_2026' "$BASE/admin/stats")
case "$CODE" in
  403|401) ok "master-secret-cũ → $CODE";;
  *) bad "master-secret-cũ → $CODE (vẫn bypass?!)";;
esac
CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$BASE/admin/stats")
check_eq "/admin/stats không auth" "403" "$CODE"

echo ""
echo "[10] P0-A: guest JWT — kênh FTA vẫn xem được, premium bị chặn"
GTOKEN=$(curl -s --max-time 15 -A "$UA" -X POST "$BASE/auth/guest" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p' | head -1)
if [ -n "$GTOKEN" ]; then
  ok "lấy guest JWT"
  if [ -n "$CH_VN" ]; then
    CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 -A "$UA" -H "Authorization: Bearer $GTOKEN" "$BASE/api/stream/token?channel=$CH_VN")
    check_eq "guest xin token kênh VN ($CH_VN)" "200" "$CODE"
  fi
  if [ -n "$CH_PREMIUM" ]; then
    CODE=$(curl -s --max-time 15 -A "$UA" -H "Authorization: Bearer $GTOKEN" "$BASE/api/stream/token?channel=$CH_PREMIUM" | sed -n 's/.*"error":"\([A-Z_]*\)".*/\1/p' | head -1)
    check_eq "guest xin token kênh premium" "PLAN_REQUIRED" "$CODE"
  fi
  CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 -A "$UA" -H "Authorization: Bearer $GTOKEN" "$BASE/api/epg")
  check_eq "guest đọc /api/epg" "200" "$CODE"
else
  bad "không lấy được guest JWT"
fi

echo ""
echo "[11] P0-A: stream token TTL + scope (kỹ thuật)"
if [ -n "$GTOKEN" ] && [ -n "$CH_VN" ]; then
  ST=$(curl -s --max-time 15 -A "$UA" -H "Authorization: Bearer $GTOKEN" "$BASE/api/stream/token?channel=$CH_VN" || echo {})
  T=$(printf '%s' "$ST" | sed -n 's/.*"t":"\([^"]*\)".*/\1/p' | head -1)
  TTL=$(printf '%s' "$ST" | sed -n 's/.*"ttl":\([0-9]*\).*/\1/p' | head -1)
  [ -n "$T" ] && ok "nhận stream token (ttl=${TTL}s)" || bad "không nhận stream token: $ST"
  check_le "TTL token ≤ 60s" 60 "${TTL:-999}"
  # scope: token của kênh này KHÔNG được dùng cho URL thư mục khác (chọn kênh khác cùng origin nếu có, không thì skip)
fi

echo ""
echo "=============================================================="
echo " KẾT QUẢ: $PASS passed, $FAIL failed"
echo "=============================================================="
[ "$FAIL" -eq 0 ]
