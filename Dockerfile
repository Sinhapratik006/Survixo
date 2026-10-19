# Production image: builds the SPA and the API, serves both from one Node process.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/dist ./dist
COPY --from=build /app/server/dist ./server/dist
USER node
EXPOSE 8787
# Apply pending migrations, then start the API (which also serves the built SPA).
CMD ["sh", "-c", "npx prisma migrate deploy && node server/dist/index.js"]
