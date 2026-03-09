# Development Dockerfile for AI Dev Team OS
FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci

COPY gateway/package.json gateway/package-lock.json ./gateway/
RUN cd gateway && npm ci && cd ..

# Copy source (will be overridden by volume in dev)
COPY . .

# Build for production image; dev uses npm run dev
RUN npm run build
RUN cd gateway && npm run build && cd ..

EXPOSE 3000

CMD ["npm", "run", "start"]
