#!/usr/bin/env bash
# Kiểm tra API logo watermark (Admin → "Logo khi phát") trên Worker local.
#   npm run dev:api          # terminal 1 (wrangler dev + D1 local)
#   bash scripts/watermark-test.sh
# Script CÓ ghi/xoá dữ liệu (site_config + channel_watermark + logo) — chỉ nhắm môi trường dev.
BASE=${BASE:-http://127.0.0.1:8787}
ADMIN_TOKEN=${ADMIN_TOKEN:-dev-only-admin-master-token-local}
AUTH="Authorization: Bearer $ADMIN_TOKEN"
CT="Content-Type: application/json"
ok=0; bad=0

chk() { # chk <mô-tả> <lệnh> <chuoi-phai-co>
  local out; out=$(eval "$2" 2>/dev/null)
  if printf '%s' "$out" | grep -qF -- "$3"; then echo "  ✅ $1"; ok=$((ok+1));
  else echo "  ❌ $1"; echo "     mong đợi chứa: $3"; echo "     nhận: $(printf '%s' "$out" | head -c 300)"; bad=$((bad+1)); fi
}
nochk() { # nochk <mô-tả> <lệnh> <chuoi-khong-duoc-co>
  local out; out=$(eval "$2" 2>/dev/null)
  if printf '%s' "$out" | grep -qF -- "$3"; then echo "  ❌ $1 (vẫn còn: $3)"; bad=$((bad+1));
  else echo "  ✅ $1"; ok=$((ok+1)); fi
}
G="$BASE/api/watermark"
L="$BASE/api/watermark/logo"
A="$BASE/admin/watermark"
POST_A="curl -s -X POST -H \"$AUTH\" -H \"$CT\""

# Chạy nhiều lần liên tiếp phải cho cùng kết quả: lưu cấu hình đang có, đưa về mặc định,
# cuối script khôi phục lại nguyên trạng.
SAVED_CFG=$(curl -s -H "$AUTH" "$A" | python3 -c 'import json,sys
d = (json.load(sys.stdin) or {}).get("config") or {}
drop = {"version", "updated_at", "logo_url", "has_custom_logo"}
print(json.dumps({k: v for k, v in d.items() if k not in drop}, ensure_ascii=False))' 2>/dev/null)
# POST /admin/watermark ở chế độ partial (chỉ đè field được gửi) nên phải gửi ĐỦ
# bộ giá trị mặc định thì mới thực sự reset được.
curl -s -X POST -H "$AUTH" -H "$CT" "$A" -d '{"enabled":1,"pos":"tr","x":50,"y":50,"size":9,"opacity":82,"margin":3,"style":"shadow","tint":"none","text":"","text_pos":"none","fit":"video","pages":{"tv":1,"player":1,"mini":0,"movie":0},"only_live":0,"hide_buffering":1,"logo_url":""}' >/dev/null 2>&1
curl -s -X POST -H "$AUTH" -H "$CT" "$A/clear-all" -d '{}' >/dev/null 2>&1   # dọn tuỳ chỉnh theo kênh còn sót

echo "== 1. mặc định =="
chk "GET /api/watermark có config"        "curl -s $G" '"logo_url":"/watermark.svg"'
chk "bật, góc trên phải, size 9"           "curl -s $G" '"pos":"tr","x":50,"y":50,"size":9,"opacity":82'
nochk "không có key thừa vào response"     "curl -s $G" '"stream_url"'

echo "== 2. cấu hình chung =="
chk "POST /admin/watermark"               "$POST_A $A -d '{\"pos\":\"bl\",\"size\":12,\"opacity\":60,\"style\":\"glass\",\"text\":\"CHRTV PLAY\",\"text_pos\":\"right\",\"margin\":5,\"only_live\":1,\"pages\":{\"tv\":1,\"player\":1,\"mini\":1,\"movie\":1}}'" '"success":true'
chk "client nhận pos mới"                  "curl -s $G" '"pos":"bl"'
chk "version (để cache-bust) đổi"          "curl -s $G" '"version":17'
chk "chuẩn hoá khoảng giá trị"             "$POST_A $A -d '{\"size\":9999,\"opacity\":-50}'" '"size":40'

echo "== 3. logo + chuyển PNG -> SVG =="
PNG=iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==
chk "server tự bọc PNG thành SVG"         "$POST_A $A/logo -d '{\"image\":\"data:image/png;base64,$PNG\",\"mime\":\"image/png\"}'" '"converted":true'
chk "logo_url đổi sang endpoint"           "curl -s $G" '"logo_url":"/api/watermark/logo'
chk "GET logo trả image/svg+xml"           "curl -s -D- -o /dev/null $L" 'image/svg+xml'
NXML=$(curl -s "$L" | grep -o 'xmlns=' | wc -l | tr -d ' ')
if [ "$NXML" = "1" ]; then echo "  ✅ đúng 1 thuộc tính xmlns (không lặp)"; ok=$((ok+1)); else echo "  ❌ xmlns lặp = $NXML"; bad=$((bad+1)); fi

echo "== 4. sanitize SVG admin upload =="
EVIL='{"svg":"<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 10 10\" onload=\"alert(1)\"><script>alert(1)</script><foreignObject><body>x</body></foreignObject><rect onclick=\"steal()\" width=\"9\" height=\"9\" fill=\"red\"/><image href=\"https://evil.test/a.png\"/><use href=\"#ok\"/></svg>"}'
chk "lưu được SVG có markup lạ"            "$POST_A $A/logo -d '$EVIL'" '"success":true'
nochk "không còn <script>"                 "curl -s $L" '<script'
nochk "không còn onload/onclick"           "curl -s $L" 'onclick='
nochk "không còn foreignObject"            "curl -s $L" 'foreignObject'
nochk "không còn link ra ngoài"            "curl -s $L" 'evil.test'
chk "còn tham chiếu nội bộ #ok"            "curl -s $L" 'href="#ok"'
chk "từ chối nội dung không phải SVG"      "$POST_A $A/logo -d '{\"svg\":\"<div>hi</div>\"}'" 'KHONG_PHAI_SVG'

echo "== 5. tuỳ chỉnh theo kênh =="
chk "đặt wm cho VTV1.vn"                   "$POST_A $A/channel -d '{\"channel_id\":\"VTV1.vn\",\"wm\":{\"pos\":\"tc\",\"size\":18,\"text\":\"KÊNH 1\"}}'" '"success":true'
chk "/api/playlist kèm wm của kênh"        "curl -s $BASE/api/playlist" '"wm":{"pos":"tc"'
chk "mode off cho VTV3.vn"                 "$POST_A $A/channel -d '{\"channel_id\":\"VTV3.vn\",\"wm\":{\"mode\":\"off\"}}'" '"success":true'
chk "playlist có mode off"                 "curl -s $BASE/api/playlist" '"wm":{"mode":"off"}'
chk "admin GET liệt kê kênh tuỳ chỉnh"     "curl -s -H \"$AUTH\" $A" '"channel_id":"VTV3.vn"'
chk "áp hàng loạt cho nhóm VTV"            "$POST_A $A/group -d '{\"group_title\":\"VTV\",\"wm\":{\"pos\":\"br\",\"size\":7}}'" '"success":true'
chk "bỏ tuỳ chỉnh VTV1.vn"                 "curl -s -X DELETE -H \"$AUTH\" -H \"$CT\" $A/channel -d '{\"channel_id\":\"VTV1.vn\"}'" '"success":true'
LIST=$(curl -s -H "$AUTH" $A)
if printf '%s' "$LIST" | grep -qF '"channel_id":"VTV1.vn"'; then echo "  ❌ VTV1.vn vẫn còn wm"; bad=$((bad+1)); else echo "  ✅ VTV1.vn đã trở lại cấu hình chung"; ok=$((ok+1)); fi
chk "wm chỉ giữ trường admin đụng tới"      "curl -s $BASE/api/playlist" '"wm":{"pos":"br","size":7}'
chk "dọn mọi tuỳ chỉnh kênh"               "$POST_A $A/clear-all -d '{}'" '"success":true'

echo "== 6. quyền + dọn dẹp =="
chk "không token -> 403"                   "curl -s -o /dev/null -w '%{http_code}' $A" '403'
chk "token sai -> 403"                      "curl -s -o /dev/null -w '%{http_code}' -H 'Authorization: Bearer sai-token' $A" '403'
chk "xoá logo upload"                      "curl -s -X DELETE -H \"$AUTH\" -H \"$CT\" $A/logo -d '{}'" '"success":true'
chk "quay về /watermark.svg"               "curl -s $G" '"logo_url":"/watermark.svg"'
chk "audit log ghi nhận watermark.save"     "curl -s -H \"$AUTH\" $BASE/admin/audit" 'watermark.save'
# khôi phục cấu hình chung như trước khi chạy
if [ -n "$SAVED_CFG" ] && [ "$SAVED_CFG" != "{}" ]; then
  TMP=$(mktemp)
  printf '%s' "$SAVED_CFG" > "$TMP"
  curl -s -X POST -H "$AUTH" -H "$CT" "$A" --data-binary "@$TMP" >/dev/null 2>&1
  rm -f "$TMP"
  echo "  ↩ đã khôi phục cấu hình watermark cũ"
fi

echo
echo "KẾT QUẢ: PASS=$ok FAIL=$bad"
[ "$bad" = "0" ] || exit 1
