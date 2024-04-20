# Start your image with a node base image
# FROM node:20-alpine
# FROM node:18.12-alpine # ririkoai
FROM node:lts-bullseye

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

CMD ["sh", "-c", " \
    npm run build ; \
    TS_NODE_DEBUG=true NODE_ENV=production npm run start:watch ; \
    sleep infinity"]