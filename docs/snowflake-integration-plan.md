# Snowflake Integration Plan

*Status: planned — not yet implemented*
*Related: [Temporal migration plan](temporal-migration-plan.md) · [GitHub Actions audit](github-actions-audit.md)*

---

## Why Snowflake

Supabase/PostgreSQL handles operational data perfectly — user accounts, job applications, board state. But ApplyTrackr now generates a rich stream of time-series events:

- Pipeline events (CI pass/fail, deploy outcomes, self-healing incidents)
- Feature lifecycle events (design approved, implementation started, AC verified, shipped)
- Sentry incidents and auto-resolution outcomes
- Nightly E2E results over time

PostgreSQL is the wrong tool for analytical queries across that history. Snowflake is purpose-built for this: columnar storage, separation of compute from storage, zero-copy cloning, time travel, and native support for the window functions needed for cycle time and DORA metrics.

**The principle:** Supabase is the operational layer. Snowflake is the analytical layer. Right tool for each job.

---

## Target architecture

```
Supabase (PostgreSQL)                    GitHub Actions
   operational data                       CI/CD events
        ↓                                      ↓
   nightly export                     Snowflake Python connector
   pg_dump → S3 stage                  (emit on PR open/close,
   → COPY INTO Snowflake               CI pass/fail, deploy,
                                        Sentry alert/resolve)
                                              ↓
                                    ┌─────────────────────┐
                                    │      Snowflake       │
                                    │  pipeline_events     │
                                    │  ci_runs             │
                                    │  feature_lifecycle   │
                                    │  deploy_outcomes     │
                                    │  sentry_incidents    │
                                    └─────────────────────┘
                                              ↓
                                    Next.js API route
                                    → analytics dashboard
                                      in ApplyTrackr UI
```

---

## Schema design

### `pipeline_events`
```sql
CREATE TABLE pipeline_events (
  event_id        VARCHAR   NOT NULL,
  event_type      VARCHAR   NOT NULL,  -- 'ci_pass' | 'ci_fail' | 'deploy_success' | 'sentry_alert' | 'auto_fix_merged' | ...
  workflow_name   VARCHAR,             -- 'auto-fix.yml' | 'ci-auto-fix.yml' | ...
  issue_number    NUMBER,
  pr_number       NUMBER,
  branch          VARCHAR,
  triggered_by    VARCHAR,             -- 'sentry' | 'github_actions' | 'manual'
  outcome         VARCHAR,             -- 'success' | 'failure' | 'partial'
  duration_seconds NUMBER,
  event_timestamp TIMESTAMP_TZ NOT NULL,
  metadata        VARIANT              -- arbitrary JSON for event-specific fields
)
CLUSTER BY (event_timestamp);
```

### `ci_runs`
```sql
CREATE TABLE ci_runs (
  run_id          VARCHAR   NOT NULL,
  workflow_name   VARCHAR   NOT NULL,
  pr_number       NUMBER,
  branch          VARCHAR,
  trigger_type    VARCHAR,             -- 'push' | 'pull_request' | 'schedule'
  status          VARCHAR,             -- 'success' | 'failure' | 'cancelled'
  started_at      TIMESTAMP_TZ,
  completed_at    TIMESTAMP_TZ,
  duration_seconds NUMBER,
  auto_fixed      BOOLEAN DEFAULT FALSE,
  fix_pr_number   NUMBER
)
CLUSTER BY (started_at);
```

### `feature_lifecycle`
```sql
CREATE TABLE feature_lifecycle (
  issue_number        NUMBER   NOT NULL,
  design_issue_number NUMBER,
  entry_path          VARCHAR,          -- 'user_feedback' | 'owner_planned'
  approved_at         TIMESTAMP_TZ,
  design_started_at   TIMESTAMP_TZ,
  design_completed_at TIMESTAMP_TZ,
  implement_started_at TIMESTAMP_TZ,
  implement_completed_at TIMESTAMP_TZ,
  ac_verified_at      TIMESTAMP_TZ,
  pr_opened_at        TIMESTAMP_TZ,
  pr_merged_at        TIMESTAMP_TZ,
  deployed_at         TIMESTAMP_TZ,
  subtask_count       NUMBER,
  impl_failed         BOOLEAN DEFAULT FALSE,
  ac_passed           BOOLEAN
)
CLUSTER BY (approved_at);
```

### `deploy_outcomes`
```sql
CREATE TABLE deploy_outcomes (
  deploy_id       VARCHAR   NOT NULL,
  trigger_type    VARCHAR,             -- 'merge_to_main' | 'manual'
  migration_status VARCHAR,            -- 'success' | 'failure' | 'skipped'
  vercel_status   VARCHAR,             -- 'success' | 'failure' | 'quota_limit'
  auto_fixed      BOOLEAN DEFAULT FALSE,
  fix_type        VARCHAR,             -- 'code_fix' | 'infra_issue'
  deployed_at     TIMESTAMP_TZ,
  duration_seconds NUMBER
)
CLUSTER BY (deployed_at);
```

### `sentry_incidents`
```sql
CREATE TABLE sentry_incidents (
  sentry_id       VARCHAR   NOT NULL,
  title           VARCHAR,
  severity        VARCHAR,
  auto_resolved   BOOLEAN DEFAULT FALSE,
  issue_number    NUMBER,
  pr_number       NUMBER,
  fix_merged_at   TIMESTAMP_TZ,
  resolved_at     TIMESTAMP_TZ,
  time_to_resolve_seconds NUMBER,
  detected_at     TIMESTAMP_TZ NOT NULL
)
CLUSTER BY (detected_at);
```

---

## Ingestion pipelines

### 1. GitHub Actions → Snowflake (real-time events)

Add a reusable `emit-snowflake-event` composite action:

```yaml
# .github/actions/emit-snowflake-event/action.yml
name: Emit Snowflake event
inputs:
  event_type:
    required: true
  metadata:
    required: false
    default: '{}'
runs:
  using: composite
  steps:
    - name: Emit event
      shell: python3 {0}
      env:
        SNOWFLAKE_ACCOUNT: ${{ env.SNOWFLAKE_ACCOUNT }}
        SNOWFLAKE_USER: ${{ env.SNOWFLAKE_USER }}
        SNOWFLAKE_PASSWORD: ${{ env.SNOWFLAKE_PASSWORD }}
        SNOWFLAKE_DATABASE: APPLYTRACKR
        SNOWFLAKE_SCHEMA: EVENTS
        SNOWFLAKE_WAREHOUSE: APPLYTRACKR_WH
      run: |
        import snowflake.connector, os, json, uuid
        from datetime import datetime, timezone
        conn = snowflake.connector.connect(
          account=os.environ['SNOWFLAKE_ACCOUNT'],
          user=os.environ['SNOWFLAKE_USER'],
          password=os.environ['SNOWFLAKE_PASSWORD'],
          database='APPLYTRACKR',
          schema='EVENTS',
          warehouse='APPLYTRACKR_WH',
        )
        conn.cursor().execute("""
          INSERT INTO pipeline_events
            (event_id, event_type, workflow_name, event_timestamp, metadata)
          VALUES (%s, %s, %s, %s, PARSE_JSON(%s))
        """, (
          str(uuid.uuid4()),
          '${{ inputs.event_type }}',
          os.environ.get('GITHUB_WORKFLOW', ''),
          datetime.now(timezone.utc).isoformat(),
          '${{ inputs.metadata }}',
        ))
        conn.close()
```

Call from any workflow:
```yaml
- uses: ./.github/actions/emit-snowflake-event
  with:
    event_type: ci_pass
    metadata: '{"pr_number": ${{ github.event.pull_request.number }}}'
```

### 2. Supabase → Snowflake (nightly batch)

```yaml
# .github/workflows/snowflake-sync.yml
name: Nightly Supabase → Snowflake sync
on:
  schedule:
    - cron: '0 6 * * *'   # 6am UTC daily
jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - name: Export from Supabase and load into Snowflake
        run: |
          pip install snowflake-connector-python psycopg2-binary
          python scripts/supabase_to_snowflake.py
```

---

## Analytics queries

### Self-healing success rate
```sql
SELECT
  DATE_TRUNC('week', detected_at)                          AS week,
  COUNT(*)                                                  AS total_incidents,
  SUM(CASE WHEN auto_resolved THEN 1 ELSE 0 END)           AS auto_resolved,
  ROUND(auto_resolved / total_incidents * 100, 1)          AS success_rate_pct
FROM sentry_incidents
GROUP BY 1
ORDER BY 1 DESC;
```

### Feature cycle time (P50 / P95)
```sql
SELECT
  PERCENTILE_CONT(0.5) WITHIN GROUP (
    ORDER BY DATEDIFF('hour', approved_at, deployed_at)
  )                                                         AS p50_hours,
  PERCENTILE_CONT(0.95) WITHIN GROUP (
    ORDER BY DATEDIFF('hour', approved_at, deployed_at)
  )                                                         AS p95_hours
FROM feature_lifecycle
WHERE deployed_at IS NOT NULL;
```

### DORA metrics — deploy frequency and failure rate
```sql
SELECT
  DATE_TRUNC('week', deployed_at)                          AS week,
  COUNT(*)                                                  AS deploys,
  SUM(CASE WHEN vercel_status = 'failure' THEN 1 ELSE 0 END) AS failures,
  ROUND(failures / deploys * 100, 1)                       AS failure_rate_pct
FROM deploy_outcomes
GROUP BY 1
ORDER BY 1 DESC;
```

### CI health over time
```sql
SELECT
  workflow_name,
  DATE_TRUNC('week', started_at)                           AS week,
  COUNT(*)                                                  AS total_runs,
  SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END)     AS passed,
  SUM(CASE WHEN auto_fixed THEN 1 ELSE 0 END)             AS auto_fixed,
  ROUND(passed / total_runs * 100, 1)                     AS pass_rate_pct,
  ROUND(AVG(duration_seconds) / 60, 1)                    AS avg_duration_min
FROM ci_runs
GROUP BY 1, 2
ORDER BY 2 DESC, 1;
```

---

## Implementation plan

### Phase 1 — Setup (week 1–2)
- [ ] Sign up for Snowflake free trial
- [ ] Create warehouse `APPLYTRACKR_WH`, database `APPLYTRACKR`, schema `EVENTS`
- [ ] Run DDL for all 5 tables
- [ ] Add Snowflake credentials to GitHub Actions secrets:
  - `SNOWFLAKE_ACCOUNT`
  - `SNOWFLAKE_USER`
  - `SNOWFLAKE_PASSWORD`
- [ ] Learn: virtual warehouses, time travel (`AT(OFFSET => -3600)`), zero-copy cloning

### Phase 2 — Event ingestion (week 2–3)
- [ ] Build `emit-snowflake-event` composite action (Python + snowflake-connector)
- [ ] Add emit calls to: `auto-fix.yml`, `ci-auto-fix.yml`, `cd.yml`, `feature-implement.yml`
- [ ] Build `snowflake-sync.yml` nightly Supabase → Snowflake batch job
- [ ] Write `scripts/supabase_to_snowflake.py`
- [ ] Learn: COPY INTO, Snowpipe, internal/external stages, VARIANT type

### Phase 3 — Analytics + dashboard (week 3–4)
- [ ] Write and validate the 4 analytics queries above in Snowflake worksheet
- [ ] Add `GET /api/analytics/pipeline` Next.js API route (queries Snowflake via Node.js connector)
- [ ] Add analytics dashboard page to ApplyTrackr UI
- [ ] Learn: window functions, materialized views, Tasks (scheduled SQL)

### Phase 4 — Advanced concepts (week 4+)
- [ ] Implement time travel query: "what was the pipeline health 7 days ago?"
- [ ] Zero-copy clone `APPLYTRACKR` db for a staging analytics environment
- [ ] Dynamic tables for auto-refreshing aggregates
- [ ] Streams + Tasks for incremental processing
- [ ] Learn: data sharing, Snowpark (Python in Snowflake)

---

## Snowflake concepts to understand for interviews

| Concept | Why it matters |
|---|---|
| Virtual warehouses | Compute/storage separation — scale compute independently, pause when idle |
| Time travel | Query any historical state up to 90 days back without backups |
| Zero-copy cloning | Instant environment clone with no data duplication cost |
| Clustering keys | Physical co-location of related rows — critical for time-series query performance |
| Snowpipe | Continuous micro-batch ingestion from S3/GCS/Azure Blob |
| Streams + Tasks | Change data capture + scheduled SQL — Snowflake's CDC pattern |
| Dynamic tables | Declarative materialized views that auto-refresh on upstream changes |
| VARIANT type | Semi-structured JSON stored natively — queryable with dot notation |
| Data sharing | Share live data across Snowflake accounts without copying |

---

## Interview positioning

The story to tell:

> "I added Snowflake as the analytical layer to my self-healing CI/CD system. Supabase handles operational state — user data, live board — and Snowflake handles the time-series event stream from GitHub Actions. I designed the schema with clustering keys on `event_timestamp`, built a reusable composite action to emit events from any workflow using the Python connector, and wrote DORA metric queries — deploy frequency, failure rate, feature cycle time P50/P95. I also used time travel to query pipeline health at a point in time, and zero-copy cloning to create a staging analytics environment."

Target companies where this lands directly: Datadog, Stripe, Cloudflare, Okta — all heavy Snowflake users.

---

## Resources

- [Snowflake free trial](https://signup.snowflake.com)
- [Snowflake Connector for Python](https://docs.snowflake.com/en/developer-guide/python-connector/python-connector)
- [Snowflake Node.js driver](https://docs.snowflake.com/en/developer-guide/node-js/nodejs-driver)
- [Time travel docs](https://docs.snowflake.com/en/user-guide/data-time-travel)
- [Snowpipe docs](https://docs.snowflake.com/en/user-guide/data-load-snowpipe-intro)
