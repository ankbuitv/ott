#!/usr/bin/env bash
# =============================================================================
# CHRTV — Build APK/AAB cho Android TV (local, không cần GitHub Actions)
#
# Yêu cầu:
#   - Node.js 18+  (npm)
#   - JDK 17
#   - Android SDK (ANDROID_HOME) + build-tools + platform android-34/36
#   - Đã cài: npm install
#
# Cách dùng:
#   ./scripts/build-apk.sh                # build signed APK (debug keystore)
#   ./scripts/build-apk.sh --aab          # build cả App Bundle (Play Store)
#   ./scripts/build-apk.sh --apk-only     # chỉ APK, bỏ qua AAB
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

BUILD_AAB=true
BUILD_APK=true
for arg in "$@"; do
  case "$arg" in
    --aab) BUILD_AAB=true; BUILD_APK=true ;;
    --apk-only) BUILD_AAB=false ;;
  esac
done

# ---------- 1. Build web assets ----------
echo "▸ npm install..."
npm install --no-audit --no-fund

echo "▸ npm run build (Vite)..."
npm run build

# ---------- 2. Sync Capacitor -> Android ----------
echo "▸ npx cap sync android..."
npx cap sync android

# ---------- 3. Kiểm tra Android SDK ----------
if [ -z "${ANDROID_HOME:-}" ] && [ -z "${ANDROID_SDK_ROOT:-}" ]; then
  echo "❌ Chưa đặt ANDROID_HOME. Ví dụ: export ANDROID_HOME=~/Library/Android/sdk (mac) hoặc ~/Android/Sdk (linux)" >&2
  exit 1
fi
ANDROID_HOME="${ANDROID_HOME:-${ANDROID_SDK_ROOT}}"
echo "▸ Android SDK: $ANDROID_HOME"

# ---------- 4. Gradle build ----------
cd android
chmod +x gradlew

if [ "$BUILD_AAB" = true ]; then
  echo "▸ ./gradlew bundleRelease ..."
  ./gradlew bundleRelease --no-daemon
fi

if [ "$BUILD_APK" = true ]; then
  echo "▸ ./gradlew assembleRelease ..."
  ./gradlew assembleRelease --no-daemon

  APK_DIR="app/build/outputs/apk/release"
  UNSIGNED="$APK_DIR/app-release-unsigned.apk"
  SIGNED="$APK_DIR/app-release.apk"

  # Sign bằng debug keystore (đủ cho cài sideload / TV box)
  # Muốn bản chính thức: tạo keystore riêng + đổi lệnh apksigner bên dưới
  BT="${ANDROID_HOME}/build-tools/$(ls "${ANDROID_HOME}/build-tools" | sort -V | tail -1)"
  if [ ! -f debug.keystore ]; then
    keytool -genkeypair -v -keystore debug.keystore -alias androiddebugkey \
      -storepass android -keypass android -keyalg RSA -keysize 2048 -validity 10000 \
      -dname "CN=CHRTV,O=CHRTV,C=VN" 2>/dev/null || true
  fi
  if [ -f "$UNSIGNED" ]; then
    echo "▸ Signing APK (debug keystore)..."
    cp "$UNSIGNED" "$SIGNED"
    "${BT}/apksigner" sign --ks debug.keystore --ks-pass pass:android --key-pass pass:android \
      --out "$SIGNED" "$UNSIGNED"
    "${BT}/apksigner" verify "$SIGNED"
    echo ""
    echo "============================================================"
    echo "✅ APK ĐÃ SẴN SÀNG:  $(pwd)/$SIGNED"
    echo "============================================================"
  fi
fi

cd ..
echo ""
echo "Xong! Các file output:"
echo "  - APK : android/app/build/outputs/apk/release/app-release.apk"
echo "  - AAB : android/app/build/outputs/bundle/release/app-release.aab"
