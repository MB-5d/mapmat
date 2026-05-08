FROM mcr.microsoft.com/playwright:v1.57.0-noble

WORKDIR /app

ENV NODE_ENV=production
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

COPY package*.json ./
RUN npm ci --omit=dev
RUN npx playwright install chromium

COPY . .

EXPOSE 4002

CMD ["node", "server.js"]
