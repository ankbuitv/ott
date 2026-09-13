#!/usr/bin/env bash
# ============================================================================
# Đẩy secret từ .dev.vars lên Cloudflare Workers (production).
#
#   npm run secrets:put          # cả worker chính + chrtv-license
#   npm run secrets:put -- main  # chỉ worker chính
#   npm run secrets:put -- lic   # chỉ license worker
#
# Cần đăng nhập Cloudflare trước: `npx wrangler login`
# (hoặc export CLOUDFLARE_API_TOKEN=...). Giá trị đọc từ .dev.vars — file đó
# nằm trong .gitignore nên secret không bao giờ vào git.
# ============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

VARS_FILE="${VARS_FILE:-.dev.vars}"
TARGET="${1:-all}"

if [ ! -f "$VARS_FILE" ]; then
  echo "❌ Không thấy $VARS_FILE — tạo nó theo mẫu trong README (ADMIN_MASTER_TOKEN, LICENSE_SECRET, ADMIN_SECRET)."
  exit 1
fi

read_var() {
  grep -E "^[[:space:]]*$1[[:space:]]*=" "$VARS_FILE" | tail -1 | cut -d= -f2- | tr -d '\r' | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//'
}

put() { # put <TÊN_SECRET> <GIÁ_TRỊ> [args thêm cho wrangler...]
  local name="$1" value="$2"; shift 2
  if [ -z "$value" ]; then
    echo "⏭  $name — chưa có trong $VARS_FILE, bỏ qua"
    return 0
  fi
  echo "🔑 wrangler secret put $name $*"
  printf '%s' "$value" | npx wrangler secret put "$name" "$@"
}

ADMIN_MASTER_TOKEN_V="$(read_var ADMIN_MASTER_TOKEN)"
LICENSE_SECRET_V="$(read_var LICENSE_SECRET)"
ADMIN_SECRET_V="$(read_var ADMIN_SECRET)"

if [ "$TARGET" = "all" ] || [ "$TARGET" = "main" ]; then
  echo "== Worker chính (chrtv-ott — wrangler.toml) =="
  put ADMIN_MASTER_TOKEN "$ADMIN_MASTER_TOKEN_V"
  put LICENSE_SECRET "$LICENSE_SECRET_V"
fi

if [ "$TARGET" = "all" ] || [ "$TARGET" = "lic" ]; then
  echo "== License worker (chrtv-license — wrangler.license.toml) =="
  # LICENSE_SECRET PHẢI giống hệt worker chính, không thì player không lấy được key
  put LICENSE_SECRET "$LICENSE_SECRET_V" -c wrangler.license.toml
  put ADMIN_SECRET "$ADMIN_SECRET_V" -c wrangler.license.toml
fi

echo "✅ Xong. Kiểm tra nhanh: curl -s https://license.ankb.qzz.io/health  (has_secret phải true)"
