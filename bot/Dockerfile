# O bot mantém conexão TCP persistente com a Steam, então não roda em
# serverless. Este container serve para Railway, Fly.io ou qualquer VPS.
FROM node:22-alpine

WORKDIR /app

# bzip2 descomprime a demo (~100 MB) em segundos; o descompressor em JS é reserva.
RUN apk add --no-cache bzip2

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY tsconfig.json ./
COPY src ./src

# Sem porta exposta: o bot só faz conexões de saída.
# Chamamos o binário local em vez de `npx`: o tsx é dependência de produção
# justamente para já estar na imagem — nada de baixar nada a cada boot.
CMD ["./node_modules/.bin/tsx", "src/index.ts"]
