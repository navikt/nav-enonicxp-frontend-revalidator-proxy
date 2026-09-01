FROM europe-north1-docker.pkg.dev/cgr-nav/pull-through/nav.no/node:24-slim

WORKDIR /app

COPY node_modules ./node_modules
COPY dist ./dist

ENV NODE_ENV=production

EXPOSE 3002
ENTRYPOINT ["node"]
CMD ["dist/app.js"]
