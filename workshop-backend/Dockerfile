FROM node:20-slim

RUN apt-get update && apt-get install -y \
    ca-certificates \
    fonts-freefont-ttf \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libxss1 \
    libxtst6 \
    --no-install-recommends \
  && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_CACHE_DIR=/app/.cache/puppeteer

RUN groupadd --system pptruser && useradd --system --gid pptruser pptruser

WORKDIR /app
COPY package.json ./
RUN node -e "\
  const p = require('./package.json');\
  ['jest','jest-environment-jsdom','jest-preset-angular','@types/jest','ts-jest'].forEach(d => delete p.devDependencies[d]);\
  require('fs').writeFileSync('./package.json', JSON.stringify(p, null, 2));"
RUN npm install --omit=dev
COPY . .
RUN chown -R pptruser:pptruser /app

USER pptruser
EXPOSE 3000
CMD ["node", "src/index.js"]
