#!/bin/bash
set -euo pipefail

release_dir="${1:-release}"
output_dir="${LOS_ALAMOS_NOTARIZATION_OUTPUT:-$release_dir/notarization}"

: "${APPLE_API_KEY:?APPLE_API_KEY must point to the App Store Connect .p8 key}"
: "${APPLE_API_KEY_ID:?APPLE_API_KEY_ID is required}"
: "${APPLE_API_ISSUER:?APPLE_API_ISSUER is required}"

test -f "$APPLE_API_KEY"

dmg_count="$(find "$release_dir" -maxdepth 1 -type f -name '*.dmg' | wc -l | tr -d ' ')"
if [ "$dmg_count" -ne 1 ]; then
  echo "Expected exactly one DMG in $release_dir, found $dmg_count." >&2
  exit 1
fi

dmg="$(find "$release_dir" -maxdepth 1 -type f -name '*.dmg' -print -quit)"
mkdir -p "$output_dir"

submission_log="$output_dir/dmg-notarization.json"
diagnostic_log="$output_dir/dmg-notarization-diagnostics.json"
auth_args=(
  --key "$APPLE_API_KEY"
  --key-id "$APPLE_API_KEY_ID"
  --issuer "$APPLE_API_ISSUER"
)

if ! xcrun notarytool submit "$dmg" \
  "${auth_args[@]}" \
  --wait \
  --output-format json >"$submission_log"; then
  cat "$submission_log" >&2
  exit 1
fi

status="$(plutil -extract status raw -o - "$submission_log")"
if [ "$status" != "Accepted" ]; then
  submission_id="$(plutil -extract id raw -o - "$submission_log" 2>/dev/null || true)"
  if [ -n "$submission_id" ]; then
    xcrun notarytool log \
      "${auth_args[@]}" \
      "$submission_id" \
      "$diagnostic_log" || true
  fi
  cat "$submission_log" >&2
  exit 1
fi

cat "$submission_log"
xcrun stapler staple -v "$dmg"
xcrun stapler validate -v "$dmg"
