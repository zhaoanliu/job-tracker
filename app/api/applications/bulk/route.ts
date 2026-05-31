import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

async function handle(req: NextRequest) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { ids?: unknown; action?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const { ids, action } = body
  if (
    !Array.isArray(ids) ||
    ids.length === 0 ||
    !ids.every((id) => typeof id === 'string') ||
    action !== 'archive'
  ) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('applications')
    .update({ status: 'archived' })
    .in('id', ids as string[])
    .eq('user_id', user.id)
    .select('id')

  if (error) {
    console.error(error)
    return NextResponse.json({ error: 'Failed to archive' }, { status: 500 })
  }

  return NextResponse.json({ updated: data?.length ?? 0 })
}

export async function POST(req: NextRequest) {
  return handle(req)
}

export async function PATCH(req: NextRequest) {
  return handle(req)
}
