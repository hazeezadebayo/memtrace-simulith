FROM node:20-slim
WORKDIR /app

# Dependency Step (Cached)
COPY package*.json ./
RUN apt-get update && \
    apt-get install -y python3 make g++ cmake git curl && \
    npm install && \
    rm -rf /var/lib/apt/lists/*

# Copy Code
COPY . .

ENV PORT=3106
CMD ["node", "api/memtrace_server.js"]
