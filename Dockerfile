# Use Node 22 base image with apt-get support
FROM node:22

# Create app directory inside the container
WORKDIR /app

# Install system dependencies (like ImageMagick)
RUN apt-get update && apt-get install -y imagemagick

# Copy everything from your project into the container
COPY . .

# Install Node dependencies
RUN npm install

# Build your TypeScript and copy assets (prompts/, public/)
RUN npm run build

# Expose the port the app will run on (important for Render)
EXPOSE 10000

# Run your server (entry point)
CMD ["npm", "start"]