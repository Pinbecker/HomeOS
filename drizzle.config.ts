import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './packages/db/src/schema.ts',
  out: './lib/db/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? './local-data/db/homeapp.db',
  },
  verbose: true,
  strict: true,
})
