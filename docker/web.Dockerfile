FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/types/package.json packages/types/package.json
COPY packages/config/package.json packages/config/package.json

RUN npm install

COPY . .

RUN npm run build:web

EXPOSE 3001

CMD ["sh", "-c", "cd apps/web && HOST=0.0.0.0 PORT=3001 node .output/server/index.mjs"]
