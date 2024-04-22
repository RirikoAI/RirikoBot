# Start your image with a node base image
# FROM node:lts-bullseye
FROM node:21.6.1-bullseye-slim

# Install requirements
RUN apt-get update
RUN apt-get install build-essential libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev -y

# Dockerfile
RUN mkdir -p /opt/app
WORKDIR /opt/app
COPY package.json package-lock.json ./
RUN npm install --loglevel verbose
COPY . .
COPY .env.example ./.env
EXPOSE 3000 3100 4000

### Add TS_NODE_DEBUG=true before npm run start:watch to enable debug logs
CMD ["sh", "-c", " \
    npm run build ; \
    NODE_ENV=production npm run start:watch ; \
    sleep infinity"]