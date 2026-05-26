const fs = require('node:fs')
const path = require('node:path')
const Database = require('better-sqlite3')

const source = process.env.HOME2_DB_SOURCE ?? '/var/lib/docker/volumes/homeos_db_data/_data/homeapp.db'
const destDir = process.env.HOME2_DB_DEST_DIR ?? path.resolve(process.cwd(), 'data/home2')
const dest = path.join(destDir, 'homeapp.db')

fs.mkdirSync(destDir, { recursive: true })
fs.copyFileSync(source, dest)

const db = new Database(dest)

function tableExists(name) {
  return Boolean(db.prepare("select 1 from sqlite_master where type = 'table' and name = ?").get(name))
}

function columnExists(table, column) {
  return db.prepare(`pragma table_info(${table})`).all().some(row => row.name === column)
}

if (!columnExists('list_items', 'updated_at')) {
  db.exec('ALTER TABLE `list_items` ADD `updated_at` integer;')
}

if (!columnExists('list_items', 'deleted_at')) {
  db.exec('ALTER TABLE `list_items` ADD `deleted_at` integer;')
}

if (!tableExists('sync_changes')) {
  db.exec(`
    CREATE TABLE \`sync_changes\` (
      \`version\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      \`household_id\` text,
      \`entity_type\` text NOT NULL,
      \`entity_id\` text NOT NULL,
      \`operation\` text NOT NULL,
      \`payload\` text,
      \`created_at\` integer NOT NULL,
      FOREIGN KEY (\`household_id\`) REFERENCES \`household\`(\`id\`) ON UPDATE no action ON DELETE no action
    );
  `)
  db.exec('CREATE INDEX `sync_changes_entity_idx` ON `sync_changes` (`entity_type`, `entity_id`);')
  db.exec('CREATE INDEX `sync_changes_household_idx` ON `sync_changes` (`household_id`, `version`);')
}

if (!tableExists('applied_mutations')) {
  db.exec(`
    CREATE TABLE \`applied_mutations\` (
      \`id\` text PRIMARY KEY NOT NULL,
      \`user_id\` text,
      \`device_id\` text,
      \`mutation_name\` text NOT NULL,
      \`mutation_body\` text NOT NULL,
      \`result_body\` text,
      \`created_at\` integer NOT NULL,
      FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE no action
    );
  `)
}

db.close()
console.log(`Prepared staging DB at ${dest}`)
