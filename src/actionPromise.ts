import { ActionResult } from '@signalk/server-api'

/**
 * Status code used by all autopilot backends to indicate a failed action.
 *
 * SignalK's v2 ActionResult uses HTTP-style status codes:
 *   200 = COMPLETED success
 *   202 = PENDING (still in progress; verifyChange will resolve later)
 *   400 = COMPLETED failure
 *
 * Each backend file (raymarinen2k.ts, simrad.ts, emulator.ts, raystngconv.js,
 * raymarinest.js) declares its own SUCCESS_RES/FAILURE_RES/PENDING_RES
 * constants with these values. Keeping a single source of truth here so the
 * helper below doesn't need to import any backend's private constants.
 */
export const ACTION_FAILURE_STATUS_CODE = 400

/**
 * Wrap an autopilot action into a Promise that resolves on success and
 * rejects on failure.
 *
 * BACKGROUND
 * Every backend exposes its put*-style action as a callback-returning sync
 * function: it accepts `(context, path, value, cb)` and returns an
 * ActionResult immediately. Some actions complete the work synchronously and
 * return SUCCESS_RES (200) or FAILURE_RES (400) right away — these don't
 * use the callback. Other actions kick off a verifyChange poll, return
 * PENDING_RES (202) immediately, and call the callback later when the poll
 * confirms (or times out).
 *
 * The v2 autopilot provider on the other hand wants Promise-returning
 * methods. So each backend has historically wrapped each action in a
 * boilerplate `new Promise(...)` block — about 8 lines repeated for every
 * action, in every backend. With 5+ actions across 5 backends, that's ~30
 * near-identical copies. This helper collapses all of them.
 *
 * USAGE
 *   toActionPromise((cb) => pilot.putState(undefined, undefined, value, cb))
 *
 * For sync actions whose impl ignores the callback, just pass it through —
 * the impl returns SUCCESS_RES/FAILURE_RES and we resolve/reject from the
 * return value. For async actions, the impl returns PENDING and later
 * invokes the callback with the real result.
 *
 * BOTH PATHS HANDLED
 * 1. Sync path — `invoke` returns a non-PENDING ActionResult. We inspect
 *    statusCode immediately and resolve or reject.
 * 2. Async path — `invoke` returns PENDING and the callback fires later.
 *    The callback resolves or rejects.
 *
 * The callback is wired regardless: if the impl happens to call it AND
 * returns non-PENDING, Promise resolution is idempotent so the second call
 * is a no-op. This makes the helper tolerant of either contract.
 */
export function toActionPromise(
  invoke: (cb: (res: ActionResult) => void) => ActionResult
): Promise<void> {
  return new Promise((resolve, reject) => {
    const res = invoke((finalRes) => {
      if (finalRes.statusCode === ACTION_FAILURE_STATUS_CODE) {
        reject(finalRes)
      } else {
        resolve()
      }
    })

    if (res.state !== 'PENDING') {
      if (res.statusCode === ACTION_FAILURE_STATUS_CODE) {
        reject(res)
      } else {
        resolve()
      }
    }
  })
}
