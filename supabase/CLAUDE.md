## DB schema changes

Every schema change follows this checklist — skipping any step is what caused the `status_history` incident (table deployed to prod days after the code that needed it, with no visible errors because Supabase `PostgrestError` objects log as `[object Object]` in Sentry).

**Checklist for adding or modifying a table:**

1. **Create the migration file** in `supabase/migrations/` with a timestamp prefix (`YYYYMMDDHHMMSS_description.sql`). Use `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS` so re-running is safe.

2. **Enable RLS and add a policy** on every new table. Use the `DO $$` pattern so the migration is safe to re-run:
   ```sql
   alter table public.<table> enable row level security;
   do $$
   begin
     create policy "Users can only access their own <table>"
       on public.<table> for all
       using (auth.uid() = user_id)
       with check (auth.uid() = user_id);
   exception when duplicate_object then null;
   end $$;
   ```
   Note: dollar-quoting requires `$$` (not bare `$`) — a single `$` causes a syntax error.

3. **Grant table-level privileges to the `authenticated` role.** Supabase CLI v2 does not auto-grant these during `supabase start`; without them PostgREST returns `42501 permission denied` even when an RLS policy would allow the row. Add immediately after the RLS block:
   ```sql
   grant select, insert, update, delete on public.<table> to authenticated;
   ```
   For insert-only tables (e.g. `events` where users write but never self-serve reads), use `grant insert` only. Service-role-only tables (e.g. `workflow_runs`) need no `authenticated` grant.

4. **Update `lib/types.ts`** — add the TypeScript interface and any new enum values. New enum values also need to be added to the corresponding constant arrays in the same file.

5. **Write the feature code and tests** — the new table can be referenced in code immediately; `migrate.yml` will apply it when the PR merges.

6. **Merge to main** — `migrate.yml` runs automatically on every push to main, applies all pending migrations via `supabase link + supabase db push`. No manual SQL steps needed.

**Supabase error logging rules** (learned from this incident):
- Always log `error.message` alongside the raw error object: `console.error('context:', error.message, error)` — a bare `console.error(error)` shows as `[object Object]` in Sentry and is impossible to diagnose.
- Always log errors in both write paths (`insert`/`update`) AND read paths (`.then(({ data, error }) => ...)`). Silent read failures produce the same symptom as silent write failures and are impossible to distinguish in production.

**Race condition note:** `migrate.yml` and Vercel deployment both trigger on push to main and run in parallel. There is a brief window where new code is live but the migration hasn't applied yet. For this app this is acceptable — the error is logged and the UI shows empty state rather than crashing. If a future feature requires the migration to land before the code, run `gh workflow run migrate.yml` and wait for it to succeed before merging the code change.

## Supabase auth hook (send-auth-email Edge Function)

All auth emails are delivered via `supabase/functions/send-auth-email/index.ts` — a Deno Edge Function configured as `hook_send_email` in the project's auth config. It receives Supabase's hook payload and re-sends the email via Resend with ApplyTrackr branding.

**Deploying the function:**
```bash
SUPABASE_ACCESS_TOKEN=<token> npx supabase functions deploy send-auth-email --project-ref rfnngfmdmzixcwibpals --no-verify-jwt
```

**Hook configuration** (already applied to the project; only needed if the project is reset):
```bash
curl -X PATCH "https://api.supabase.com/v1/projects/rfnngfmdmzixcwibpals/config/auth" \
  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"hook_send_email_enabled":true,"hook_send_email_uri":"https://rfnngfmdmzixcwibpals.supabase.co/functions/v1/send-auth-email","rate_limit_email_sent":100}'
```
Note: always include `rate_limit_email_sent` in the same PATCH — partial PATCHes reset it to the default (2/hr) which silently drops emails.

**Non-obvious gotchas learned:**
- The hook payload provides `email_data.token_hash` and `email_data.site_url`, NOT `email_data.confirmation_url`. Build the URL: `${site_url}/verify?token=${token_hash}&type=${type}&redirect_to=${redirect_to}`
- `site_url` in the hook payload is the Supabase auth server URL and already includes `/auth/v1` (e.g. `https://<ref>.supabase.co/auth/v1`). Append `/verify`, not `/auth/v1/verify`.
- All `new Response(...)` calls must include `headers: { 'Content-Type': 'application/json' }`. Deno defaults to `text/plain`, which Supabase rejects with `hook_payload_invalid_content_type`.
- The HMAC secret is stored in hex internally; the `v1,whsec_...` format you set is transformed by Supabase. The function does not need to verify the signature since it is hosted on the same Supabase project.
