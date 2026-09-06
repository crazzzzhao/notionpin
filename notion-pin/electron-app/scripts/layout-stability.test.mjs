import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { waitForStableBounds } from './layout-stability.mjs'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('layout measurement readiness', () => {
  it('waits for a quiet geometry period, not a particular aligned position', async () => {
    const settled = vi.fn()
    const result = waitForStableBounds(async () => [17, 8, 120, 40])
    void result.then(settled)
    await vi.advanceTimersByTimeAsync(149)
    expect(settled).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    await expect(result).resolves.toEqual({ elapsedMs: 150, bounds: [17, 8, 120, 40] })
  })

  it('waits for an animation to stop changing the measured bounds', async () => {
    const values = [0, 40, 85, 100, 100, 100, 100]
    let index = 0
    const result = waitForStableBounds(async () => [values[Math.min(index++, values.length - 1)]])
    await vi.advanceTimersByTimeAsync(300)
    await expect(result).resolves.toEqual({ elapsedMs: 300, bounds: [100] })
  })

  it('does not mistake cumulative small movement for settled geometry', async () => {
    let index = 0
    const result = waitForStableBounds(async () => [index++ * 0.04], { timeoutMs: 500 })
    const assertion = expect(result).rejects.toThrow('did not settle within 500ms')
    await vi.advanceTimersByTimeAsync(500)
    await assertion
  })

  it('fails after a bounded wait if geometry continues moving', async () => {
    let index = 0
    const result = waitForStableBounds(async () => [index++], { timeoutMs: 500 })
    const assertion = expect(result).rejects.toThrow('did not settle within 500ms')
    await vi.advanceTimersByTimeAsync(500)
    await assertion
  })

  it('fails for missing elements instead of treating them as stable', async () => {
    await expect(waitForStableBounds(async () => [null])).rejects.toThrow('bounds are unavailable')
  })

  it('preserves renderer errors instead of skipping the check', async () => {
    await expect(
      waitForStableBounds(async () => {
        throw new Error('Renderer closed')
      })
    ).rejects.toThrow('Renderer closed')
  })
})
