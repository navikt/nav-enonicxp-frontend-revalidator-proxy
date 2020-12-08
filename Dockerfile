FROM navikt/node-express:14-alpine

RUN apk --no-cache add curl

# Create app directory
RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app

# Installing dependencies
COPY package*.json /usr/src/app/
RUN npm ci

COPY src /usr/src/app/src/

# Start app
EXPOSE 3002
CMD ["npm", "run", "start"]
