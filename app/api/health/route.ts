import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { sql } from 'drizzle-orm'

export async function GET() {
  try {
    // Verify DB is reachable
    db.run(sql`SELECT 1`)

    return NextResponse.json({
      status: 'ok',
      db: 'connected',
      version: process.env.npm_package_version ?? '0.1.0',
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    console.error('[health] DB check failed:', err)
    return NextResponse.json(
      { status: 'error', db: 'disconnected' },
      { status: 503 }
    )
  }
}
