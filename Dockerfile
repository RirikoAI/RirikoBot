FROM node:22-slim

# Install system dependencies for canvas and better-sqlite3
RUN apt-get update && apt-get install -y \
    build-essential \
    libnode108 \
    python3 \
    git \
    pkg-config \
    libcairo2-dev \
    libjpeg-dev \
    libpango1.0-dev \
    libgif-dev \
    librsvg2-dev \
    libsqlite3-dev \
    sqlite3 \
    node-gyp \
    g++ \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install project dependencies
RUN npm install && npm cache clean --force

# Copy the rest of the application
COPY . .

# Build the application
RUN npm run build

# Expose the port the app runs on
EXPOSE 3000

# Command to run the application
CMD ["sh", "-c", "npm run migration:run && npm run seed:run && npm run start:prod"]
