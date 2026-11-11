FROM node:26-alpine AS build

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Lifecycle scripts stay disabled, so pnpm's bins remain shebang-less shell stubs that
# QEMU cannot execute (arm64 build). pnpm's own install.js swaps in the native binary.
RUN npm install --global --ignore-scripts "pnpm@$(node -p "require('./package.json').packageManager.split('+')[0].split('@')[1]")" \
    && node "$(npm root --global)/pnpm/install.js"

RUN pnpm install --frozen-lockfile

COPY tsconfig.json ./
COPY src ./src
RUN pnpm run build && pnpm prune --prod

FROM europe-north1-docker.pkg.dev/cgr-nav/pull-through/nav.no/node:26-slim

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

EXPOSE 3002
ENTRYPOINT ["node"]
CMD ["dist/app.js"]
