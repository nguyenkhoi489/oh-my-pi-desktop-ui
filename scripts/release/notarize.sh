#!/usr/bin/env bash
# Notarize .app đã ký Developer ID: zip → submit Apple → chờ → staple ticket vào .app
#
# Auth dùng keychain profile chung của team 44452PW7V3, tạo một lần bằng:
#   xcrun notarytool store-credentials ktstack-notary --apple-id you@example.com --team-id 44452PW7V3 --password APP-SPECIFIC-PW
# Usage: scripts/release/notarize.sh <path-to-.app> [keychain-profile]
set -euo pipefail
APP="${1:?usage: notarize.sh <path-to-.app> [keychain-profile]}"
PROFILE="${2:-${NOTARY_PROFILE:-ktstack-notary}}"
ZIP="$(dirname "$APP")/$(basename "$APP" .app)-notarize.zip"

echo "=== zip .app (ditto giữ nguyên chữ ký và symlink) ==="
rm -f "$ZIP"
/usr/bin/ditto -c -k --keepParent "$APP" "$ZIP"

echo "=== notarytool submit + wait (profile: $PROFILE) ==="
xcrun notarytool submit "$ZIP" --keychain-profile "$PROFILE" --wait

echo "=== staple ticket vào .app ==="
xcrun stapler staple "$APP"
xcrun stapler validate "$APP"
rm -f "$ZIP"

echo "=== Gatekeeper assessment ==="
spctl --assess --type execute -vv "$APP"
echo "NOTARIZE OK"
