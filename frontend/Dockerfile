# hustl. frontend (Next.js standalone).
# Build context MUST be the repo root so the shared contracts are available:
#   docker build -f frontend/Dockerfile .
#   compose: build: { context: ., dockerfile: frontend/Dockerfile }
# Ignore rules: frontend/Dockerfile.dockerignore (BuildKit).

FROM node:20-bookworm-slim AS deps
WORKDIR /app/frontend
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY frontend/package.json frontend/package-lock.json ./
# postinstall runs `prisma generate` (legacy pages still use Prisma).
COPY frontend/prisma ./prisma
RUN npm ci --no-audit --no-fund

FROM deps AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY backend/packages/contracts ./backend/packages/contracts
COPY frontend ./frontend
WORKDIR /app/frontend
RUN npm run build

FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
# outputFileTracingRoot is the repo root, so the server lives under frontend/ in the bundle.
COPY --from=build --chown=node:node /app/frontend/.next/standalone ./
COPY --from=build --chown=node:node /app/frontend/.next/static ./frontend/.next/static
COPY --from=build --chown=node:node /app/frontend/public ./frontend/public
USER node
EXPOSE 3000
CMD ["node", "frontend/server.js"]
