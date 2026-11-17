# Hospardo: agenda dello studio (API + interfaccia) in un'unica immagine

# --- 1. Compila l'interfaccia React ---
FROM node:22-bookworm-slim AS web
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# --- 2. Backend con le sole dipendenze di produzione ---
FROM node:22-bookworm-slim AS api
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
COPY backend/prisma ./prisma
RUN npm ci --omit=dev && npx prisma generate
COPY backend/ ./

# --- 3. Immagine finale ---
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /app/backend
COPY --from=api /app/backend ./
COPY --from=web /app/frontend/dist /app/frontend/dist
EXPOSE 4100
# All'avvio applica eventuali aggiornamenti del database, poi avvia il server
CMD ["sh", "-c", "npx prisma migrate deploy && exec node src/index.js"]
