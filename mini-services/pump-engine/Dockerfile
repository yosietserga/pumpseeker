# PumpSeeker engine — contenedor Bun
# Modo nube: un solo puerto ($PORT) con socket.io en /engine + REST en el mismo puerto.
FROM oven/bun:1

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile || bun install

COPY index.ts ./
COPY src ./src

ENV SOCKET_PATH=/engine
EXPOSE 3003

CMD ["bun", "index.ts"]
