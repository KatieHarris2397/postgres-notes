# postgres-notes

A tiny notes app backed by a **standalone Postgres database**. Post short notes from a
minimal web UI; they're persisted in Postgres and listed newest-first.

The database is **not optional** — the server refuses to start without a reachable
Postgres, and it applies its own schema on first boot.

## Stack

- **Node.js / Express** — HTTP server, JSON API, and a single inline HTML page
- **[`pg`](https://node-postgres.com/)** — Postgres client (connection pool)
- **PostgreSQL** — the one hard dependency

## Requirements

- Node.js 20+
- A reachable PostgreSQL instance (16+ recommended)
- Docker (optional — the quickest way to get a local Postgres)

## Configuration

Set via environment (copy `.env.example` to `.env` for local dev):

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | **yes** | — | Postgres connection string. The app exits if it's unset. |
| `PORT` | no | `8080` | Port the HTTP server listens on (binds `0.0.0.0`). |

Example `DATABASE_URL`:

```
postgres://notes:notes@localhost:5432/notes?sslmode=disable
```

## Run locally

```bash
# 1. Start a standalone Postgres
docker run -d --name notes-pg -p 5432:5432 \
  -e POSTGRES_USER=notes -e POSTGRES_PASSWORD=notes -e POSTGRES_DB=notes \
  mirror.gcr.io/library/postgres:16-alpine

# 2. Configure and start the app
cp .env.example .env
npm install
npm start
```

Open <http://localhost:8080>.

To tear the database down again: `docker rm -f notes-pg`.

## Run with Docker

```bash
docker build -t postgres-notes .
docker run --rm -p 8080:8080 \
  -e DATABASE_URL="postgres://notes:notes@host.docker.internal:5432/notes?sslmode=disable" \
  postgres-notes
```

## API

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/` | The notes web UI (HTML). |
| `GET`  | `/healthz` | Health check — `200` with `{"status":"ok","db":"up"}` when Postgres is reachable, `503` otherwise. |
| `GET`  | `/api/notes` | List the 200 most recent notes, newest first. |
| `POST` | `/api/notes` | Add a note. Body: `{ "body": "…", "author": "…" }` (`body` required; `author` defaults to `anonymous`). |

Example:

```bash
curl -s localhost:8080/api/notes \
  -H 'content-type: application/json' \
  -d '{"author":"katie","body":"hello from curl"}'

curl -s localhost:8080/api/notes
```

## How it works

- On startup the server reads `DATABASE_URL` and opens a `pg` connection pool.
- `initDb()` waits for Postgres to accept connections (retrying, so a database that's
  still initializing doesn't crash the app), then runs an idempotent
  `CREATE TABLE IF NOT EXISTS notes (...)`.
- Only once the schema is applied does the HTTP server start listening. If the database
  can't be reached after the retries, the process exits non-zero.

Schema:

```sql
CREATE TABLE IF NOT EXISTS notes (
  id         BIGSERIAL PRIMARY KEY,
  author     TEXT        NOT NULL DEFAULT 'anonymous',
  body       TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

## Project structure

```
postgres-notes/
├── server.js        # Express app: UI + API + DB init/schema
├── package.json     # deps (express, pg) and the start script
├── Dockerfile       # node:22-alpine image, serves on :8080
├── .env.example     # DATABASE_URL + PORT
└── README.md
```

## Deploying

The app is a stateless web tier that needs a database beside it. On a container platform
that's two workloads: this app, plus a **standalone Postgres** with a persistent volume
(pass the app the in-cluster `DATABASE_URL`). For Nexlayer specifically that's a two-pod
`version: "2.0"` manifest — an `app` pod (`path: /`, port `8080`) and a `db` pod with
`resourceType: statefulset` and a `10Gi` volume mounted at `/var/lib/postgresql/data`
(with `PGDATA` in a subdirectory). No `nexlayer.yaml` is included here yet — generate one
when you're ready to ship.
