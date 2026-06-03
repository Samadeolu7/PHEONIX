# Multi-stage build for React/Vite Frontend
FROM node:20.19-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
ENV NPM_CONFIG_PRODUCTION=false
RUN npm ci --include=dev

# Copy source code
COPY . .

# Build argument for API URL
ARG VITE_API_URL
ARG VITE_API_BASE_URL
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

# Build the application
RUN npm run build

# Production stage with nginx
FROM nginx:alpine

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built files from builder (Vite builds to 'dist' directory by default)
COPY --from=builder /app/dist /usr/share/nginx/html

# Expose port
EXPOSE 80

# Health check
RUN apk add --no-cache wget
HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget --quiet --tries=1 --spider http://localhost/ || exit 1

# Start nginx
CMD ["nginx", "-g", "daemon off;"]