FROM node:22 AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:22 AS builder
WORKDIR /app
ENV NODE_ENV=production,MONGODB_URI="mongodb://dummyvalue:blabla@mongodb.net/consensusengine"
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22 AS runner
WORKDIR /app
ENV NODE_ENV=production,MONGODB_URI="mongodb://dummyvalue:blabla@mongodb.net/consensusengine"
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./

EXPOSE 8080
ENV PORT=8080
CMD ["npm", "start"]
