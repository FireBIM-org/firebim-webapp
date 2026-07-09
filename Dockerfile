# Stage 1: Dependencies
FROM node:26-alpine AS deps
RUN npm install -g pnpm@10.29.3
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# Stage 2: Build
FROM node:26-alpine AS builder
RUN npm install -g pnpm@10.29.3
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY ./ ./
COPY .docker/.env .env
ENV NEXT_TELEMETRY_DISABLED=1

# Build arguments (defaults keep local rebuilds happy)
ARG GIT_COMMIT=unknown
ARG GIT_BRANCH=unknown
ARG BUILD_TIME=unknown

# Next.js only embeds env-vars that exist *while* `next build` runs,
# so turn the build args into ENV values:
ENV NEXT_PUBLIC_GIT_COMMIT=$GIT_COMMIT \
    NEXT_PUBLIC_GIT_BRANCH=$GIT_BRANCH \
    NEXT_PUBLIC_BUILD_TIME=$BUILD_TIME

RUN pnpm build

# Stage 3: Runner
FROM node:26-alpine AS runner
WORKDIR /app

# Upgrade OS packages and strip npm/corepack (not needed at runtime)
# to reduce attack surface and eliminate bundled transitive vulnerabilities
RUN apk upgrade --no-cache && \
    rm -rf /usr/local/lib/node_modules /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack

# Set to production environment
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

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
