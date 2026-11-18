export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV !== "production") return

  // Keep Node-only Redis and content modules out of Edge instrumentation bundles.
  const { parseContentReconcileIntervalMinutes, startContentReconciliationScheduler } = await import("./libs/content/scheduler")
  const interval = parseContentReconcileIntervalMinutes(process.env.CONTENT_RECONCILE_INTERVAL_MINUTES)
  if (!interval) return

  startContentReconciliationScheduler(interval)
  console.info(`[content-reconcile] Scheduler enabled: every ${interval} minutes`)
}
