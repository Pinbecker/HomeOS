import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth/session'
import { confirmAiJob } from '@/lib/ai/service'

export const runtime = 'nodejs'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  try {
    const session = await requireSession()
    const { jobId } = await params
    const result = await confirmAiJob(jobId, session.user)
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'AI confirmation failed',
    }, { status: 500 })
  }
}
