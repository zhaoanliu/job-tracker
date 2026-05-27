'use client'

import { useState } from 'react'
import FeatureRequestModal from '@/components/ui/FeatureRequestModal'

export default function AdminFeedbackButton() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 transition-colors"
      >
        Submit Feedback
      </button>
      <FeatureRequestModal open={open} onClose={() => setOpen(false)} />
    </>
  )
}
