# Build stage
FROM node:22-bookworm AS builder

WORKDIR /app

# Install dependencies from the lockfile
COPY package*.json ./
RUN npm ci --no-audit --no-fund

# Copy only what the build needs (never the whole context)
COPY tsconfig.json tsup.config.ts ./
COPY src ./src

# Build the project
RUN npm run build

# Production stage
FROM node:22-bookworm

# Install current Firefox from Mozilla's official APT repository (stable
# channel). The default 'basic' tool preset needs Firefox >= 154
# (script module: 153+, screencast: 154+), which is far newer than the
# distro firefox-esr package, so the APT repo is required here.
# fontconfig/fonts keep rendered pages (screenshots, snapshots) readable.
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        curl ca-certificates gnupg fontconfig fonts-liberation && \
    curl -fsSL https://packages.mozilla.org/apt/repo-signing-key.gpg \
        | gpg --dearmor -o /usr/share/keyrings/packages.mozilla.org.gpg && \
    echo "deb [signed-by=/usr/share/keyrings/packages.mozilla.org.gpg] https://packages.mozilla.org/apt mozilla main" \
        > /etc/apt/sources.list.d/mozilla.list && \
    apt-get update && \
    apt-get install -y --no-install-recommends firefox && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Fail the build when the stable channel no longer satisfies the preset
# requirements (version numbers come from "Mozilla Firefox X.Y.Z").
RUN MAJOR=$(firefox --version | grep -oE '[0-9]+' | head -1) && \
    if [ "$MAJOR" -lt 154 ]; then \
        echo "ERROR: Firefox major version $MAJOR is older than 154, required by the default 'basic' preset (script: 153+, screencast: 154+)." && \
        exit 1; \
    fi && \
    echo "Firefox version OK: $(firefox --version)"

WORKDIR /app

# Install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

# Copy built files from the builder stage
COPY --from=builder /app/dist ./dist

# Create non-root user (with a home directory for the Firefox profile
# and saved outputs under ~/.firefox-devtools-mcp)
RUN groupadd -g 1001 -r nodejs && \
    useradd -r -g nodejs -u 1001 -m -d /home/nodejs nodejs && \
    chown -R nodejs:nodejs /app

USER nodejs

ENV NODE_ENV=production \
    HOME=/home/nodejs \
    FIREFOX_HEADLESS=true \
    TOOL_PRESET=basic \
    AUTO_PROFILE=true \
    START_URL=about:blank

# MCP server runs on stdio (no port exposure needed)
HEALTHCHECK --interval=5m --timeout=60s \
    CMD node dist/index.js --version || exit 1

# Start the MCP server
CMD ["node", "dist/index.js"]
