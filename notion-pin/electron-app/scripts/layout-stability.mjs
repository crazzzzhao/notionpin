const pause = (ms) => new Promise((done) => setTimeout(done, ms))

// Readiness only: callers still assert their original alignment and clipping limits.
// A consistently wrong position is stable and must still fail those assertions.
export async function waitForStableBounds(
  readBounds,
  { timeoutMs = 2000, quietMs = 150, pollMs = 50, tolerance = 0.05, label = 'layout' } = {}
) {
  const startedAt = Date.now()
  let anchor
  let stableSince = startedAt
  let latest
  while (Date.now() - startedAt < timeoutMs) {
    latest = await readBounds()
    if (!Array.isArray(latest) || !latest.length || !latest.every(Number.isFinite)) {
      throw new Error(`${label}: layout bounds are unavailable`)
    }
    const now = Date.now()
    if (now - startedAt >= timeoutMs) break
    if (
      !anchor ||
      latest.length !== anchor.length ||
      latest.some((value, index) => Math.abs(value - anchor[index]) > tolerance)
    ) {
      anchor = [...latest]
      stableSince = now
    }
    if (now - stableSince >= quietMs) return { elapsedMs: now - startedAt, bounds: latest }
    await pause(pollMs)
  }
  throw new Error(
    `${label}: layout did not settle within ${timeoutMs}ms; bounds=${JSON.stringify(latest)}`
  )
}

export function waitForLayoutToSettle({ renderer, selectors, label }) {
  return waitForStableBounds(
    () =>
      renderer.evaluate(`(() => {
        return ${JSON.stringify(selectors)}.flatMap(selector => {
          const element = document.querySelector(selector);
          if (!element) return [null];
          const bounds = element.getBoundingClientRect();
          return [bounds.left, bounds.top, bounds.width, bounds.height];
        });
      })()`),
    { label }
  )
}
