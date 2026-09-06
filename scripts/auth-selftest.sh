#!/usr/bin/env bash
# ============================================================================
# CHRTV — SELF-TEST LUỒNG ĐĂNG NHẬP
#
#   npm run dev:api                    # terminal 1 (Worker local + D1 giả lập)
#   bash scripts/auth-selftest.sh      # terminal 2
#   BASE=https://play.ankb.qzz.io bash scripts/auth-selftest.sh   # server thật
#
# Kiểm tra: đăng ký -> xác minh email -> đăng nhập (đúng/sai/hoa-thường) ->
#           đổi mật khẩu -> khoá tạm theo TÀI KHOẢN nhưng KHÔNG khoá lây theo IP.
# ============================================================================
set -u
BASE="${BASE:-http://127.0.0.1:8787}"
PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); echo "  ✅ $1"; }
bad() { FAIL=$((FAIL+1)); echo "  ❌ $1"; }
eq()  { if [ "$2" = "$3" ]; then ok "$1 (= $3)"; else bad "$1 (mong đợi $2, thực tế $3)"; fi; }

jqp() { python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('$1',''))" 2>/dev/null; }
post() { curl -s --max-time 20 -X POST "$BASE$1" -H 'Content-Type: application/json' -d "$2"; }
code() { curl -s --max-time 20 -o /dev/null -w '%{http_code}' -X POST "$BASE$1" -H 'Content-Type: application/json' -d "$2"; }

SUF=$(date +%s)
U1="selftest_a_$SUF"; U2="selftest_b_$SUF"
PW='SelfTest#123'

echo "=============================================================="
echo " CHRTV AUTH SELF-TEST — target: $BASE"
echo "=============================================================="

register_and_verify() { # username -> in ra devCode, hoặc "RATE_LIMITED"/"" nếu không tạo được
  local u="$1"
  local r; r=$(post /auth/register "{\"username\":\"$u\",\"email\":\"$u@example.com\",\"password\":\"$PW\"}")
  if [ "$(printf '%s' "$r" | jqp code)" = "RATE_LIMITED" ]; then echo "RATE_LIMITED"; return; fi
  local dev; dev=$(printf '%s' "$r" | jqp devCode)
  if [ -n "$dev" ]; then
    post /auth/verify "{\"email\":\"$u@example.com\",\"code\":\"$dev\"}" >/dev/null
    echo "$dev"
  else
    echo ""   # email đã gửi thật -> không có devCode, phần verify phải làm tay
  fi
}

echo ""
echo "[1] Đăng ký + xác minh email"
D1=$(register_and_verify "$U1")
D2=$(register_and_verify "$U2")
if [ "$D1" = "RATE_LIMITED" ]; then
  echo "  ⚠️  IP này đã hết hạn mức đăng ký (5 tài khoản/giờ) — chờ 1 giờ hoặc xoá bảng rate_limits ở D1 local:"
  echo "      npx wrangler d1 execute chrtv-db -c wrangler.dev.toml --local --command \"DELETE FROM rate_limits; DELETE FROM login_attempts\""
  exit 1
fi
if [ -n "$D1" ]; then ok "tạo + xác minh $U1"; else bad "không lấy được devCode (server đã bật BREVO? chạy test trên local)"; fi

echo ""
echo "[2] Đăng nhập đúng mật khẩu"
eq "login đúng" 200 "$(code /auth/login "{\"login\":\"$U1\",\"password\":\"$PW\"}")"
eq "login KHÔNG phân biệt hoa thường" 200 "$(code /auth/login "{\"login\":\"$(printf '%s' "$U1" | tr 'a-z' 'A-Z')\",\"password\":\"$PW\"}")"
eq "login bằng email" 200 "$(code /auth/login "{\"login\":\"$U1@example.com\",\"password\":\"$PW\"}")"

echo ""
echo "[3] Đăng nhập sai phải 401 (không được 200/500)"
eq "sai mật khẩu" 401 "$(code /auth/login "{\"login\":\"$U1\",\"password\":\"sai-be-bet\"}")"
eq "tài khoản không tồn tại" 401 "$(code /auth/login "{\"login\":\"khong_ton_tai_$SUF\",\"password\":\"$PW\"}")"

echo ""
echo "[4] Đổi mật khẩu rồi đăng nhập lại"
TOK=$(post /auth/login "{\"login\":\"$U1\",\"password\":\"$PW\"}" | jqp token)
NEWPW='SelfTest#456'
CH=$(curl -s --max-time 20 -X POST "$BASE/user/change-password" -H "Authorization: Bearer $TOK" \
     -H 'Content-Type: application/json' -d "{\"oldPassword\":\"$PW\",\"newPassword\":\"$NEWPW\"}" | jqp success)
eq "change-password" True "$CH"
eq "login mật khẩu MỚI" 200 "$(code /auth/login "{\"login\":\"$U1\",\"password\":\"$NEWPW\"}")"
eq "login mật khẩu CŨ phải fail" 401 "$(code /auth/login "{\"login\":\"$U1\",\"password\":\"$PW\"}")"

echo ""
echo "[5] Khoá tạm: 5 lần sai khoá TÀI KHOẢN, KHÔNG khoá lây user khác cùng IP"
for _ in 1 2 3 4 5; do code /auth/login "{\"login\":\"$U1\",\"password\":\"sai\"}" >/dev/null; done
eq "tài khoản sai nhiều -> 429" 429 "$(code /auth/login "{\"login\":\"$U1\",\"password\":\"$NEWPW\"}")"
if [ -n "$D2" ] && [ "$D2" != "RATE_LIMITED" ]; then
  eq "user khác cùng IP vẫn login được" 200 "$(code /auth/login "{\"login\":\"$U2\",\"password\":\"$PW\"}")"
else
  echo "  ⚠️  bỏ qua kiểm tra 'không khoá lây theo IP' — không tạo được tài khoản thứ 2 (hết hạn mức đăng ký/giờ)"
fi

echo ""
echo "=============================================================="
echo " KẾT QUẢ: $PASS passed, $FAIL failed"
echo "=============================================================="
[ "$FAIL" -eq 0 ]
