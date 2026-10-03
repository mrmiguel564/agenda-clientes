FROM node:20-alpine

RUN apk add --no-cache tzdata
ENV TZ=America/Santiago NODE_ENV=production

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev && npm cache clean --force

COPY . .
RUN mkdir -p public/uploads && chown -R node:node public/uploads
USER node

EXPOSE 3000
CMD ["node", "src/server.js"]
