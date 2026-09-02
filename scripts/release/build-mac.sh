#!/usr/bin/env bash
# Build OMP Agent.app đã ký Developer ID, notarize + staple, rồi đóng gói DMG kéo-thả vào /Applications
#
# Usage: scripts/release/build-mac.sh [--universal] [--skip-notarize]
#   --universal      build arm64 + x64 trong một bundle (mặc định chỉ arm64)
#   --skip-notarize  bỏ qua notarize/staple (DMG chỉ chạy sạch trên máy build)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
RELEASE_DIR="$(dirname "$0")"
cd "$ROOT"

ARCH_FLAG="--arm64"
ARCH_LABEL="arm64"
NOTARIZE=1
for arg in "$@"; do
  case "$arg" in
    --universal) ARCH_FLAG="--universal"; ARCH_LABEL="universal" ;;
    --skip-notarize) NOTARIZE=0 ;;
    *) echo "unknown flag: $arg" >&2; exit 1 ;;
  esac
done

echo "=== typecheck ==="
npx tsc --noEmit -p tsconfig.json
npx tsc --noEmit -p tsconfig.node.json

echo "=== vite build (renderer + main + preload) ==="
rm -rf dist dist-electron release
npx vite build

echo "=== electron-builder: .app đã ký ($ARCH_LABEL) ==="
npx electron-builder --mac dir "$ARCH_FLAG"

APP="$(find release -maxdepth 2 -name '*.app' -type d | head -1)"
[[ -d "$APP" ]] || { echo "không tìm thấy .app trong release/" >&2; exit 1; }
NAME="$(basename "$APP" .app)"
VER="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$APP/Contents/Info.plist")"

echo "=== codesign verify ==="
codesign --verify --deep --strict --verbose=2 "$APP"
codesign -dvv "$APP" 2>&1 | grep -E '^(Authority|TeamIdentifier|Identifier)=' | head -4

if [[ "$NOTARIZE" == 1 ]]; then
  bash "$RELEASE_DIR/notarize.sh" "$APP"
else
  echo "=== notarize bỏ qua (--skip-notarize): máy khác sẽ phải chuột phải > Open ==="
fi

DMG="release/$NAME-$VER-$ARCH_LABEL.dmg"
bash "$RELEASE_DIR/build-dmg.sh" "$APP" "$DMG"

# Ký DMG bằng đúng identity đã ký .app để Finder không cảnh báo khi mount
IDENTITY="$(codesign -dvv "$APP" 2>&1 | sed -n 's/^Authority=\(Developer ID Application:.*\)$/\1/p' | head -1)"
if [[ -n "$IDENTITY" ]]; then
  echo "=== codesign DMG ==="
  codesign --sign "$IDENTITY" --timestamp "$DMG"
  codesign --verify --verbose=2 "$DMG"
fi

echo
echo "APP: $ROOT/$APP"
echo "DMG: $ROOT/$DMG"
du -sh "$DMG"
