'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import FeatureRequestModal from '@/components/ui/FeatureRequestModal'

type AuthState = 'loading' | 'authed' | 'unauthed'

export default function RoadmapFeedbackCta() {
  const [authState, setAuthState] = useState<AuthState>('loading')
  const [modalOpen, setModalOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    const supabase = createClient()
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return
      setAuthState(data.session ? 'authed' : 'unauthed')
    })
    return () => {
      cancelled = true
    }
  }, [])

  if (authState === 'loading') {
    return <span data-testid="roadmap-cta-placeholder" className="inline-block min-h-[1.25rem]" aria-hidden="true" />
  }

  if (authState === 'authed') {
    return (
      <>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="text-indigo-600 dark:text-indigo-400 hover:underline"
        >
          Submit a request
        </button>
        <FeatureRequestModal open={modalOpen} onClose={() => setModalOpen(false)} />
      </>
    )
  }

  return (
    <Link href="/login" className="text-indigo-600 dark:text-indigo-400 hover:underline">
      Sign in to submit a request
    </Link>
  )
}
