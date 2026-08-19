#!/bin/sh
set -eu

export XDG_CURRENT_DESKTOP=GNOME
export DESKTOP_SESSION=gnome
export LOS_ALAMOS_SMOKE_PASSWORD_STORE=gnome-libsecret

keyring_environment="$(
  printf '%s\n' "los-alamos-ci-keyring" |
    gnome-keyring-daemon --unlock --components=secrets
)"
eval "$keyring_environment"

exec xvfb-run --auto-servernum python scripts/packaged_smoke.py
