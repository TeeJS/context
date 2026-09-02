FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY . .

# pnpm deploy assembles a self-contained folder with prod deps and the
# already-built better-sqlite3 native binding, avoiding a second install
# (and the --ignore-scripts trap that left the .node file missing).
RUN corepack enable \
  && pnpm install --frozen-lockfile \
  && pnpm --filter @neuledge/context build \
  && pnpm --filter @neuledge/context deploy --prod --legacy /deploy


FROM node:22-bookworm-slim AS runtime

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build --chown=node:node /deploy ./

RUN mkdir -p /home/node/.context \
  && chown node:node /home/node/.context

ENV HOME=/home/node
ENV CONTEXT_REQUIRE_NATIVE_SQLITE=1

USER node

VOLUME ["/home/node/.context"]

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:8080/').then((response) => process.exit(response.status === 404 ? 0 : 1)).catch(() => process.exit(1))"]

CMD ["node", "dist/cli.js", "serve", "--http", "8080", "--host", "0.0.0.0"]
