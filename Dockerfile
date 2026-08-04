FROM node:24.18.0-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

COPY package*.json ./
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && npm ci --omit=dev \
  && apt-get purge -y --auto-remove python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
RUN npx playwright install --with-deps chromium
RUN node -e "if (process.version !== 'v24.18.0') throw new Error('Unexpected Node runtime: ' + process.version)"
RUN node -e "const Database = require('better-sqlite3'); const db = new Database(':memory:'); const row = db.prepare('SELECT 1 AS ok').get(); db.close(); if (row.ok !== 1) throw new Error('better-sqlite3 smoke failed'); console.log('better-sqlite3 ready')"
RUN node -e "const { chromium } = require('playwright'); const fs = require('fs'); const p = chromium.executablePath(); if (!fs.existsSync(p)) throw new Error('Missing Playwright Chromium: ' + p); console.log('Playwright Chromium ready:', p)"

COPY . .

EXPOSE 4002

CMD ["node", "server.js"]
