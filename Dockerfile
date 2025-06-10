# ===================================================================
# 1. Development Stage ('dev')
# ===================================================================
FROM oven/bun:1.2 AS dev
WORKDIR /usr/src/app

# Fix: Install openssl for Prisma
RUN apt-get update -y && apt-get install -y openssl

# Copy package files first to leverage Docker's layer caching.
COPY package.json bun.lock ./
RUN bun install

# Copy the rest of the application source code.
COPY . .

RUN bun run db:generate

EXPOSE 3000
CMD ["bun", "run", "dev"]


# ===================================================================
# 2. Production Stage ('release')
# ===================================================================

# --- First, the 'builder' stage ---
FROM oven/bun:1.2 AS builder
WORKDIR /usr/src/app

# Fix: Install openssl for Prisma
RUN apt-get update -y && apt-get install -y openssl

COPY package.json bun.lock ./
RUN bun install

COPY . .
RUN bun run db:generate


# --- Second, the final 'release' stage ---
FROM oven/bun:1.2 AS release
WORKDIR /usr/src/app

# NOTE: We don't need to install openssl again here, because the final image
# doesn't run `prisma` commands, it only uses the pre-generated client.
# The `oven/bun` base image has the necessary runtime libraries.

COPY package.json bun.lock ./
RUN bun install --production

# Copy the necessary built artifacts from the 'builder' stage.
COPY --from=builder /usr/src/app/src ./src
COPY --from=builder /usr/src/app/prisma ./prisma
COPY --from=builder /usr/src/app/node_modules/.prisma ./node_modules/.prisma

USER bun
EXPOSE 3000
ENTRYPOINT ["bun", "src/index.ts"]