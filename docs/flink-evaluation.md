# Flink Evaluation for Job-Tracker

## Verdict: Not a fit at current scale

Flink was evaluated as a potential extension to job-tracker and ruled out. The app is a personal kanban board with one (or a handful of) users, generating a few dozen DB writes per day. Flink is a distributed stream-processing engine built for high-throughput, low-latency pipelines — it adds a Kafka broker, a Flink cluster, and significant ops overhead for zero perceptible user benefit at this scale.

## Specific cases considered

| Candidate use | Why rejected |
|---|---|
| Aggregating application stats in real-time | A Supabase SQL query or DB function suffices |
| Audit log / event sourcing | Data volume too small; a Postgres audit table is enough |
| Multi-tenant real-time analytics | Only becomes a real fit if the app scales to thousands of concurrent users |

## When to revisit

If the app ever pivots to a multi-tenant SaaS with thousands of concurrent users generating a continuous event stream, Flink becomes a genuine fit. Until then, default to Supabase for any aggregation or event needs.
