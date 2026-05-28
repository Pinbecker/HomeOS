import { sql } from 'drizzle-orm'
import { sqliteTable, text, integer, index, check } from 'drizzle-orm/sqlite-core'
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
  updatedAt: integer('updated_at', { mode: 'timestamp' }),
  deletedAt: integer('deleted_at', { mode: 'timestamp' }),
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
// CYCLE TRACKER — simple logged period ranges and predictions
//   Predictions are derived in the app from logged start dates.
// ============================================================

export const cycleEntries = sqliteTable('cycle_entries', {
  id: text('id').primaryKey(),
  householdId: text('household_id').notNull().references(() => household.id),
  startDate: integer('start_date', { mode: 'timestamp' }).notNull(),
  endDate: integer('end_date', { mode: 'timestamp' }),
  ovulationDate: integer('ovulation_date', { mode: 'timestamp' }),
  ovulationSource: text('ovulation_source').$type<'known'>(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
}, table => ({
  startIdx: index('cycle_entries_start_date_idx').on(table.startDate),
  dateOrderCheck: check('cycle_entries_date_order_check', sql`${table.endDate} IS NULL OR ${table.endDate} >= ${table.startDate}`),
}))

// ============================================================
// GOOGLE CALENDAR — per-user OAuth connection (tokens for the
// shared family calendar). Separate from better-auth's `accounts`
// table so the auth library doesn't treat these as login providers.
// ============================================================

export const googleCalendarConnections = sqliteTable('google_calendar_connections', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
  googleEmail: text('google_email'),
  accessToken: text('access_token'),
  // Google only returns a refresh token on first consent (access_type=offline,
  // prompt=consent). It is the long-lived credential — required.
  refreshToken: text('refresh_token').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }),
  scope: text('scope'),
  // Resolved id of the target shared calendar for this connection.
  calendarId: text('calendar_id'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

// ============================================================
// CALENDAR FEEDS — ICS/iCal subscriptions (external read-only calendars)
//   e.g. UK bank holidays, sports fixtures, school terms.
//   Each feed syncs into calendar_events with calendarId = "ics:{feedId}".
// ============================================================

export const calendarFeeds = sqliteTable('calendar_feeds', {
  id:           text('id').primaryKey(),
  householdId:  text('household_id').notNull().references(() => household.id),
  userId:       text('user_id').references(() => users.id, { onDelete: 'cascade' }),
  name:         text('name').notNull(),
  url:          text('url').notNull(),
  color:        text('color').notNull().default('#007AFF'),
  enabled:      integer('enabled', { mode: 'boolean' }).notNull().default(true),
  lastSyncedAt: integer('last_synced_at', { mode: 'timestamp' }),
  errorMessage: text('error_message'),
  createdAt:    integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt:    integer('updated_at', { mode: 'timestamp' }).notNull(),
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
// TV LISTINGS (EPG) — ingested from XMLTV feed, see lib/jobs/ingest-epg.ts
// ============================================================

export const tvChannels = sqliteTable('tv_channels', {
  id: text('id').primaryKey(),          // feed channel id, e.g. "5.uk"
  name: text('name').notNull(),         // feed display name, e.g. "5 HD"
  logo: text('logo'),                   // channel logo url
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

export const tvProgrammes = sqliteTable('tv_programmes', {
  id: text('id').primaryKey(),
  channelId: text('channel_id').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  startsAt: integer('starts_at', { mode: 'timestamp' }).notNull(),
  endsAt: integer('ends_at', { mode: 'timestamp' }).notNull(),
  iconUrl: text('icon_url'),
  episodeNum: text('episode_num'),
}, t => ({
  channelStartIdx: index('tv_prog_channel_start_idx').on(t.channelId, t.startsAt),
  startIdx: index('tv_prog_start_idx').on(t.startsAt),
}))

// ============================================================
// AI JOBS
// ============================================================

export type AiJobStatus =
  | 'captured'
  | 'planned'
  | 'needs_clarification'
  | 'applied'
  | 'rejected'
  | 'error'
export type AiInputType = 'text' | 'voice' | 'image'
export type AiSourceType =
  | 'voice'
  | 'typed_capture'
  | 'inbox_triage'
  | 'calendar_event'
  | 'notification_reply'
  | 'imported_email'
export type AiConversationStatus = 'open' | 'applied' | 'dismissed' | 'error'
export type AiConversationMessage = {
  role: 'user' | 'assistant' | 'system'
  content: string
  createdAt: string
}

export const aiJobs = sqliteTable('ai_jobs', {
  id: text('id').primaryKey(),
  householdId: text('household_id').notNull().references(() => household.id),
  createdById: text('created_by_id').notNull().references(() => users.id),
  inputType: text('input_type').$type<AiInputType>().notNull().default('text'),
  sourceType: text('source_type').$type<AiSourceType>().notNull().default('typed_capture'),
  sourceContext: text('source_context', { mode: 'json' }).$type<Record<string, unknown>>(),
  conversationId: text('conversation_id'),
  relatedEntityIds: text('related_entity_ids', { mode: 'json' }).$type<string[]>(),
  transcriptConfidence: integer('transcript_confidence'),
  rawInput: text('raw_input').notNull(),
  classification: text('classification', { mode: 'json' }).$type<Record<string, unknown>>(),
  actionsTaken: text('actions_taken', { mode: 'json' }).$type<Record<string, unknown>[]>(),
  executionResults: text('execution_results', { mode: 'json' }).$type<Record<string, unknown>[]>(),
  finalResponse: text('final_response'),
  model: text('model'),
  rawModelOutput: text('raw_model_output'),
  status: text('status').$type<AiJobStatus>().notNull().default('captured'),
  reviewedById: text('reviewed_by_id').references(() => users.id),
  reviewedAt: integer('reviewed_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

export const aiConversations = sqliteTable('ai_conversations', {
  id: text('id').primaryKey(),
  householdId: text('household_id').notNull().references(() => household.id),
  createdById: text('created_by_id').notNull().references(() => users.id),
  originJobId: text('origin_job_id').references(() => aiJobs.id, { onDelete: 'set null' }),
  originItemId: text('origin_item_id').references(() => items.id, { onDelete: 'set null' }),
  status: text('status').$type<AiConversationStatus>().notNull().default('open'),
  messages: text('messages', { mode: 'json' }).$type<AiConversationMessage[]>().notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

// ============================================================
// PUSH SUBSCRIPTIONS
// ============================================================

export const pushSubscriptions = sqliteTable('push_subscriptions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  endpoint: text('endpoint').notNull().unique(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
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
// SYNC
// ============================================================

export const syncChanges = sqliteTable('sync_changes', {
  version: integer('version').primaryKey({ autoIncrement: true }),
  householdId: text('household_id').references(() => household.id),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  operation: text('operation', { enum: ['upsert', 'delete'] }).notNull(),
  payload: text('payload', { mode: 'json' }).$type<Record<string, unknown> | null>(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
}, table => ({
  entityIdx: index('sync_changes_entity_idx').on(table.entityType, table.entityId),
  householdIdx: index('sync_changes_household_idx').on(table.householdId, table.version),
}))

export const appliedMutations = sqliteTable('applied_mutations', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id),
  deviceId: text('device_id'),
  mutationName: text('mutation_name').notNull(),
  mutationBody: text('mutation_body', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
  resultBody: text('result_body', { mode: 'json' }).$type<Record<string, unknown> | null>(),
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
