import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth/session'
import { transcribeAudio } from '@/lib/ai/planner'
import { runAiCapture } from '@/lib/ai/service'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession()
    const formData = await request.formData()
    const audio = formData.get('audio')

    if (!(audio instanceof File)) {
      return NextResponse.json({ error: 'No audio was attached.' }, { status: 400 })
    }

    const transcript = await transcribeAudio(audio)
    if (!transcript.text) {
      return NextResponse.json({ error: 'I could not hear enough to save that.' }, { status: 400 })
    }

    const result = await runAiCapture({
      rawInput: transcript.text,
      inputType: 'voice',
      sourceType: 'voice',
      sourceContext: {
        route: 'voice_capture',
        fileName: audio.name,
        mimeType: audio.type,
        sizeBytes: audio.size,
      },
      transcriptConfidence: transcript.confidence,
    }, session.user)

    return NextResponse.json({ ...result, transcript: transcript.text })
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Voice capture failed',
    }, { status: 500 })
  }
}
