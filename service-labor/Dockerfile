FROM node:22-alpine@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2 AS deps
WORKDIR /app
COPY service-labor/package*.json ./
RUN npm ci --omit=dev

FROM node:22-alpine@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2 AS runtime
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY service-labor/ ./
COPY shared/ /shared/
USER node
EXPOSE 3002
HEALTHCHECK --interval=15s --timeout=5s --retries=5 --start-period=30s \
  CMD wget -q -O - http://localhost:3002/health || exit 1
CMD ["node", "index.js"]
