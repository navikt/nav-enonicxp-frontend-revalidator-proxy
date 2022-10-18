FROM node:18-alpine

WORKDIR /app

COPY package*.json /app/
COPY node_modules /app/node_modules/
COPY src /src/

EXPOSE 3002
CMD ["npm", "run", "start"]
