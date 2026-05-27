import Image from 'next/image'
import Link from 'next/link'
import AuthForm from '@/components/auth/AuthForm'

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-indigo-50 dark:from-slate-900 dark:to-slate-800 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Image
            src="/brand/lockup-light.svg"
            alt="ApplyTrackr"
            width={200}
            height={40}
            className="mx-auto mb-3 block dark:hidden"
            priority
          />
          <Image
            src="/brand/lockup-dark.svg"
            alt="ApplyTrackr"
            width={200}
            height={40}
            className="mx-auto mb-3 hidden dark:block"
            priority
          />
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Sign in to manage your pipeline</p>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-8">
          <AuthForm />
        </div>
        <div className="text-center mt-4">
          <Link href="/roadmap" className="text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">
            View Roadmap
          </Link>
        </div>
      </div>
    </main>
  )
}
