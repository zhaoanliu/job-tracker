import { redirect } from 'next/navigation'

// Root redirects to dashboard; middleware handles auth gating
export default function RootPage() {
  redirect('/dashboard')
}
