import type { BrowserWindow } from 'electron'
import type { WindowBounds } from '../shared/windowState'

export const COLLAPSED_HEIGHT = 52
export const DEFAULT_EXPANDED_HEIGHT = 420
export const WINDOW_SAVE_DELAY_MS = 200
const RESIZE_TIMEOUT_MS = 1000

export interface SavedWindowState {
  isCollapsed: boolean
  windowBounds: WindowBounds
  expandedHeight: number
}

type NativeWindow = Pick<
  BrowserWindow,
  'getBounds' | 'setBounds' | 'isDestroyed' | 'on' | 'removeListener'
>

export function normalizeExpandedHeight(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= COLLAPSED_HEIGHT
    ? Math.round(value)
    : DEFAULT_EXPANDED_HEIGHT
}

/** Owns native geometry; synchronous storage stays out of animation frames. */
export class WindowStateController {
  private collapsed: boolean
  private expandedHeight: number
  private saveTimer: ReturnType<typeof setTimeout> | undefined
  private resizeTimer: ReturnType<typeof setTimeout> | undefined
  private pending: Promise<boolean> | undefined
  private finishResize: (() => void) | undefined
  private lastSaved = ''

  constructor(
    private readonly window: NativeWindow,
    initial: { isCollapsed: boolean; expandedHeight: number },
    private readonly persist: (state: SavedWindowState) => void
  ) {
    this.collapsed = initial.isCollapsed
    this.expandedHeight = normalizeExpandedHeight(initial.expandedHeight)
    window.on('move', this.scheduleSave)
    window.on('resize', this.scheduleSave)
    window.on('resized', this.onResized)
    window.on('close', this.flush)
    window.on('closed', this.dispose)
  }

  getState = (): { isCollapsed: boolean; bounds: WindowBounds } => ({
    isCollapsed: this.collapsed,
    bounds: this.window.getBounds()
  })

  setCollapsed = async (collapsed: boolean, animate: boolean): Promise<boolean> => {
    while (this.pending) await this.pending
    if (this.window.isDestroyed()) throw new Error('Window is closed')
    if (collapsed === this.collapsed) return this.collapsed

    clearTimeout(this.saveTimer)
    const bounds = this.window.getBounds()
    if (!this.collapsed) this.expandedHeight = normalizeExpandedHeight(bounds.height)
    const previousCollapsed = this.collapsed
    this.collapsed = collapsed
    const height = collapsed ? COLLAPSED_HEIGHT : this.expandedHeight

    let resolveResize!: (value: boolean) => void
    const completion = new Promise<boolean>((resolve) => {
      resolveResize = resolve
    })
    this.pending = completion
    this.finishResize = () => {
      clearTimeout(this.resizeTimer)
      this.finishResize = undefined
      this.pending = undefined
      // Let the last native frame and the IPC reply finish before synchronous I/O.
      // A new toggle cancels this trailing save; close still flushes immediately.
      this.scheduleSave()
      resolveResize(this.collapsed)
    }
    // 'resized' normally completes the request. A missing event must not lock IPC.
    this.resizeTimer = setTimeout(() => this.finishResize?.(), RESIZE_TIMEOUT_MS)
    try {
      this.window.setBounds({ ...bounds, height }, animate)
      if (!animate || bounds.height === height) this.finishResize?.()
    } catch (error) {
      this.collapsed = previousCollapsed
      this.finishResize?.()
      throw error
    }
    return completion
  }

  private scheduleSave = (): void => {
    if (this.pending) return
    clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(this.flush, WINDOW_SAVE_DELAY_MS)
  }

  private onResized = (): void => {
    if (this.finishResize) this.finishResize()
    else this.scheduleSave()
  }

  flush = (): void => {
    clearTimeout(this.saveTimer)
    if (this.window.isDestroyed()) return
    const bounds = this.window.getBounds()
    if (!this.collapsed && !this.pending) {
      this.expandedHeight = normalizeExpandedHeight(bounds.height)
    }
    const snapshot: SavedWindowState = {
      isCollapsed: this.collapsed,
      // Closing mid-animation should restore its intended height, not a partial frame.
      windowBounds: this.pending
        ? { ...bounds, height: this.collapsed ? COLLAPSED_HEIGHT : this.expandedHeight }
        : bounds,
      expandedHeight: this.expandedHeight
    }
    const serialized = JSON.stringify(snapshot)
    if (serialized === this.lastSaved) return
    try {
      this.persist(snapshot)
      this.lastSaved = serialized
    } catch {
      // A disk error must not leave the window transition or its button stuck.
      console.warn('Could not save window geometry')
    }
  }

  private dispose = (): void => {
    this.finishResize?.()
    clearTimeout(this.saveTimer)
    clearTimeout(this.resizeTimer)
    this.window.removeListener('move', this.scheduleSave)
    this.window.removeListener('resize', this.scheduleSave)
    this.window.removeListener('resized', this.onResized)
    this.window.removeListener('close', this.flush)
    this.window.removeListener('closed', this.dispose)
  }
}
