#!/bin/bash
set -euo pipefail

release_dir="${1:-release}"
output_dir="${LOS_ALAMOS_NOTARIZATION_OUTPUT:-$release_dir/notarization}"
mkdir -p "$output_dir"

find_one() {
  local description="$1"
  local pattern="$2"
  local max_depth="$3"
  local count
  local result

  count="$(find "$release_dir" -maxdepth "$max_depth" -type "$description" -name "$pattern" | wc -l | tr -d ' ')"
  if [ "$count" -ne 1 ]; then
    echo "Expected exactly one $pattern in $release_dir, found $count." >&2
    exit 1
  fi

  result="$(find "$release_dir" -maxdepth "$max_depth" -type "$description" -name "$pattern" -print -quit)"
  printf '%s\n' "$result"
}

verify_app() {
  local app="$1"
  local label="$2"
  local signature_log="$output_dir/$label-signature.txt"
  local entitlements_log="$output_dir/$label-entitlements.plist"

  codesign --verify --deep --strict --verbose=2 "$app"
  codesign --display --verbose=4 "$app" >"$signature_log" 2>&1
  cat "$signature_log"
  grep -q 'Authority=Developer ID Application:' "$signature_log"
  grep -Eq 'TeamIdentifier=[A-Z0-9]+' "$signature_log"
  grep -Eq 'flags=.*runtime' "$signature_log"

  codesign --display --entitlements :- "$app" >"$entitlements_log" 2>/dev/null
  test "$(/usr/libexec/PlistBuddy -c 'Print :com.apple.security.cs.allow-jit' "$entitlements_log")" = "true"

  xcrun stapler validate -v "$app"
  spctl --assess --type execute --verbose=4 "$app"
}

app="$(find_one d '*.app' 3)"
dmg="$(find_one f '*.dmg' 1)"
zip="$(find_one f '*.zip' 1)"

verify_app "$app" "packaged-app"

codesign --verify --strict --verbose=2 "$dmg"
codesign --display --verbose=4 "$dmg" >"$output_dir/dmg-signature.txt" 2>&1
cat "$output_dir/dmg-signature.txt"
grep -q 'Authority=Developer ID Application:' "$output_dir/dmg-signature.txt"
xcrun stapler validate -v "$dmg"
spctl --assess --type open --context context:primary-signature --verbose=4 "$dmg"

zip_extract="$(mktemp -d "$output_dir/zip.XXXXXX")"
trap 'rm -rf "$zip_extract"' EXIT
ditto -x -k "$zip" "$zip_extract"

zip_app_count="$(find "$zip_extract" -maxdepth 2 -type d -name '*.app' | wc -l | tr -d ' ')"
if [ "$zip_app_count" -ne 1 ]; then
  echo "Expected exactly one app in $zip, found $zip_app_count." >&2
  exit 1
fi

zip_app="$(find "$zip_extract" -maxdepth 2 -type d -name '*.app' -print -quit)"
verify_app "$zip_app" "zip-app"
