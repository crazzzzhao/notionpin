import { describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'
import { createWindowCollapse } from './windowCollapse'

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

interface TestAPI {
  setCollapsed: Mock<(collapsed: boolean, options: { animate?: boolean }) => Promise<boolean>>
  getWindowState: Mock<() => Promise<{ isCollapsed: boolean }>>
}

function setup(): {
  api: TestAPI
  controller: ReturnType<typeof createWindowCollapse>
  animate: Mock<() => boolean>
  error: Mock<() => void>
} {
  const api = {
    setCollapsed: vi.fn<(collapsed: boolean, options: { animate?: boolean }) => Promise<boolean>>(
      async (collapsed) => collapsed
    ),
    getWindowState: vi.fn(async () => ({ isCollapsed: false }))
  }
  const animate = vi.fn(() => true)
  const error = vi.fn()
  const controller = createWindowCollapse(api, animate, error)
  return { api, controller, animate, error }
}

describe('renderer window collapse intent', () => {
  it('requests native resizing immediately, without waiting for CSS', async () => {
    const { controller, api } = setup()
    const complete = controller.toggle()
    expect(controller.getSnapshot()).toBe(true)
    expect(api.setCollapsed).toHaveBeenCalledWith(true, { animate: true })
    await complete
    expect(controller.getSnapshot()).toBe(true)
  })

  it('retains the latest intent while serializing a rapid reversal', async () => {
    const { controller, api } = setup()
    const first = deferred<boolean>()
    api.setCollapsed.mockReturnValueOnce(first.promise)
    const complete = controller.toggle()
    controller.toggle()
    expect(controller.getSnapshot()).toBe(false)
    expect(api.setCollapsed).toHaveBeenCalledTimes(1)
    first.resolve(true)
    await complete
    expect(api.setCollapsed.mock.calls.map(([collapsed]) => collapsed)).toEqual([true, false])
    expect(controller.getSnapshot()).toBe(false)
  })

  it('coalesces an odd number of rapid clicks without duplicate native transitions', async () => {
    const { controller, api } = setup()
    const first = deferred<boolean>()
    api.setCollapsed.mockReturnValueOnce(first.promise)
    const complete = controller.toggle()
    controller.toggle()
    controller.toggle()
    first.resolve(true)
    await complete
    expect(api.setCollapsed).toHaveBeenCalledTimes(1)
    expect(controller.getSnapshot()).toBe(true)
  })

  it('never briefly returns to visible after a successful collapse', async () => {
    const { controller } = setup()
    const states: boolean[] = []
    controller.subscribe(() => states.push(controller.getSnapshot()))
    await controller.toggle()
    expect(states).toEqual([true])
  })

  it('disables native animation when reduced motion is requested', async () => {
    const { controller, api, animate } = setup()
    animate.mockReturnValue(false)
    await controller.toggle()
    expect(api.setCollapsed).toHaveBeenCalledWith(true, { animate: false })
    await controller.toggle()
    expect(controller.getSnapshot()).toBe(false)
  })

  it('recovers from IPC failure and permits retry', async () => {
    const { controller, api, error } = setup()
    api.setCollapsed.mockRejectedValueOnce(new Error('IPC unavailable'))
    await controller.toggle()
    expect(controller.getSnapshot()).toBe(false)
    expect(error).toHaveBeenCalledOnce()
    await controller.toggle()
    expect(controller.getSnapshot()).toBe(true)
  })

  it('falls back to the last acknowledged state if recovery also fails', async () => {
    const { controller, api } = setup()
    controller.initialize(true)
    api.setCollapsed.mockRejectedValueOnce(new Error('IPC unavailable'))
    api.getWindowState.mockRejectedValueOnce(new Error('Window unavailable'))
    await controller.toggle()
    expect(controller.getSnapshot()).toBe(true)
  })

  it('initializes the collapsed state and cleans up subscribers', async () => {
    const { controller } = setup()
    const listener = vi.fn()
    const unsubscribe = controller.subscribe(listener)
    controller.initialize(true)
    expect(controller.getSnapshot()).toBe(true)
    expect(listener).toHaveBeenCalledOnce()
    unsubscribe()
    await controller.toggle()
    expect(listener).toHaveBeenCalledOnce()
  })
})
