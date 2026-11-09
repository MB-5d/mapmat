FROM node:24.18.0-bookworm-slim AS ui
WORKDIR /ui
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
ARG PILOT_ORIGIN
RUN test -n "$PILOT_ORIGIN" && \
    REACT_APP_API_BASE="$PILOT_ORIGIN" \
    REACT_APP_APP_ORIGIN="$PILOT_ORIGIN" \
    REACT_APP_MARKETING_ORIGIN="$PILOT_ORIGIN" \
    REACT_APP_SCAN_AUTH_HELPER_ORIGIN="$PILOT_ORIGIN" \
    REACT_APP_SCAN_AUTH_BROWSER_HELPER=true \
    REACT_APP_AUTHENTICATED_SCAN_ENABLED=true \
    REACT_APP_APP_ONLY_MODE=true \
    REACT_APP_ENABLE_ANALYTICS=false npm run build

FROM node:24.18.0-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
COPY package*.json ./
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ zip \
    && npm ci --omit=dev && apt-get purge -y --auto-remove python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
RUN npx playwright install --with-deps chromium
COPY . .
COPY --from=ui /ui/build ./frontend/build
EXPOSE 4002
CMD ["node", "prototype/browser-helper/run-hosted.cjs"]
