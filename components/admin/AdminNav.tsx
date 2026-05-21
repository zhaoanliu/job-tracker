'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function AdminNav({ userEmail }: { userEmail: string }) {
  const supabase = createClient()
  const router = useRouter()

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <nav className="h-14 flex items-center justify-between px-6 bg-white border-b border-slate-200">
      <Image
        src="/brand/lockup-light.svg"
        alt="ApplyTrackr"
        width={160}
        height={32}
        priority
        className="block dark:hidden"
      />
      <Image
        src="/brand/lockup-dark.svg"
        alt="ApplyTrackr"
        width={160}
        height={32}
        priority
        className="hidden dark:block"
      />
      <div className="flex items-center gap-3">
        <span className="text-xs text-slate-500 hidden sm:block">{userEmail}</span>
        <span className="text-slate-200">|</span>
        <button
          onClick={handleSignOut}
          className="text-xs text-slate-500 hover:text-slate-700 transition-colors"
        >
          Sign out
        </button>
      </div>
    </nav>
  )
}
