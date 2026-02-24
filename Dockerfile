FROM europe-north1-docker.pkg.dev/cgr-nav/pull-through/nav.no/node:24-slim

WORKDIR /app

COPY package*.json ./
COPY node_modules ./node_modules/
COPY src ./src/

EXPOSE 3002
ENTRYPOINT ["node"]
CMD ["src/app.js"]
