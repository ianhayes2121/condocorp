# Multi-stage build — avoids Nixpacks/Nix entirely (no nixpkgs 404s, no devDeps install quirks).
FROM node:22-bookworm-slim AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY server ./server
COPY supabase ./supabase

EXPOSE 3001

CMD ["npm", "start"]
