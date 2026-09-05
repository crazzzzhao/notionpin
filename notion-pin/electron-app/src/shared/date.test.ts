import { describe, expect, it } from 'vitest'
import { parseNotionDate } from './date'

describe('Notion dates', () => {
  it('parses date-only values as local calendar dates', () => {
    const date = parseNotionDate('2026-09-05')

    expect(date).not.toBeNull()
    expect(date?.getFullYear()).toBe(2026)
    expect(date?.getMonth()).toBe(8)
    expect(date?.getDate()).toBe(5)
    expect(date?.getHours()).toBe(0)
  })

  it('rejects invalid calendar dates and malformed values', () => {
    expect(parseNotionDate('2026-02-30')).toBeNull()
    expect(parseNotionDate('not-a-date')).toBeNull()
  })
})
