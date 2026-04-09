FROM node:20-slim AS builder
WORKDIR /app
COPY package.json ./
RUN node -e "\
  const p = require('./package.json');\
  ['jest','jest-environment-jsdom','jest-preset-angular','@types/jest','ts-jest'].forEach(d => delete p.devDependencies[d]);\
  require('fs').writeFileSync('./package.json', JSON.stringify(p, null, 2));"
RUN npm install
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist/workshop-frontend/browser /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
