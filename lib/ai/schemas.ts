import { z } from 'zod'

export const aiConfidenceSchema = z.enum(['low', 'medium', 'high'])

export const aiPlanResultSchema = z.enum([
  'apply_actions',
  'capture_to_inbox',
  'needs_clarification',
  'unknown',
])

export const aiActionTypeSchema = z.enum([
  'create_task',
  'create_inbox_item',
  'create_note',
  'create_shopping_item',
  'clear_shopping_list',
  'create_record',
  'update_record',
  'create_reminder',
  'link_entities',
])

export const aiRecordFieldSchema = z.object({
  label: z.string(),
  value: z.string(),
})

export const aiActionSchema = z.object({
  type: aiActionTypeSchema,
  title: z.string().nullable(),
  body: z.string().nullable(),
  dueDate: z.string().nullable(),
  listName: z.string().nullable(),
  assigneeName: z.string().nullable(),
  recordId: z.string().nullable(),
  recordCategory: z.string().nullable(),
  recordTitle: z.string().nullable(),
  fields: z.array(aiRecordFieldSchema),
  reminderDate: z.string().nullable(),
  reminderMessage: z.string().nullable(),
  fromEntityId: z.string().nullable(),
  toEntityId: z.string().nullable(),
  confidence: aiConfidenceSchema,
})

export const aiPlanSchema = z.object({
  result: aiPlanResultSchema,
  response: z.string(),
  originalWording: z.string(),
  planningConfidence: aiConfidenceSchema,
  entityResolutionConfidence: aiConfidenceSchema,
  inferredTags: z.array(z.string()),
  relatedEntityIds: z.array(z.string()),
  clarificationQuestion: z.string().nullable(),
  clarificationOptions: z.array(z.string()),
  confirmationSummary: z.string().nullable(),
  actions: z.array(aiActionSchema),
})

export type AiPlan = z.infer<typeof aiPlanSchema>
export type AiAction = z.infer<typeof aiActionSchema>
export type AiConfidence = z.infer<typeof aiConfidenceSchema>

export const AI_PLAN_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'result',
    'response',
    'originalWording',
    'planningConfidence',
    'entityResolutionConfidence',
    'inferredTags',
    'relatedEntityIds',
    'clarificationQuestion',
    'clarificationOptions',
    'confirmationSummary',
    'actions',
  ],
  properties: {
    result: {
      type: 'string',
      enum: ['apply_actions', 'capture_to_inbox', 'needs_clarification', 'unknown'],
    },
    response: { type: 'string' },
    originalWording: { type: 'string' },
    planningConfidence: { type: 'string', enum: ['low', 'medium', 'high'] },
    entityResolutionConfidence: { type: 'string', enum: ['low', 'medium', 'high'] },
    inferredTags: { type: 'array', items: { type: 'string' } },
    relatedEntityIds: { type: 'array', items: { type: 'string' } },
    clarificationQuestion: { type: ['string', 'null'] },
    clarificationOptions: { type: 'array', items: { type: 'string' } },
    confirmationSummary: { type: ['string', 'null'] },
    actions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'type',
          'title',
          'body',
          'dueDate',
          'listName',
          'assigneeName',
          'recordId',
          'recordCategory',
          'recordTitle',
          'fields',
          'reminderDate',
          'reminderMessage',
          'fromEntityId',
          'toEntityId',
          'confidence',
        ],
        properties: {
          type: {
            type: 'string',
            enum: [
              'create_task',
              'create_inbox_item',
              'create_note',
              'create_shopping_item',
              'clear_shopping_list',
              'create_record',
              'update_record',
              'create_reminder',
              'link_entities',
            ],
          },
          title: { type: ['string', 'null'] },
          body: { type: ['string', 'null'] },
          dueDate: { type: ['string', 'null'] },
          listName: { type: ['string', 'null'] },
          assigneeName: { type: ['string', 'null'] },
          recordId: { type: ['string', 'null'] },
          recordCategory: { type: ['string', 'null'] },
          recordTitle: { type: ['string', 'null'] },
          fields: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['label', 'value'],
              properties: {
                label: { type: 'string' },
                value: { type: 'string' },
              },
            },
          },
          reminderDate: { type: ['string', 'null'] },
          reminderMessage: { type: ['string', 'null'] },
          fromEntityId: { type: ['string', 'null'] },
          toEntityId: { type: ['string', 'null'] },
          confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
        },
      },
    },
  },
} as const

export function makeInboxPlan(rawInput: string, response = 'I saved that to Inbox so it stays useful for later.'): AiPlan {
  return {
    result: 'capture_to_inbox',
    response,
    originalWording: rawInput,
    planningConfidence: 'medium',
    entityResolutionConfidence: 'low',
    inferredTags: [],
    relatedEntityIds: [],
    clarificationQuestion: null,
    clarificationOptions: [],
    confirmationSummary: null,
    actions: [
      {
        type: 'create_inbox_item',
        title: rawInput.length > 80 ? `${rawInput.slice(0, 77)}...` : rawInput,
        body: rawInput,
        dueDate: null,
        listName: null,
        assigneeName: null,
        recordId: null,
        recordCategory: null,
        recordTitle: null,
        fields: [],
        reminderDate: null,
        reminderMessage: null,
        fromEntityId: null,
        toEntityId: null,
        confidence: 'medium',
      },
    ],
  }
}
