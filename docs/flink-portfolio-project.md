# Flink Portfolio Project Recommendations

A good Flink portfolio project needs: a natural high-frequency data source, a reason for stateful/windowed computation, and a visible output (dashboard or alerts).

## Top pick: Real-time crypto/stock price analytics pipeline

- **Data source:** Free WebSocket feeds (Binance, Alpaca, Coinbase) — no data infrastructure to build
- **Flink work:** Tumbling/sliding windows for moving averages and VWAP, anomaly detection (price spike > N% in M seconds), late-event handling with watermarks
- **Output:** Live dashboard (Grafana + InfluxDB, or a Next.js SSE page)
- **Why best:** Free always-live data, immediately understandable output, forces learning watermarks and out-of-order events — the core Flink concepts that justify using it over batch tools

## Runner-up options

**E-commerce clickstream / session analytics**
- Synthetic event generator (add-to-cart, view, purchase events)
- Session windows (gap-based), funnel completion rates, abandoned cart detection after 30-min inactivity, per-user stateful tracking
- Classic Flink use case that appears in every job description

**Real-time log anomaly detector**
- Generate fake app logs with random error spikes, or tail real logs from a side project
- Parse a log stream, count errors per service per 1-min window, alert when error rate exceeds threshold
- Easy to explain in interviews; common internal tooling use case

## Recommended local stack

```
Kafka (docker) → Flink (local cluster or docker-compose) → Postgres/InfluxDB → Grafana
```

All components run free locally or on a small VM.
