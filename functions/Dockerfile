# MAMA CARE API service — Cloud Run image.
#
#   docker build -t mamacare-api functions/
#   gcloud run deploy mamacare-api --source functions/ --region us-central1
#
# Secrets are injected by the platform (Cloud Run secrets / Secret Manager) — the
# image never contains a .env file, and `.dockerignore` keeps one out by accident.
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
# `npm ci --omit=dev` instead of copying the pruned tree keeps a clean dependency
# layer and a verified lockfile.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
USER node
EXPOSE 8080
# No HEALTHCHECK: Cloud Run probes the container itself.
CMD ["node", "dist/index.js"]
