FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/

# Install all dependencies (including devDependencies) to generate Prisma client
RUN npm ci

COPY . .

# Generate Prisma Client
RUN npx prisma generate

FROM node:20-alpine AS runner

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/

# Install only production dependencies
RUN npm ci --omit=dev

# Copy generated Prisma Client and source code from builder
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/src ./src

ENV PORT 8080
EXPOSE 8080

# Use a shell script or chain commands to run migrations before starting
CMD npx prisma migrate deploy && npm start
