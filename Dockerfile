# Base image for building the application
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Build arguments (defaults keep local rebuilds happy)
ARG GIT_COMMIT=unknown
ARG GIT_BRANCH=unknown
ARG BUILD_TIME=unknown

# Next.js only embeds env-vars that exist *while* `next build` runs,
# so turn the build args into ENV values:
ENV NEXT_PUBLIC_GIT_COMMIT=$GIT_COMMIT \
    NEXT_PUBLIC_GIT_BRANCH=$GIT_BRANCH \
    NEXT_PUBLIC_BUILD_TIME=$BUILD_TIME

# Copy package.json and package-lock.json (if available)
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy the rest of the application code
COPY . .

COPY .docker/.env .env
# Build the application
RUN npm run build

# Production image, copy all files and run next
FROM node:20-alpine AS runner

WORKDIR /app

# Set to production environment
ENV NODE_ENV=production

# Upgrade OS packages to fix known CVEs (e.g. zlib CVE-2026-22184).
# Remove npm/npx since they are not needed at runtime — this eliminates the entire
# surface of npm-bundled CVEs (cross-spawn, glob, minimatch, tar, etc.).
RUN apk upgrade --no-cache && \
    rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack

# Add a non-root user to run the app
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy built app
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy docker-entrypoint.sh script
COPY .docker/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Switch to non-root user
USER nextjs

# Expose the port the app will run on
EXPOSE 3000

# Environment variables must be redefined at run time
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Set the entrypoint to the newly added script.
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]

# Start the application
CMD ["node", "server.js"]