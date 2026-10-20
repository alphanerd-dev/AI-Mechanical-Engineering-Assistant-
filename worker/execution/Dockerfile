FROM node:22-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --include=dev && npm cache clean --force

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production \
    EXECUTION_WORKER_MODE=drain \
    EXECUTION_WORKER_MAX_JOBS=5 \
    EXECUTION_WORKER_MAX_RUNTIME_MS=210000 \
    EXECUTION_WORKER_LEASE_SECONDS=45 \
    EXECUTION_WORKER_HEARTBEAT_MS=10000
WORKDIR /app
COPY --from=dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=dependencies --chown=node:node /app/package.json ./package.json
COPY --chown=node:node tsconfig.json ./tsconfig.json
COPY --chown=node:node src ./src
COPY --chown=node:node scripts/execution-worker.ts ./scripts/execution-worker.ts
USER node
CMD ["npm", "run", "worker:execution"]
