import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { requireSession } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { aiConversations, type AiConversationMessage } from '@/lib/db/schema'
import { getActiveInboxItem, runAiCapture } from '@/lib/ai/service'

export const runtime = 'nodejs'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ itemId: string }> },
) {
  try {
    const session = await requireSession()
    const { itemId } = await params
    const body = await request.json().catch(() => ({})) as {
      message?: string
      conversationId?: string | null
    }

    const item = await getActiveInboxItem(itemId)
    if (!item) return NextResponse.json({ error: 'Inbox item not found.' }, { status: 404 })

    let previousMessages: AiConversationMessage[] = []
    if (body.conversationId) {
      const conversation = await db.query.aiConversations.findFirst({
        where: eq(aiConversations.id, body.conversationId),
      })
      previousMessages = conversation?.messages ?? []
      if (body.message?.trim()) {
        previousMessages = [
          ...previousMessages,
          { role: 'user' as const, content: body.message.trim(), createdAt: new Date().toISOString() },
        ]
        await db.update(aiConversations)
          .set({ messages: previousMessages, updatedAt: new Date() })
          .where(eq(aiConversations.id, body.conversationId))
      }
    }

    const rawInput = body.message?.trim()
      ? `${item.title}\n\nFollow-up: ${body.message.trim()}`
      : [item.title, item.body].filter(Boolean).join('\n\n')

    const result = await runAiCapture({
      rawInput,
      inputType: 'text',
      sourceType: 'inbox_triage',
      sourceContext: {
        route: 'inbox_triage',
        itemId,
        existingMetadata: item.metadata ?? null,
      },
      originItemId: itemId,
      conversationId: body.conversationId ?? null,
      previousMessages,
    }, session.user)

    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Inbox AI triage failed',
    }, { status: 500 })
  }
}
