FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG NEXT_PUBLIC_USE_BACKEND=true
ENV NEXT_PUBLIC_USE_BACKEND=${NEXT_PUBLIC_USE_BACKEND}
RUN npm run build

FROM node:22-bookworm-slim
ARG NEXT_PUBLIC_USE_BACKEND=true
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3001 NEXT_PUBLIC_USE_BACKEND=${NEXT_PUBLIC_USE_BACKEND} USE_BACKEND=${NEXT_PUBLIC_USE_BACKEND}
WORKDIR /app
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
RUN rm -f .env .env.local .env.production .env.production.local && mkdir -p data && chown -R node:node /app
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:3001/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
