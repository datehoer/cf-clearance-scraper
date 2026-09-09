#!/bin/sh
set -e

# Headed Chromium needs a display. Patchright/Playwright does not manage Xvfb
# the way puppeteer-real-browser did, so start it here before the server.
DISPLAY_NUM="${DISPLAY_NUM:-99}"
Xvfb ":${DISPLAY_NUM}" -screen 0 1920x1080x24 -nolisten tcp -ac &
export DISPLAY=":${DISPLAY_NUM}"

# Wait for the X socket so the first browser launch has a ready display.
for _ in $(seq 1 50); do
    [ -S "/tmp/.X11-unix/X${DISPLAY_NUM}" ] && break
    sleep 0.1
done

exec node src/index.js "$@"
