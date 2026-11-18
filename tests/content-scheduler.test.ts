/**
 * @jest-environment node
 */

jest.mock("src/libs/content", () => ({
  reconcileContent: jest.fn(),
}))

import { reconcileContent } from "src/libs/content"
import {
  parseContentReconcileIntervalMinutes,
  startContentReconciliationScheduler,
} from "src/libs/content/scheduler"

const reconcile = jest.mocked(reconcileContent)
let stopScheduler: (() => void) | undefined

beforeEach(() => {
  jest.useFakeTimers()
  reconcile.mockReset().mockResolvedValue({
    completed: 0,
    changed: 0,
    pending: [],
    failed: [],
    revision: 1,
    maintenancePending: 0,
    notificationsPending: 0,
  })
})

afterEach(() => {
  stopScheduler?.()
  stopScheduler = undefined
  jest.useRealTimers()
})

describe("content reconciliation scheduler", () => {
  it("parses the optional runtime interval and accepts zero as disabled", () => {
    expect(parseContentReconcileIntervalMinutes(undefined)).toBeUndefined()
    expect(parseContentReconcileIntervalMinutes("0")).toBe(0)
    expect(parseContentReconcileIntervalMinutes("15")).toBe(15)
    expect(parseContentReconcileIntervalMinutes("10080")).toBe(10080)
    expect(() => parseContentReconcileIntervalMinutes("1.5")).toThrow(/integer from 0 to 10080/)
    expect(() => parseContentReconcileIntervalMinutes("10081")).toThrow(/integer from 0 to 10080/)
  })

  it("runs reconciliation on cadence without ISR callback", async () => {
    stopScheduler = startContentReconciliationScheduler(1)

    await jest.advanceTimersByTimeAsync(60_000)

    expect(reconcile).toHaveBeenCalledTimes(1)
    expect(reconcile).toHaveBeenCalledWith({ deferPathRevalidation: true })
  })
})
