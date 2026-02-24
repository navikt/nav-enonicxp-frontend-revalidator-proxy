FROM europe-north1-docker.pkg.dev/cgr-nav/pull-through/nav.no/node:24-slim

WORKDIR /app

COPY package*.json /app/
COPY node_modules /app/node_modules/
COPY src /app/src/

EXPOSE 3002
CMD ["node", "src/app.js"]
