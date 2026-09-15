# One image definition for every Node service: docker build --build-arg SERVICE=deal .
FROM node:20-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY packages/common/package.json packages/common/
COPY packages/db/package.json packages/db/
COPY packages/contracts/package.json packages/contracts/
COPY services/gateway/package.json services/gateway/
COPY services/user/package.json services/user/
COPY services/deal/package.json services/deal/
COPY services/payment/package.json services/payment/
COPY services/creator-data/package.json services/creator-data/
COPY services/search/package.json services/search/
COPY services/notification/package.json services/notification/
COPY services/analytics/package.json services/analytics/
COPY services/media/package.json services/media/
RUN npm ci --no-audit --no-fund

FROM deps AS build
ARG SERVICE
COPY . .
RUN npx prisma generate --schema packages/db/prisma/schema.prisma \
 && npm run build -w services/${SERVICE}

FROM node:20-bookworm-slim AS runtime
ARG SERVICE
ENV NODE_ENV=production SERVICE=${SERVICE}
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/db ./packages/db
COPY --from=build /app/services/${SERVICE}/dist ./dist
USER node
CMD ["node", "dist/index.js"]
