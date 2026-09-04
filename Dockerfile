# postgres-notes — Node/Express app (needs a standalone Postgres via DATABASE_URL).
FROM mirror.gcr.io/library/node:22-alpine
# build-time env seeded from .env.example
ENV DATABASE_URL=postgres://notes:notes@localhost:5432/notes?sslmode=disable

WORKDIR /app

COPY package.json ./
# No lockfile committed for this sample; use npm install. Add package-lock.json
# and switch to `npm ci` for reproducible builds.
RUN npm install --legacy-peer-deps --omit=dev || (echo "=== npm-debug-log ==="; tail -n 150 /root/.npm/_logs/*.log 2>/dev/null; exit 1)

COPY . .

ENV NODE_ENV=production \
    PORT=8080
EXPOSE 8080

CMD ["node", "server.js"]
