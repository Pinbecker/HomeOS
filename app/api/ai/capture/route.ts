import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth/session'
import { runAiCapture } from '@/lib/ai/service'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession()
    const body = await request.json() as {
      text?: string
      sourceType?: 'typed_capture' | 'inbox_triage'
      sourceContext?: Record<string, unknown>
    }

    const rawInput = body.text?.trim()
    if (!rawInput) {
      return NextResponse.json({ error: 'Nothing to capture yet.' }, { status: 400 })
    }

    const result = await runAiCapture({
      rawInput,
      inputType: 'text',
      sourceType: body.sourceType ?? 'typed_capture',
      sourceContext: body.sourceContext ?? { route: 'capture' },
    }, session.user)

    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'AI capture failed',
    }, { status: 500 })
  }
}
