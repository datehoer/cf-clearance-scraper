FROM node:20-trixie

# clark-browser (stealth Chromium) needs GLIBC >= 2.38, which trixie provides.
# System deps mirror clark-browser's own runtime image.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    tini \
    xvfb \
    libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 \
    libdbus-1-3 libdrm2 libxkbcommon0 libatspi2.0-0 libxcomposite1 \
    libxdamage1 libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 \
    libcairo2 libasound2 libx11-xcb1 libfontconfig1 libx11-6 \
    libxcb1 libxext6 libxshmfence1 \
    libglib2.0-0 libgtk-3-0 libpangocairo-1.0-0 libcairo-gobject2 \
    libgdk-pixbuf-2.0-0 libxss1 libxtst6 fonts-liberation \
    fonts-noto-color-emoji fonts-unifont fonts-freefont-ttf \
    && rm -rf /var/lib/apt/lists/*

# Download and verify the clark-browser stealth Chromium binary.
ENV CLARK_VERSION=chromium-v148.0.7778.96-stealth5 \
    CLARK_SHA256=30cca952d11d94ca3424ac184b100c88ba686bfb87f2aaf4668ac5767562bd67 \
    CLARK_DIR=/opt/clark-browser

RUN mkdir -p "$CLARK_DIR" && \
    curl -fsSL -o /tmp/clark-browser.tar.gz \
      "https://github.com/clark-labs-inc/clark-browser/releases/download/${CLARK_VERSION}/clark-browser-linux-x64.tar.gz" && \
    echo "${CLARK_SHA256}  /tmp/clark-browser.tar.gz" | sha256sum -c - && \
    tar -xzf /tmp/clark-browser.tar.gz -C "$CLARK_DIR" && \
    chmod +x "$CLARK_DIR/chrome" "$CLARK_DIR/headless_shell" && \
    rm /tmp/clark-browser.tar.gz

ENV CHROME_BIN=/opt/clark-browser/chrome
ENV CHROME_PATH=/opt/clark-browser/chrome

WORKDIR /app

COPY package*.json ./

RUN npm ci --omit=dev
COPY . .

RUN chmod 755 /app/docker-entrypoint.sh

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD ["node", "-e", "fetch('http://127.0.0.1:3000/readyz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["/app/docker-entrypoint.sh"]
