FROM node:14-alpine

# Create app directory
RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app

# Installing dependencies
COPY package*.json /usr/src/app/
RUN npm ci

# Copy app source
COPY src /usr/src/app/src/
COPY .env /usr/src/app/src/

# Start app
EXPOSE 3002
CMD ["npm", "run", "start"]
