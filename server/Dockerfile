# syntax=docker/dockerfile:1

# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json tsconfig.json ./
RUN npm ci

COPY src/ ./src/
COPY sql/ ./sql/

RUN npm run build

# Production runtime stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/sql ./sql

EXPOSE 4000

CMD ["node", "dist/index.js"]
