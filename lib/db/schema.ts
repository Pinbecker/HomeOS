import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'
import { relations } from 'drizzle-orm'

// ============================================================
// USERS & HOUSEHOLD
// ============================================================

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
  role: text('role', { enum: ['owner', 'member'] }).notNull().default('member'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  lastSeenAt: integer('last_seen_at', { mode: 'timestamp' }),
})

// better-auth stores credentials here (password hash lives in accounts.password)
export const accounts = sqliteTable('accounts', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp' }),
  refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp' }),
  scope: text('scope'),
  password: text('password'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

export const verifications = sqliteTable('verifications', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }),
  updatedAt: integer('updated_at', { mode: 'timestamp' }),
})

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
})

export const household = sqliteTable('household', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  settings: text('settings', { mode: 'json' }).$type<Record<string, unknown>>(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

export const householdMembers = sqliteTable('household_members', {
  householdId: text('household_id').notNull().references(() => household.id),
  userId: text('user_id').notNull().references(() => users.id),
  role: text('role', { enum: ['owner', 'member'] }).notNull().default('member'),
})

// ============================================================
// ITEMS — the universal entity
// ============================================================

export type ItemType =
  | 'task'
  | 'note'
  | 'inbox'
  | 'shopping_item'
  | 'watchlist_film'
  | 'watchlist_tv'
  | 'place'
  | 'gift_idea'
  | 'meal_idea'
  | 'memory'
  | 'document'
  | 'idea'
  | 'trip_idea'

export type ItemStatus = 'active' | 'completed' | 'archived' | 'snoozed'
export type ItemPriority = 'low' | 'medium' | 'high'

export const items = sqliteTable('items', {
  id: text('id').primaryKey(),
  householdId: text('household_id').notNull().references(() => household.id),
  createdById: text('created_by_id').notNull().references(() => users.id),
  assigneeId: text('assignee_id').references(() => users.id),

  type: text('type').$type<ItemType>().notNull(),
  title: text('title').notNull(),
  body: text('body'),
  status: text('status').$type<ItemStatus>().notNull().default('active'),
  priority: text('priority').$type<ItemPriority>(),

  // Categorises tasks into a list (iOS Reminders style); null = uncategorised
  listId: text('list_id').references(() => lists.id, { onDelete: 'set null' }),

  dueDate: integer('due_date', { mode: 'timestamp' }),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
  snoozedUntil: integer('snoozed_until', { mode: 'timestamp' }),

  // Type-specific fields stored as JSON
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>(),

  // Pinned to the Home feed (used by notes; pins live alongside record key-fact pins)
  pinned: integer('pinned', { mode: 'boolean' }).notNull().default(false),
  pinnedAt: integer('pinned_at', { mode: 'timestamp' }),

  // Soft delete
  deletedAt: integer('deleted_at', { mode: 'timestamp' }),

  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

// ============================================================
// LISTS (shopping, packing, etc.)
// ============================================================

export type ListType = 'shopping' | 'packing' | 'watchlist' | 'places' | 'tasks' | 'house_plans' | 'custom'

export const lists = sqliteTable('lists', {
  id: text('id').primaryKey(),
  householdId: text('household_id').notNull().references(() => household.id),
  name: text('name').notNull(),
  type: text('type').$type<ListType>().notNull().default('custom'),
  icon: text('icon'),
  color: text('color'),
  archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

export const listItems = sqliteTable('list_items', {
  id: text('id').primaryKey(),
  listId: text('list_id').notNull().references(() => lists.id, { onDelete: 'cascade' }),
  itemId: text('item_id').references(() => items.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  checked: integer('checked', { mode: 'boolean' }).notNull().default(false),
  checkedAt: integer('checked_at', { mode: 'timestamp' }),
  checkedById: text('checked_by_id').references(() => users.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

// ============================================================
// BINS
// ============================================================

export type BinColour = 'grey' | 'blue' | 'green' | 'brown' | 'black' | 'pink'
export type BinFrequency = 'weekly' | 'fortnightly_odd' | 'fortnightly_even'

export const bins = sqliteTable('bins', {
  id: text('id').primaryKey(),
  householdId: text('household_id').notNull().references(() => household.id),
  name: text('name').notNull(),
  colour: text('colour').$type<BinColour>().notNull(),
  collectionDay: integer('collection_day').notNull(), // 0=Sun, 1=Mon, ..., 6=Sat
  frequency: text('frequency').$type<BinFrequency>().notNull().default('weekly'),
  // Weeks between collections: 1=weekly, 2=fortnightly, 3=three-weekly, etc.
  intervalWeeks: integer('interval_weeks').notNull().default(1),
  // ISO date (yyyy-mm-dd) of the LAST known collection — anchors the cycle
  anchorDate: text('anchor_date'),
  notes: text('notes'),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

// ============================================================
// RECORDS — structured life-admin data (the "Life" section)
//   One row per real-world thing: a utility account, an insurance
//   policy, a vehicle, a person's IDs, a contact, etc.
//   Flexible `fields` keep each record's data structured without a
//   bespoke table per category. `renewalDate` is first-class so
//   renewals/MOTs/services can surface as reminders.
// ============================================================

export type RecordCategory =
  | 'identity'      // people: full names, NHS/NI/passport/licence, blood type
  | 'home'          // property, mortgage, boiler, council tax
  | 'utility'       // water, electricity, gas, broadband, mobile
  | 'insurance'     // home, car, breakdown, pet, life
  | 'vehicle'       // car: reg, VIN, MOT, service
  | 'contact'       // GP, dentist, employers, key contacts
  | 'subscription'  // recurring payments / bills
  | 'reference'     // wifi, router, misc household reference
  | 'pet'           // Flynn etc.

export type RecordField = { label: string; value: string }

export const records = sqliteTable('records', {
  id: text('id').primaryKey(),
  householdId: text('household_id').notNull().references(() => household.id),
  category: text('category').$type<RecordCategory>().notNull(),
  title: text('title').notNull(),         // e.g. "Home Insurance", "Octopus Energy"
  subtitle: text('subtitle'),             // e.g. provider or person
  icon: text('icon'),                     // optional emoji
  fields: text('fields', { mode: 'json' }).$type<RecordField[]>(),
  renewalDate: integer('renewal_date', { mode: 'timestamp' }),
  renewalLabel: text('renewal_label'),    // "Renews" | "MOT due" | "Service due" | ...
  notes: text('notes'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

// ============================================================
// CALENDAR EVENTS (cached from CalDAV or manual)
// ============================================================

export const calendarEvents = sqliteTable('calendar_events', {
  id: text('id').primaryKey(),
  householdId: text('household_id').notNull().references(() => household.id),
  externalId: text('external_id').unique(),
  calendarId: text('calendar_id'),
  title: text('title').notNull(),
  description: text('description'),
  location: text('location'),
  startsAt: integer('starts_at', { mode: 'timestamp' }).notNull(),
  endsAt: integer('ends_at', { mode: 'timestamp' }),
  allDay: integer('all_day', { mode: 'boolean' }).notNull().default(false),
  recurrenceRule: text('recurrence_rule'),
  rawIcal: text('raw_ical'),
  lastSyncedAt: integer('last_synced_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

// ============================================================
// PINS — cards the household pins to the home feed
//   Like sticky notes on a fridge: a quick title + optional body,
//   colour-coded. May optionally deep-link somewhere in the app.
// ============================================================

export type PinColour = 'yellow' | 'blue' | 'green' | 'pink' | 'orange' | 'purple'

export const pins = sqliteTable('pins', {
  id: text('id').primaryKey(),
  householdId: text('household_id').notNull().references(() => household.id),
  createdById: text('created_by_id').notNull().references(() => users.id),
  title: text('title').notNull(),
  body: text('body'),
  colour: text('colour').$type<PinColour>().notNull().default('yellow'),
  linkHref: text('link_href'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

// ============================================================
// REMINDERS
// ============================================================

export const reminders = sqliteTable('reminders', {
  id: text('id').primaryKey(),
  householdId: text('household_id').notNull().references(() => household.id),
  createdById: text('created_by_id').notNull().references(() => users.id),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  message: text('message'),
  triggerAt: integer('trigger_at', { mode: 'timestamp' }).notNull(),
  dispatchedAt: integer('dispatched_at', { mode: 'timestamp' }),
  dismissedAt: integer('dismissed_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

// ============================================================
// ENTITY LINKS (cross-entity relationships)
// ============================================================

export type LinkType = 'prep_for' | 'related_to' | 'mentioned_in' | 'grouped_with'

export const entityLinks = sqliteTable('entity_links', {
  id: text('id').primaryKey(),
  fromType: text('from_type').notNull(),
  fromId: text('from_id').notNull(),
  toType: text('to_type').notNull(),
  toId: text('to_id').notNull(),
  linkType: text('link_type').$type<LinkType>().notNull().default('related_to'),
  createdById: text('created_by_id').notNull().references(() => users.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

// ============================================================
// FILES
// ============================================================

export const files = sqliteTable('files', {
  id: text('id').primaryKey(),
  householdId: text('household_id').notNull().references(() => household.id),
  uploadedById: text('uploaded_by_id').notNull().references(() => users.id),
  originalName: text('original_name').notNull(),
  storagePath: text('storage_path').notNull(),
  mimeType: text('mime_type').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

export const fileAttachments = sqliteTable('file_attachments', {
  id: text('id').primaryKey(),
  fileId: text('file_id').notNull().references(() => files.id, { onDelete: 'cascade' }),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

// ============================================================
// TAGS
// ============================================================

export const tags = sqliteTable('tags', {
  id: text('id').primaryKey(),
  householdId: text('household_id').notNull().references(() => household.id),
  name: text('name').notNull(),
  color: text('color'),
})

export const itemTags = sqliteTable('item_tags', {
  itemId: text('item_id').notNull().references(() => items.id, { onDelete: 'cascade' }),
  tagId: text('tag_id').notNull().references(() => tags.id, { onDelete: 'cascade' }),
})

// ============================================================
// NOTIFICATIONS
// ============================================================

export const notifications = sqliteTable('notifications', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  body: text('body'),
  entityType: text('entity_type'),
  entityId: text('entity_id'),
  readAt: integer('read_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

// ============================================================
// AI JOBS (future — defined now, used in Phase 9)
// ============================================================

export type AiJobStatus = 'pending' | 'confirmed' | 'rejected' | 'error'
export type AiInputType = 'text' | 'voice' | 'image'

export const aiJobs = sqliteTable('ai_jobs', {
  id: text('id').primaryKey(),
  householdId: text('household_id').notNull().references(() => household.id),
  createdById: text('created_by_id').notNull().references(() => users.id),
  inputType: text('input_type').$type<AiInputType>().notNull().default('text'),
  rawInput: text('raw_input').notNull(),
  classification: text('classification', { mode: 'json' }).$type<Record<string, unknown>>(),
  actionsTaken: text('actions_taken', { mode: 'json' }).$type<Record<string, unknown>[]>(),
  status: text('status').$type<AiJobStatus>().notNull().default('pending'),
  reviewedById: text('reviewed_by_id').references(() => users.id),
  reviewedAt: integer('reviewed_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

// ============================================================
// ACTIVITY LOG
// ============================================================

export type ActivityAction =
  | 'created' | 'updated' | 'deleted' | 'completed'
  | 'restored' | 'assigned' | 'checked' | 'unchecked'

export const activityLog = sqliteTable('activity_log', {
  id: text('id').primaryKey(),
  householdId: text('household_id').notNull().references(() => household.id),
  userId: text('user_id').references(() => users.id),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  action: text('action').$type<ActivityAction>().notNull(),
  diff: text('diff', { mode: 'json' }).$type<Record<string, [unknown, unknown]>>(),
  source: text('source', { enum: ['user', 'ai', 'system', 'caldav_sync'] }).notNull().default('user'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

// ============================================================
// RELATIONS
// ============================================================

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  createdItems: many(items, { relationName: 'createdItems' }),
  assignedItems: many(items, { relationName: 'assignedItems' }),
  householdMemberships: many(householdMembers),
}))

export const itemsRelations = relations(items, ({ one, many }) => ({
  createdBy: one(users, { fields: [items.createdById], references: [users.id], relationName: 'createdItems' }),
  assignee: one(users, { fields: [items.assigneeId], references: [users.id], relationName: 'assignedItems' }),
  household: one(household, { fields: [items.householdId], references: [household.id] }),
  tags: many(itemTags),
}))

export const listsRelations = relations(lists, ({ many, one }) => ({
  items: many(listItems),
  household: one(household, { fields: [lists.householdId], references: [household.id] }),
}))

export const listItemsRelations = relations(listItems, ({ one }) => ({
  list: one(lists, { fields: [listItems.listId], references: [lists.id] }),
  checkedBy: one(users, { fields: [listItems.checkedById], references: [users.id] }),
}))
