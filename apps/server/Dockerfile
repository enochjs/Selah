# Build from the repository root: docker build -f apps/server/Dockerfile .
ARG NODE_IMAGE=node:22-alpine
FROM ${NODE_IMAGE} AS dependencies
WORKDIR /workspace
COPY package.json package-lock.json ./
COPY apps/server/package.json ./apps/server/package.json
COPY apps/app/package.json ./apps/app/package.json
COPY packages/content/package.json ./packages/content/package.json
RUN npm ci --workspace @selah/server --include-workspace-root=false --ignore-scripts

FROM dependencies AS build
COPY apps/server/ ./apps/server/
RUN npm run build --workspace @selah/server

FROM ${NODE_IMAGE} AS production-dependencies
WORKDIR /workspace
COPY package.json package-lock.json ./
COPY apps/server/package.json ./apps/server/package.json
COPY apps/app/package.json ./apps/app/package.json
COPY packages/content/package.json ./packages/content/package.json
# The shared lockfile can mark client build peers as devOptional. Omit both
# groups so that these compilers do not leak into the server runtime image.
RUN npm ci --workspace @selah/server --include-workspace-root=false --omit=dev --omit=optional --ignore-scripts

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    TZ=Asia/Shanghai \
    HOST=0.0.0.0 \
    PORT=8890
WORKDIR /app
COPY --chown=node:node --from=production-dependencies /workspace/node_modules/ ./node_modules/
COPY --chown=node:node apps/server/package.json ./apps/server/package.json
COPY --chown=node:node --from=build /workspace/apps/server/dist/ ./apps/server/dist/
COPY --chown=node:node apps/server/public/ ./apps/server/public/
COPY --chown=node:node packages/content/data/ ./packages/content/data/
COPY --chown=node:node packages/content/scripts/check-content.mjs ./packages/content/scripts/check-content.mjs
COPY --chown=node:node storage/resources/audits/ ./storage/resources/audits/
COPY --chown=node:node storage/resources/timing-overrides/ ./storage/resources/timing-overrides/
COPY --chown=node:node storage/resources/timings/ ./storage/resources/timings/
COPY LICENSE ./LICENSE
RUN mkdir -p storage/admin storage/resources/media \
    && chown -R node:node storage
USER node
EXPOSE 8890
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node --input-type=module -e "const r = await fetch('http://127.0.0.1:' + (process.env.PORT || '8890') + '/api/health', { signal: AbortSignal.timeout(4000) }); const h = await r.json(); if (!r.ok || h.status !== 'ok' || h.service !== 'selah-resource') process.exit(1)"
CMD ["node", "apps/server/dist/main.js"]
