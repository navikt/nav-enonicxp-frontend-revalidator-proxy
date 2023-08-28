FROM node:20-alpine

WORKDIR /app

COPY package*.json /app/
COPY node_modules /app/node_modules/
COPY src /app/src/

EXPOSE 3002
CMD ["npm", "run", "start"]
