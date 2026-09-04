// postgres-notes — a minimal notes app that REQUIRES a standalone Postgres.
//
// The database is not optional: the server refuses to start until it can reach
// Postgres and apply its schema. It retries the initial connection so it can
// come up cleanly even when the DB pod is still initializing (a common race on
// first boot of a fresh database).
import express from 'express'
import pg from 'pg'

const PORT = Number(process.env.PORT || 8080)
const DATABASE_URL = process.env.DATABASE_URL

if (!DATABASE_URL) {
  console.error('[notes] DATABASE_URL is required — this app needs a Postgres database.')
  console.error('[notes] e.g. postgres://notes:notes@localhost:5432/notes?sslmode=disable')
  process.exit(1)
}

const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 10 })

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS notes (
    id         BIGSERIAL PRIMARY KEY,
    author     TEXT        NOT NULL DEFAULT 'anonymous',
    body       TEXT        NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
`

// Wait for Postgres to accept connections, then apply the schema. Retries the
// connect step so a not-yet-ready DB doesn't crash us on startup.
async function initDb({ retries = 15, delayMs = 2000 } = {}) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await pool.query('SELECT 1')
      await pool.query(SCHEMA)
      console.log('[notes] database ready — schema applied')
      return
    } catch (err) {
      if (attempt === retries) throw err
      console.warn(`[notes] Postgres not ready (attempt ${attempt}/${retries}): ${err.code || err.message} — retrying in ${delayMs}ms`)
      await new Promise((r) => setTimeout(r, delayMs))
    }
  }
}

const app = express()
app.use(express.json())

// Liveness/readiness — reports DB reachability.
app.get('/healthz', async (_req, res) => {
  try {
    await pool.query('SELECT 1')
    res.json({ status: 'ok', db: 'up' })
  } catch {
    res.status(503).json({ status: 'unhealthy', db: 'down' })
  }
})

app.get('/api/notes', async (_req, res) => {
  const { rows } = await pool.query(
    'SELECT id, author, body, created_at FROM notes ORDER BY id DESC LIMIT 200',
  )
  res.json({ notes: rows })
})

app.post('/api/notes', async (req, res) => {
  const body = String(req.body?.body ?? '').trim()
  const author = String(req.body?.author ?? 'anonymous').trim().slice(0, 80) || 'anonymous'
  if (!body) return res.status(400).json({ error: 'body is required' })
  const { rows } = await pool.query(
    'INSERT INTO notes (author, body) VALUES ($1, $2) RETURNING id, author, body, created_at',
    [author, body.slice(0, 2000)],
  )
  res.status(201).json({ note: rows[0] })
})

app.get('/', (_req, res) => res.type('html').send(PAGE))

const PAGE = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>postgres-notes</title>
  <style>
    :root { color-scheme: light dark; }
    body { font: 16px/1.5 system-ui, sans-serif; max-width: 640px; margin: 2rem auto; padding: 0 1rem; }
    h1 { margin-bottom: .25rem; }
    form { display: grid; gap: .5rem; margin: 1rem 0 2rem; }
    input, textarea, button { font: inherit; padding: .5rem; }
    li { border-top: 1px solid #8884; padding: .6rem 0; }
    .meta { opacity: .6; font-size: .85em; }
  </style>
</head>
<body>
  <h1>📝 postgres-notes</h1>
  <p class="meta">A tiny app backed by a standalone Postgres database.</p>
  <form id="f">
    <input id="author" placeholder="your name (optional)" maxlength="80" />
    <textarea id="body" placeholder="write a note…" rows="3" required></textarea>
    <button type="submit">Add note</button>
  </form>
  <ul id="list"></ul>
  <script>
    const list = document.getElementById('list')
    async function load() {
      const { notes } = await (await fetch('/api/notes')).json()
      list.innerHTML = notes.map(n =>
        '<li><div>' + escapeHtml(n.body) + '</div><div class="meta">— ' +
        escapeHtml(n.author) + ' · ' + new Date(n.created_at).toLocaleString() + '</div></li>'
      ).join('')
    }
    function escapeHtml(s){return s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
    document.getElementById('f').addEventListener('submit', async (e) => {
      e.preventDefault()
      const body = document.getElementById('body').value
      const author = document.getElementById('author').value
      await fetch('/api/notes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ body, author }) })
      document.getElementById('body').value = ''
      load()
    })
    load()
  </script>
</body>
</html>`

initDb()
  .then(() => {
    app.listen(PORT, '0.0.0.0', () => console.log(`[notes] listening on :${PORT}`))
  })
  .catch((err) => {
    console.error('[notes] could not initialize database:', err.message)
    process.exit(1)
  })
