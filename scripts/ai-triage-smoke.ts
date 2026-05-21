import assert from 'node:assert/strict'
import { aiPlanSchema, makeInboxPlan } from '../lib/ai/schemas'

const insurancePlan = aiPlanSchema.parse({
  result: 'needs_clarification',
  response: "You mentioned insurance. I'm not sure which one yet.",
  originalWording: 'Need to sort insurance',
  planningConfidence: 'high',
  entityResolutionConfidence: 'low',
  inferredTags: ['insurance'],
  relatedEntityIds: [],
  clarificationQuestion: 'Which insurance do you mean?',
  clarificationOptions: ['Home insurance', 'Car insurance', 'Pet insurance'],
  confirmationSummary: null,
  actions: [],
})

assert.equal(insurancePlan.planningConfidence, 'high')
assert.equal(insurancePlan.entityResolutionConfidence, 'low')

const inboxPlan = makeInboxPlan('Need to remember before Centre Parcs... chargers... and swimming stuff...')
assert.equal(inboxPlan.result, 'capture_to_inbox')
assert.equal(inboxPlan.originalWording.includes('Centre Parcs'), true)

const taskPlan = aiPlanSchema.parse({
  result: 'apply_actions',
  response: 'I made a task for that.',
  originalWording: 'Add NI number for Dan',
  planningConfidence: 'high',
  entityResolutionConfidence: 'medium',
  inferredTags: ['identity'],
  relatedEntityIds: [],
  clarificationQuestion: null,
  clarificationOptions: [],
  confirmationSummary: null,
  actions: [{
    type: 'update_record',
    title: null,
    body: null,
    dueDate: null,
    listName: null,
    assigneeName: null,
    recordId: 'rec_123',
    recordCategory: 'identity',
    recordTitle: 'Dan',
    fields: [{ label: 'NI number', value: 'QQ 12 34 56 C' }],
    reminderDate: null,
    reminderMessage: null,
    fromEntityId: null,
    toEntityId: null,
    confidence: 'high',
  }],
})

assert.equal(taskPlan.result, 'apply_actions')
assert.equal(taskPlan.actions[0].confidence, 'high')

const shoppingClearPlan = aiPlanSchema.parse({
  result: 'apply_actions',
  response: 'I cleared the Sainsbury’s shopping list.',
  originalWording: "Clear off the Sainsbury's shopping list. All done.",
  planningConfidence: 'high',
  entityResolutionConfidence: 'high',
  inferredTags: ['shopping'],
  relatedEntityIds: [],
  clarificationQuestion: null,
  clarificationOptions: [],
  confirmationSummary: null,
  actions: [{
    type: 'clear_shopping_list',
    title: null,
    body: null,
    dueDate: null,
    listName: 'Sainsbury’s',
    assigneeName: null,
    recordId: null,
    recordCategory: null,
    recordTitle: null,
    fields: [],
    reminderDate: null,
    reminderMessage: null,
    fromEntityId: null,
    toEntityId: null,
    confidence: 'high',
  }],
})

assert.equal(shoppingClearPlan.actions[0].type, 'clear_shopping_list')

console.log('AI triage schema smoke tests passed')
