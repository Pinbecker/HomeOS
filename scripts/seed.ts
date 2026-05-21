import { ulid } from 'ulid'
import { eq } from 'drizzle-orm'
import { db } from '../lib/db/index'
import * as schema from '../lib/db/schema'
import { auth } from '../lib/auth/index'

const DAN_EMAIL    = process.env.DAN_EMAIL    ?? 'dan@home.local'
const DAN_PASSWORD = process.env.DAN_PASSWORD ?? 'changeme'
const IMOGEN_EMAIL    = process.env.IMOGEN_EMAIL    ?? 'imogen@home.local'
const IMOGEN_PASSWORD = process.env.IMOGEN_PASSWORD ?? 'changeme'

async function main() {
  const existing = await db.select().from(schema.household).limit(1)
  if (existing.length > 0) {
    console.log('Already seeded. Delete local-data/db/homeapp.db to start fresh.')
    process.exit(0)
  }

  const now = new Date()
  const householdId = ulid()

  await db.insert(schema.household).values({ id: householdId, name: "Dan & Imogen's Home", createdAt: now })
  console.log(`✓ Household: ${householdId}`)

  // better-auth handles password hashing and creates the accounts record
  const danResult = await auth.api.signUpEmail({
    body: { email: DAN_EMAIL, password: DAN_PASSWORD, name: 'Dan' },
  })
  const danId = danResult.user.id
  await db.update(schema.users).set({ role: 'owner' }).where(eq(schema.users.id, danId))
  console.log(`✓ Dan: ${DAN_EMAIL}`)

  const imogenResult = await auth.api.signUpEmail({
    body: { email: IMOGEN_EMAIL, password: IMOGEN_PASSWORD, name: 'Imogen' },
  })
  const imogenId = imogenResult.user.id
  console.log(`✓ Imogen: ${IMOGEN_EMAIL}`)

  await db.insert(schema.householdMembers).values([
    { householdId, userId: danId, role: 'owner' },
    { householdId, userId: imogenId, role: 'member' },
  ])
  console.log(`✓ Memberships`)

  await db.insert(schema.lists).values({
    id: ulid(), householdId, name: 'Shopping', type: 'shopping', icon: '🛒',
    sortOrder: 0, createdAt: now, updatedAt: now,
  })
  console.log(`✓ Shopping list`)

  await db.insert(schema.lists).values([
    { id: ulid(), householdId, name: 'Home',    type: 'tasks', color: '#34C759', sortOrder: 1, createdAt: now, updatedAt: now },
    { id: ulid(), householdId, name: 'Errands', type: 'tasks', color: '#FF9500', sortOrder: 2, createdAt: now, updatedAt: now },
  ])
  console.log(`✓ Task lists (Home, Errands)`)

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Done! Add this to your .env:

HOUSEHOLD_ID=${householdId}

Login at http://localhost:3000/login
  Dan:    ${DAN_EMAIL} / ${DAN_PASSWORD}
  Imogen: ${IMOGEN_EMAIL} / ${IMOGEN_PASSWORD}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)

  process.exit(0)
}

main().catch(err => { console.error('Seed failed:', err.message ?? err); process.exit(1) })
