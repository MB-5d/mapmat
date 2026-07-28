FROM mcr.microsoft.com/playwright:v1.57.0-noble

WORKDIR /app

ENV NODE_ENV=production
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

COPY package*.json ./
RUN npm ci --omit=dev
RUN npx playwright install --with-deps chromium
RUN node -e "const { chromium } = require('playwright'); const fs = require('fs'); const p = chromium.executablePath(); if (!fs.existsSync(p)) throw new Error('Missing Playwright Chromium: ' + p); console.log('Playwright Chromium ready:', p)"

COPY . .

EXPOSE 4002

CMD ["node", "server.js"]
