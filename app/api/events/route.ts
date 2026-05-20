import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const eventName = (body.event_name ?? '').trim().slice(0, 100)
  if (!eventName) {
    return NextResponse.json({ error: 'event_name is required' }, { status: 400 })
  }

  const { error } = await supabase.from('events').insert({
    user_id: user.id,
    event_name: eventName,
    metadata: body.metadata ?? null,
  })

  if (error) {
    console.error('Failed to record event:', error.message, error)
    return NextResponse.json({ error: 'Failed to record event' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
