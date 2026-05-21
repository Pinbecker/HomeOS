import {
  AI_PLAN_JSON_SCHEMA,
  aiPlanSchema,
  makeInboxPlan,
  type AiPlan,
} from './schemas'
import type { AiPlanningContext } from './context'

const TRIAGE_MODEL = process.env.AI_TRIAGE_MODEL || 'gpt-5.4-mini'
const TRANSCRIBE_MODEL = process.env.AI_TRANSCRIBE_MODEL || 'gpt-4o-mini-transcribe'

const AUDIO_EXTENSION_BY_MIME: Record<string, string> = {
  'audio/flac': 'flac',
  'audio/m4a': 'm4a',
  'audio/mp4': 'mp4',
  'audio/mpeg': 'mp3',
  'audio/mpga': 'mpga',
  'audio/ogg': 'ogg',
  'audio/wave': 'wav',
  'audio/wav': 'wav',
  'audio/webm': 'webm',
  'audio/x-flac': 'flac',
  'audio/x-m4a': 'm4a',
  'audio/x-wav': 'wav',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
}

const OPENAI_AUDIO_EXTENSIONS = new Set(['flac', 'mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'ogg', 'wav', 'webm'])

const MIME_BY_EXTENSION: Record<string, string> = {
  flac: 'audio/flac',
  m4a: 'audio/mp4',
  mp3: 'audio/mpeg',
  mp4: 'audio/mp4',
  mpga: 'audio/mpga',
  ogg: 'audio/ogg',
  wav: 'audio/wav',
  webm: 'audio/webm',
}

function normaliseMimeType(type: string) {
  return type.split(';')[0]?.trim().toLowerCase() ?? ''
}

function extensionFromFileName(fileName: string) {
  return fileName.split('.').pop()?.trim().toLowerCase() ?? ''
}

async function detectAudioExtension(file: File) {
  const header = new Uint8Array(await file.slice(0, 16).arrayBuffer())
  const text = String.fromCharCode(...header)

  if (header[0] === 0x1a && header[1] === 0x45 && header[2] === 0xdf && header[3] === 0xa3) return 'webm'
  if (text.startsWith('fLaC')) return 'flac'
  if (text.startsWith('ID3')) return 'mp3'
  if (text.startsWith('OggS')) return 'ogg'
  if (text.startsWith('RIFF') && text.slice(8, 12) === 'WAVE') return 'wav'
  if (text.slice(4, 8) === 'ftyp') return 'mp4'
  if (header[0] === 0xff && (header[1] & 0xe0) === 0xe0) return 'mp3'

  return null
}

async function normaliseAudioFile(file: File) {
  const mimeType = normaliseMimeType(file.type)
  const mimeExtension = AUDIO_EXTENSION_BY_MIME[mimeType]
  const detectedExtension = await detectAudioExtension(file)
  const fileExtension = extensionFromFileName(file.name)
  const extension = detectedExtension ?? mimeExtension ?? (OPENAI_AUDIO_EXTENSIONS.has(fileExtension) ? fileExtension : 'webm')
  const name = file.name && extensionFromFileName(file.name) === extension ? file.name : `capture.${extension}`
  const type = detectedExtension ? MIME_BY_EXTENSION[detectedExtension] : mimeType

  if (name === file.name && type === file.type) return file

  const data = await file.arrayBuffer()
  return new File([data], name, { type: type || file.type || 'audio/webm' })
}

type PlanInput = {
  rawInput: string
  context: AiPlanningContext
  previousMessages?: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>
  sourceHint?: string
}

function systemPrompt() {
  return `
You are HomeApp's conversational household triage layer.

The app is not a chatbot product. It is a calm, dashboard-driven household operating system.
Conversation is only for capture, ambiguity, clarification, and refinement.

Core behavior:
- Preserve the user's original wording and nuance.
- Prefer useful Inbox capture when the thought is vague, interrupted, future-facing, emotional, or context-light.
- Inbox is a first-class household temporary memory layer, not a failure state.
- Do not force fuzzy thoughts into rigid categories.
- Distinguish planning confidence from entity resolution confidence.
- Ask one warm, natural follow-up question only when a detail is genuinely required to do anything useful.
- Use calm household language, never technical parser language.
- Never mention schemas, classifications, jobs, database records, or confidence to the user.

Action rules:
- Apply actions immediately whenever the intent is clear — do not ask for confirmation.
- For clear task requests, create the task immediately. A missing task list is not blocking context.
- For task requests with no explicit list, set listName to null and let the app use its default task list.
- For "assign it to Dan/Imogen" or "for Dan/Imogen", set assigneeName. Do not ask which person when the name is clear.
- If the user asks for a task about insurance, MOT, boiler, renewals, or life admin, that is still a task; do not turn it into a record update unless they ask to save/update facts.
- Use capture_to_inbox for fragments, ideas, reminders without dates, vague concerns, recommendations, and soft intent.
- Use needs_clarification only when the intent is genuinely unclear and inbox capture would lose meaning.
- Do not use needs_clarification merely to ask which task list a clear task belongs in.
- Never propose destructive actions.
- Use unknown only when even a useful capture interpretation is unclear.
`.trim()
}

function explicitTaskRequest(text: string) {
  return /(?:^|\b)(add|make|create)\s+(?:a\s+)?task\b/i.test(text) || /\bremind me to\b/i.test(text)
}

function extractAssigneeName(text: string, currentUserName?: string) {
  const explicit = text.match(/\bassign(?:\s+it)?\s+to\s+([a-z]+)\b/i)
    ?? text.match(/\bfor\s+(dan|imogen)\b/i)
  if (explicit?.[1]) return explicit[1]
  if (/\bfor me\b/i.test(text)) return currentUserName ?? null
  return null
}

function taskTitleFromText(text: string) {
  return text
    .replace(/^(let'?s\s+)?(please\s+)?(add|make|create)\s+(?:a\s+)?task\s+(?:for me\s+)?(?:to|for)?\s*/i, '')
    .replace(/^remind me to\s+/i, '')
    .replace(/\s+and\s+assign(?:\s+it)?\s+to\s+[a-z]+\b/i, '')
    .replace(/\s+for\s+(dan|imogen|me)\b/i, '')
    .trim()
}

function explicitTaskPlan(rawInput: string, currentUserName?: string): AiPlan {
  const text = rawInput.trim()
  const assigneeName = extractAssigneeName(text, currentUserName)
  const title = taskTitleFromText(text) || text

  return {
    result: 'apply_actions',
    response: assigneeName
      ? `I made that task and assigned it to ${assigneeName}.`
      : 'I made a task for that.',
    originalWording: text,
    planningConfidence: 'high',
    entityResolutionConfidence: assigneeName ? 'high' : 'medium',
    inferredTags: ['task'],
    relatedEntityIds: [],
    clarificationQuestion: null,
    clarificationOptions: [],
    confirmationSummary: null,
    actions: [{
      type: 'create_task',
      title,
      body: text,
      dueDate: null,
      listName: null,
      assigneeName,
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
  }
}

function fallbackPlan(rawInput: string): AiPlan {
  const text = rawInput.trim()
  const lower = text.toLowerCase()

  if (explicitTaskRequest(text)) return explicitTaskPlan(text)

  if (lower.includes('insurance')) {
    return {
      result: 'needs_clarification',
      response: "You mentioned insurance. I'm not sure which one yet, so I've kept the wording and can help sort it.",
      originalWording: text,
      planningConfidence: 'high',
      entityResolutionConfidence: 'low',
      inferredTags: ['insurance'],
      relatedEntityIds: [],
      clarificationQuestion: 'Which insurance do you mean: home, car, pet, travel, or something else?',
      clarificationOptions: ['Home insurance', 'Car insurance', 'Pet insurance', 'Something else'],
      confirmationSummary: null,
      actions: [],
    }
  }

  if (/(centre parcs|trip|travel|holiday|packing|chargers|swimming)/i.test(text)) {
    const plan = makeInboxPlan(text, 'I saved that to Inbox and tagged it as trip prep so it does not get lost.')
    plan.inferredTags = ['trip prep']
    plan.planningConfidence = 'medium'
    plan.entityResolutionConfidence = 'low'
    return plan
  }

  return makeInboxPlan(text)
}

function extractResponseText(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null
  const object = payload as { output_text?: unknown; output?: unknown }
  if (typeof object.output_text === 'string') return object.output_text
  if (!Array.isArray(object.output)) return null

  for (const item of object.output) {
    if (!item || typeof item !== 'object') continue
    const content = (item as { content?: unknown }).content
    if (!Array.isArray(content)) continue
    for (const part of content) {
      if (!part || typeof part !== 'object') continue
      const text = (part as { text?: unknown }).text
      if (typeof text === 'string') return text
    }
  }

  return null
}

function normalisePlan(plan: AiPlan, rawInput: string, context?: AiPlanningContext): AiPlan {
  if (explicitTaskRequest(rawInput)) {
    const onlyAsksForList = plan.result === 'needs_clarification'
      && /list|where|put/i.test([plan.clarificationQuestion, plan.response].filter(Boolean).join(' '))
    const hasNoUsefulTask = !plan.actions.some(action => action.type === 'create_task' && action.title)

    if (onlyAsksForList || hasNoUsefulTask) {
      return explicitTaskPlan(rawInput, context?.currentUser.name)
    }
  }

  const next: AiPlan = {
    ...plan,
    originalWording: plan.originalWording?.trim() || rawInput.trim(),
    response: plan.response.trim() || "I saved that so it is easy to come back to.",
    inferredTags: plan.inferredTags.map(tag => tag.trim()).filter(Boolean),
    relatedEntityIds: plan.relatedEntityIds.map(id => id.trim()).filter(Boolean),
    actions: plan.actions,
  }

  if (next.result === 'apply_actions' && next.entityResolutionConfidence === 'low') {
    return {
      ...next,
      result: 'capture_to_inbox',
      response: 'I saved that to Inbox with the original wording, so it stays useful without guessing too much.',
    }
  }

  return next
}

export async function planAiCapture(input: PlanInput): Promise<AiPlan> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return fallbackPlan(input.rawInput)

  const userPayload = {
    sourceHint: input.sourceHint ?? 'capture',
    rawInput: input.rawInput,
    context: input.context,
    previousMessages: input.previousMessages ?? [],
  }

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: TRIAGE_MODEL,
      input: [
        { role: 'system', content: systemPrompt() },
        { role: 'user', content: JSON.stringify(userPayload) },
      ],
      reasoning: { effort: 'low' },
      text: {
        format: {
          type: 'json_schema',
          name: 'homeapp_ai_plan',
          strict: true,
          schema: AI_PLAN_JSON_SCHEMA,
        },
      },
    }),
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`OpenAI planning failed (${response.status}): ${detail.slice(0, 300)}`)
  }

  const payload = await response.json()
  const outputText = extractResponseText(payload)
  if (!outputText) throw new Error('OpenAI planning returned no text output')

  const parsedJson = JSON.parse(outputText)
  const parsedPlan = aiPlanSchema.parse(parsedJson)
  return normalisePlan(parsedPlan, input.rawInput, input.context)
}

export async function transcribeAudio(file: File): Promise<{ text: string; confidence: number | null }> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured')

  const audioFile = await normaliseAudioFile(file)
  const formData = new FormData()
  formData.set('model', TRANSCRIBE_MODEL)
  formData.set('file', audioFile)
  formData.set('response_format', 'json')

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`OpenAI transcription failed (${response.status}): ${detail.slice(0, 300)}`)
  }

  const payload = await response.json() as { text?: unknown }
  return {
    text: typeof payload.text === 'string' ? payload.text.trim() : '',
    confidence: null,
  }
}
