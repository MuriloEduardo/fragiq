# O bot mantém conexão TCP persistente com a Steam, então não roda em
# serverless. Este container serve para Railway, Fly.io ou qualquer VPS.
FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY tsconfig.json ./
COPY src ./src

# Sem porta exposta: o bot só faz conexões de saída.
CMD ["npx", "tsx", "src/index.ts"]
