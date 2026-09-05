import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'
import type { WindowBounds } from '../shared/windowState'
import {
  COLLAPSED_HEIGHT,
  DEFAULT_EXPANDED_HEIGHT,
  normalizeExpandedHeight,
  WindowStateController,
  WINDOW_SAVE_DELAY_MS
} from './windowState'

function setup(
  isCollapsed = false,
  height = 640
): {
  window: EventEmitter & {
    isDestroyed: () => boolean
    getBounds: () => WindowBounds
    setBounds: Mock<(bounds: WindowBounds, animate: boolean) => void>
  }
  controller: WindowStateController
  persist: Mock
  resize: (height: number) => void
  destroy: () => void
} {
  const events = new EventEmitter()
  let bounds = { x: 100, y: 80, width: 440, height: isCollapsed ? COLLAPSED_HEIGHT : height }
  let destroyed = false
  const window = Object.assign(events, {
    isDestroyed: () => destroyed,
    getBounds: () => ({ ...bounds }),
    setBounds: vi.fn<(bounds: WindowBounds, animate: boolean) => void>((next) => {
      bounds = { ...next }
      events.emit('resize')
    })
  })
  const persist = vi.fn()
  const controller = new WindowStateController(
    window as unknown as ConstructorParameters<typeof WindowStateController>[0],
    { isCollapsed, expandedHeight: height },
    persist
  )
  return {
    window,
    controller,
    persist,
    resize(nextHeight: number) {
      bounds.height = nextHeight
      events.emit('resize')
    },
    destroy() {
      destroyed = true
      events.emit('closed')
    }
  }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('native collapse and geometry persistence', () => {
  it('starts resizing immediately and only saves the completed frame', async () => {
    const { window, controller, persist, resize } = setup()
    const completion = controller.setCollapsed(true, true)
    expect(window.setBounds).toHaveBeenCalledWith(
      { x: 100, y: 80, width: 440, height: COLLAPSED_HEIGHT },
      true
    )
    for (const height of [600, 450, 300, 160, 52]) {
      resize(height)
      vi.advanceTimersByTime(40)
    }
    expect(persist).not.toHaveBeenCalled()
    window.emit('resized')
    await expect(completion).resolves.toBe(true)
    expect(persist).not.toHaveBeenCalled()
    vi.advanceTimersByTime(WINDOW_SAVE_DELAY_MS)
    expect(persist).toHaveBeenCalledTimes(1)
    expect(persist).toHaveBeenLastCalledWith({
      isCollapsed: true,
      windowBounds: { x: 100, y: 80, width: 440, height: 52 },
      expandedHeight: 640
    })
  })

  it('restores the actual expanded height instead of the default 420px', async () => {
    const { window, controller } = setup(false, 710)
    await controller.setCollapsed(true, false)
    await controller.setCollapsed(false, false)
    expect(window.getBounds().height).toBe(710)
    expect(controller.getState().isCollapsed).toBe(false)
  })

  it('restores a saved expanded height after starting collapsed', async () => {
    const { window, controller } = setup(true, 580)
    await controller.setCollapsed(false, false)
    expect(window.getBounds().height).toBe(580)
  })

  it('does not wait for an animation event with reduced motion', async () => {
    const { controller, window, persist } = setup()
    await expect(controller.setCollapsed(true, false)).resolves.toBe(true)
    expect(window.setBounds.mock.calls[0][1]).toBe(false)
    expect(persist).not.toHaveBeenCalled()
    vi.advanceTimersByTime(WINDOW_SAVE_DELAY_MS)
    expect(persist).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not restart or save an already requested state', async () => {
    const { controller, window, persist } = setup()
    await controller.setCollapsed(false, true)
    expect(window.setBounds).not.toHaveBeenCalled()
    expect(persist).not.toHaveBeenCalled()
  })

  it('debounces manual resize/move updates and remembers the final height', () => {
    const { controller, window, persist, resize } = setup()
    for (const height of [620, 630, 650, 675]) {
      resize(height)
      window.emit('move')
      vi.advanceTimersByTime(30)
    }
    expect(persist).not.toHaveBeenCalled()
    vi.advanceTimersByTime(WINDOW_SAVE_DELAY_MS)
    expect(persist).toHaveBeenCalledTimes(1)
    expect(persist.mock.calls[0][0].expandedHeight).toBe(675)
    controller.flush()
    expect(persist).toHaveBeenCalledTimes(1)
  })

  it('keeps synchronous persistence out of the final resized event', () => {
    const { window, persist, resize } = setup()
    resize(690)
    window.emit('resized')
    expect(persist).not.toHaveBeenCalled()
    vi.runAllTimers()
    expect(persist).toHaveBeenCalledTimes(1)
  })

  it('coalesces trailing saves when another animation starts', async () => {
    const { window, controller, persist } = setup()
    const collapse = controller.setCollapsed(true, true)
    window.emit('resized')
    await collapse
    vi.advanceTimersByTime(WINDOW_SAVE_DELAY_MS / 2)
    const expand = controller.setCollapsed(false, true)
    vi.advanceTimersByTime(WINDOW_SAVE_DELAY_MS)
    expect(persist).not.toHaveBeenCalled()
    window.emit('resized')
    await expand
    vi.advanceTimersByTime(WINDOW_SAVE_DELAY_MS)
    expect(persist).toHaveBeenCalledTimes(1)
    expect(persist.mock.calls[0][0]).toMatchObject({
      isCollapsed: false,
      windowBounds: { height: 640 }
    })
  })

  it('flushes a completed collapse immediately if closed before the trailing save', async () => {
    const { controller, window, persist } = setup()
    await controller.setCollapsed(true, false)
    window.emit('close')
    expect(persist).toHaveBeenCalledTimes(1)
    expect(persist.mock.calls[0][0]).toMatchObject({
      isCollapsed: true,
      windowBounds: { height: COLLAPSED_HEIGHT },
      expandedHeight: 640
    })
    vi.runAllTimers()
    expect(persist).toHaveBeenCalledTimes(1)
  })

  it('keeps expanded height when the collapsed window is moved or resized', () => {
    const { window, persist, resize } = setup(true, 690)
    resize(52)
    window.emit('move')
    vi.runAllTimers()
    expect(persist.mock.calls[0][0].expandedHeight).toBe(690)
  })

  it('flushes pending manual geometry on close', () => {
    const { window, persist, resize } = setup()
    resize(700)
    window.emit('close')
    expect(persist).toHaveBeenCalledTimes(1)
    expect(persist.mock.calls[0][0].windowBounds.height).toBe(700)
  })

  it.each([true, false])(
    'persists the intended height when closed during a transition to collapsed=%s',
    async (collapsed) => {
      const { window, controller, persist, resize, destroy } = setup(!collapsed, 640)
      const pending = controller.setCollapsed(collapsed, true)
      resize(300)
      window.emit('close')
      expect(persist.mock.calls[0][0]).toMatchObject({
        isCollapsed: collapsed,
        windowBounds: { height: collapsed ? COLLAPSED_HEIGHT : 640 },
        expandedHeight: 640
      })
      destroy()
      await pending
      expect(vi.getTimerCount()).toBe(0)
    }
  )

  it('settles if the native completion event is missing', async () => {
    const { controller, persist } = setup()
    const completion = controller.setCollapsed(true, true)
    vi.advanceTimersByTime(1000)
    await expect(completion).resolves.toBe(true)
    expect(persist).not.toHaveBeenCalled()
    vi.advanceTimersByTime(WINDOW_SAVE_DELAY_MS)
    expect(persist).toHaveBeenCalledTimes(1)
  })

  it('recovers native state after a failed resize', async () => {
    const { window, controller } = setup()
    window.setBounds.mockImplementationOnce(() => {
      throw new Error('Resize failed')
    })
    await expect(controller.setCollapsed(true, true)).rejects.toThrow('Resize failed')
    expect(controller.getState().isCollapsed).toBe(false)
    await expect(controller.setCollapsed(true, false)).resolves.toBe(true)
  })

  it('serializes simultaneous IPC requests', async () => {
    const { controller, window } = setup()
    const first = controller.setCollapsed(true, true)
    const second = controller.setCollapsed(false, true)
    const third = controller.setCollapsed(true, true)
    expect(window.setBounds).toHaveBeenCalledTimes(1)
    window.emit('resized')
    await first
    expect(window.setBounds).toHaveBeenCalledTimes(2)
    window.emit('resized')
    await second
    expect(window.setBounds).toHaveBeenCalledTimes(3)
    window.emit('resized')
    await third
    expect(controller.getState().isCollapsed).toBe(true)
  })

  it('releases listeners and in-flight requests when the window is destroyed', async () => {
    const { window, controller, destroy } = setup()
    const pending = controller.setCollapsed(true, true)
    destroy()
    await pending
    expect(window.eventNames()).toEqual([])
    expect(vi.getTimerCount()).toBe(0)
    await expect(controller.setCollapsed(false, false)).rejects.toThrow('Window is closed')
  })

  it('normalizes legacy or invalid expanded heights', () => {
    for (const value of [undefined, null, -1, 0, NaN, Infinity, '640']) {
      expect(normalizeExpandedHeight(value)).toBe(DEFAULT_EXPANDED_HEIGHT)
    }
    expect(normalizeExpandedHeight(315.6)).toBe(316)
  })
})
