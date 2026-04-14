import type { DashboardQueryTimingRow } from "@/lib/dashboard/queries"

const SLOW_QUERY_WARN_MS = 1500
const DEBUG_DASHBOARD_QUERY_LOGS = process.env.DASHBOARD_QUERY_DEBUG === "true"

export function logDashboardQueryTimings(queryTimings: DashboardQueryTimingRow[]) {
  for (const timing of queryTimings) {
    const payload: { query: string; duration_ms: number; rows?: number } = {
      query: timing.label,
      duration_ms: timing.durationMs,
    }
    if (typeof timing.rows === "number") payload.rows = timing.rows
    if (timing.durationMs >= SLOW_QUERY_WARN_MS) {
      console.warn("[dashboard.query]", payload)
    } else if (DEBUG_DASHBOARD_QUERY_LOGS) {
      console.info("[dashboard.query]", payload)
    }
  }
}
