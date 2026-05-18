import * as Sentry from '@sentry/nextjs'

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  replaysSessionSampleRate: 0.05,
  replaysOnErrorSampleRate: 1.0,
  integrations: [
    Sentry.captureConsoleIntegration({ levels: ['error'] }),
    Sentry.replayIntegration({
      maskAllText: true,
      blockAllMedia: false,
    }),
  ],
  enabled: process.env.NODE_ENV === 'production',
})
