import { describe, expect, it } from 'vitest'
import { getMenuPosition } from './menuPosition'

describe('task status menu placement', () => {
  const viewport = { width: 440, height: 640 }
  const menu = { width: 176, height: 104 }

  it('mirrors the leading edge in RTL without leaving the window', () => {
    expect(
      getMenuPosition({ left: 320, right: 424, top: 140, bottom: 164 }, menu, viewport, 'rtl').left
    ).toBe(248)
    expect(
      getMenuPosition({ left: 16, right: 120, top: 140, bottom: 164 }, menu, viewport, 'rtl').left
    ).toBe(8)
  })

  it('aligns the menu with the trigger, leaving a 4px gap', () => {
    expect(getMenuPosition({ left: 16, top: 140, bottom: 164 }, menu, viewport)).toEqual({
      left: 16,
      top: 168,
      maxHeight: 464
    })
  })

  it('opens above a trigger near the bottom of the window', () => {
    expect(getMenuPosition({ left: 16, top: 568, bottom: 592 }, menu, viewport)).toEqual({
      left: 16,
      top: 460,
      maxHeight: 556
    })
  })

  it('keeps an 8px inset at either horizontal edge', () => {
    expect(getMenuPosition({ left: 400, top: 100, bottom: 124 }, menu, viewport).left).toBe(256)
    expect(getMenuPosition({ left: -4, top: 100, bottom: 124 }, menu, viewport).left).toBe(8)
  })

  it('constrains long menus to the larger available space', () => {
    expect(
      getMenuPosition({ left: 16, top: 300, bottom: 324 }, { ...menu, height: 800 }, viewport)
    ).toEqual({ left: 16, top: 328, maxHeight: 304 })
    expect(
      getMenuPosition(
        { left: 16, top: 250, bottom: 274 },
        { ...menu, height: 800 },
        { width: 400, height: 420 }
      )
    ).toEqual({ left: 16, top: 8, maxHeight: 238 })
  })
})
