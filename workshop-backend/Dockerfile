FROM ghcr.io/puppeteer/puppeteer:22

USER root

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY . .
RUN chown -R pptruser:pptruser /app

USER pptruser
EXPOSE 3000
CMD ["node", "src/index.js"]
