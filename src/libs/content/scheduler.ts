import { reconcileContent } from "./index"

const MAX_INTERVAL_MINUTES = 7 * 24 * 60

export function parseContentReconcileIntervalMinutes(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === "") return undefined
  if (!/^\d+$/.test(value.trim())) {
    throw new Error("CONTENT_RECONCILE_INTERVAL_MINUTES must be an integer from 0 to 10080")
  }

  const minutes = Number(value)
  if (!Number.isSafeInteger(minutes) || minutes < 0 || minutes > MAX_INTERVAL_MINUTES) {
    throw new Error("CONTENT_RECONCILE_INTERVAL_MINUTES must be an integer from 0 to 10080")
  }
  return minutes
}

export function startContentReconciliationScheduler(intervalMinutes: number): () => void {
  if (!Number.isSafeInteger(intervalMinutes) || intervalMinutes < 1 || intervalMinutes > MAX_INTERVAL_MINUTES) {
    throw new Error(`Content reconciliation interval must be between 1 and ${MAX_INTERVAL_MINUTES} minutes`)
  }

  let running = false
  const run = async () => {
    if (running) return
    running = true
    try {
      const result = await reconcileContent({ deferPathRevalidation: true })
      const summary = {
        completed: result.completed,
        changed: result.changed,
        pending: result.pending.length,
        failed: result.failed.length,
        revision: result.revision,
        maintenancePending: result.maintenancePending,
        notificationsPending: result.notificationsPending,
      }
      const log = result.failed.length || result.pending.length
        ? console.warn
        : console.info
      log(`[content-reconcile] ${JSON.stringify(summary)}`)
    } catch (error) {
      console.error("[content-reconcile] Scheduled reconciliation failed", error)
    } finally {
      running = false
    }
  }

  const timer = setInterval(() => { void run() }, intervalMinutes * 60_000)
  timer.unref()
  return () => clearInterval(timer)
}
