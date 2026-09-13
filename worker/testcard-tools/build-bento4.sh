#!/bin/bash
# Build Bento4 (mp4fragment/mp4dash/mp4decrypt...) cho encode-key.mjs
# Kết quả binary đặt ở /tmp/bin, source clone tại worker/testcard-tools/bento4 (không commit).
set -e
HERE="$(cd "$(dirname "$0")/.." && pwd)"          # worker/testcard-tools
B4="$HERE/bento4"
BIN="${1:-/tmp/bin}"
[ -d "$B4" ] || git clone --depth 1 https://github.com/axiomatic-systems/Bento4.git "$B4"
mkdir -p "$BIN/obj"
cd "$B4"
INC="-I Source/C++/Core -I Source/C++/Crypto -I Source/C++/MetaData -I Source/C++/Codecs -I Source/C++/System -I Source/C++/System/Posix -I Source/C++/System/StdC"
export INC
ls Source/C++/Core/*.cpp Source/C++/Crypto/*.cpp Source/C++/MetaData/*.cpp Source/C++/Codecs/*.cpp \
   Source/C++/System/Posix/*.cpp Source/C++/System/StdC/*.cpp \
 | xargs -P 8 -I{} bash -c 'g++ -O1 -w $INC -c "$1" -o "'"$BIN"'/obj/$(basename "$1").o"' _ {}
for d in Source/C++/Apps/Mp4*/; do
  src=$(basename "$d"); [ -f "$d$src.cpp" ] || continue
  bin=$(echo "$src" | tr 'A-Z' 'a-z')
  g++ -O1 -w $INC -o "$BIN/$bin" "$d$src.cpp" "$BIN"/obj/*.o -lm -lpthread 2>/dev/null || true
done
rm -rf "$BIN/obj"
echo "Xong: các tool Bento4 ở $BIN (mp4encrypt, mp4decrypt, mp4fragment, mp4dump, ...)"
