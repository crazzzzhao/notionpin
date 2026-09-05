import { describe, expect, it } from 'vitest'
import { parseCollapseRequest } from './windowState'

describe('window collapse IPC validation', () => {
  it('accepts explicit states and reduced-motion options', () => {
    expect(parseCollapseRequest(true, undefined)).toEqual({ collapsed: true, animate: true })
    expect(parseCollapseRequest(false, { animate: false })).toEqual({
      collapsed: false,
      animate: false
    })
  })

  it('rejects malformed states and options', () => {
    for (const collapsed of [null, undefined, 0, 'false', {}]) {
      expect(() => parseCollapseRequest(collapsed, undefined)).toThrow('Invalid window transition')
    }
    for (const options of [null, [], 'false', { animate: 'no' }, { duration: 300 }]) {
      expect(() => parseCollapseRequest(true, options)).toThrow('Invalid window transition')
    }
  })
})
