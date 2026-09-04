# postgres-notes — Node/Express app (needs a standalone Postgres via DATABASE_URL).
FROM node:22-alpine

WORKDIR /app

COPY package.json ./
# No lockfile committed for this sample; use npm install. Add package-lock.json
# and switch to `npm ci` for reproducible builds.
RUN npm install --omit=dev

COPY . .

ENV NODE_ENV=production \
    PORT=8080
EXPOSE 8080

CMD ["node", "server.js"]
