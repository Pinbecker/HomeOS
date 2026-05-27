const fs = require('fs')
const path = require('path')
const Database = require('better-sqlite3')

const dbPath = process.env.DATABASE_URL || path.join(process.cwd(), 'local-data', 'db', 'homeapp.db')
const migrationsDir = path.join(process.cwd(), 'lib', 'db', 'migrations')

fs.mkdirSync(path.dirname(dbPath), { recursive: true })

const db = new Database(dbPath)
db.pragma('journal_mode = WAL')
db.pragma('synchronous = NORMAL')
db.pragma('foreign_keys = ON')

db.exec(`
  CREATE TABLE IF NOT EXISTS __homeapp_migrations (
    name TEXT PRIMARY KEY NOT NULL,
    applied_at INTEGER NOT NULL
  )
`)

const applied = new Set(
  db.prepare('SELECT name FROM __homeapp_migrations').all().map(row => row.name)
)

const migrationFiles = fs
  .readdirSync(migrationsDir)
  .filter(file => file.endsWith('.sql'))
  .sort()

for (const file of migrationFiles) {
  if (applied.has(file)) {
    continue
  }

  const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8')
  const statements = sql
    .split('--> statement-breakpoint')
    .map(statement => statement.trim())
    .filter(Boolean)

  const applyMigration = db.transaction(() => {
    for (const statement of statements) {
      db.exec(statement)
    }
    db.prepare('INSERT INTO __homeapp_migrations (name, applied_at) VALUES (?, ?)').run(file, Date.now())
  })

  console.log(`[migrate] applying ${file}`)
  applyMigration()
}

db.close()
