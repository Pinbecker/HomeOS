import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'
import path from 'path'
import fs from 'fs'

const dbPath = process.env.DATABASE_URL ?? path.join(process.cwd(), 'local-data', 'db', 'homeapp.db')

// Ensure directory exists
const dir = path.dirname(dbPath)
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true })
}

const sqlite = new Database(dbPath)

// Production settings
sqlite.pragma('journal_mode = WAL')
sqlite.pragma('synchronous = NORMAL')
sqlite.pragma('foreign_keys = ON')
sqlite.pragma('cache_size = -64000') // 64MB cache

export const db = drizzle(sqlite, { schema })

export type DB = typeof db
