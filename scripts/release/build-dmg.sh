#!/usr/bin/env bash
# Đóng gói .app (đã staple) thành DMG nén kèm symlink /Applications để kéo-thả cài đặt
#
# Usage: scripts/release/build-dmg.sh <path-to-.app> [out.dmg]
set -euo pipefail
APP="${1:?usage: build-dmg.sh <path-to-.app> [out.dmg]}"
NAME="$(basename "$APP" .app)"
VER="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$APP/Contents/Info.plist")" \
  || { echo "không đọc được CFBundleShortVersionString từ $APP" >&2; exit 1; }
OUT="${2:-$(dirname "$APP")/$NAME-$VER.dmg}"
STAGE="$(mktemp -d)/$NAME"
mkdir -p "$STAGE"

echo "=== stage nội dung DMG ==="
/usr/bin/ditto "$APP" "$STAGE/$(basename "$APP")"
ln -s /Applications "$STAGE/Applications"
# Xóa com.apple.provenance để tránh hdiutil copy-helper bị EPERM trên macOS Sequoia
xattr -rd com.apple.provenance "$STAGE" 2>/dev/null || true

echo "=== hdiutil create → $OUT ==="
rm -f "$OUT"
hdiutil create -volname "$NAME" -srcfolder "$STAGE" -ov -format UDZO "$OUT"
rm -rf "$(dirname "$STAGE")"
echo "DMG: $OUT"
