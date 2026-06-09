export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const Sentry = await import('@sentry/nextjs')
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      tracesSampleRate: 0.1,
      integrations: [Sentry.captureConsoleIntegration({ levels: ['error'] })],
      ignoreErrors: ['vm.USE_MAIN_CONTEXT_DEFAULT_LOADER is an experimental feature'],
      enabled: process.env.NODE_ENV === 'production',
    })
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    const Sentry = await import('@sentry/nextjs')
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      tracesSampleRate: 0.1,
      integrations: [Sentry.captureConsoleIntegration({ levels: ['error'] })],
      enabled: process.env.NODE_ENV === 'production',
    })
  }
}
