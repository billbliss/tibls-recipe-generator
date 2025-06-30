# Use Node 22 base image with apt-get support
FROM node:22

# Create app directory inside the container
WORKDIR /app

# Install system dependencies (like ImageMagick)
# RUN apt-get update && apt-get install -y imagemagick

# Debug: verify ImageMagick executable path
RUN apt-get update && apt-get install -y imagemagick && \
    echo "✅ magick path: $(command -v magick)" && \
    ls -l /usr/bin/magick /usr/local/bin/magick || echo "🔍 'magick' not found in expected locations"

# Copy only package manifests first (these rarely change relative to source code)
COPY package*.json ./

# Install dependencies — this step will be cached unless package files change
RUN npm install

# Now copy the full source code (invalidates cache only if source changes)
COPY . .

# Copy assets (prompts/, public/)
COPY prompts ./prompts
COPY public ./public

# Clean old dist (important if Docker caches intermediate builds)
RUN rm -rf dist

# Build the TypeScript code into JavaScript
# This will create a dist/ directory with the compiled code
RUN npm run build

# Expose the port the app will run on (important for Render)
EXPOSE 10000

# Run your server (entry point)
CMD ["npm", "start"]