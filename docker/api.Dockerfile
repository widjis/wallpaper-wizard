FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/types/package.json packages/types/package.json
COPY packages/config/package.json packages/config/package.json

RUN npm install

COPY . .

RUN npm run build:api

EXPOSE 3000

CMD ["npm", "run", "start", "-w", "@cwcm/api"]
