import { withSentryConfig } from '@sentry/nextjs'

/** @type {import('next').NextConfig} */
const nextConfig = {}

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Upload source maps for readable stack traces in Sentry
  silent: true,

  // Automatically annotate React components for better error context
  reactComponentAnnotation: { enabled: true },

  // Disable the Sentry telemetry during build
  telemetry: false,
})
