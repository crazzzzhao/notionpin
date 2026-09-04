import { describe, expect, it } from 'vitest'
import {
  isAllowedNotionUrl,
  isValidFieldMapping,
  isValidNotionToken,
  isValidQueryTasksInput,
  isValidUpdateTaskInput,
  normalizeNotionId,
  normalizeWindowSize,
  parseDatabaseId
} from './validation'

const compactId = '0123456789abcdef0123456789abcdef'
const uuid = '01234567-89ab-cdef-0123-456789abcdef'

describe('Notion identifiers', () => {
  it('normalizes compact IDs and UUIDs', () => {
    expect(normalizeNotionId(compactId.toUpperCase())).toBe(compactId)
    expect(normalizeNotionId(uuid)).toBe(compactId)
  })

  it('extracts IDs from supported Notion URLs, including titled paths', () => {
    expect(parseDatabaseId(`https://www.notion.so/${compactId}?v=123`)).toBe(compactId)
    expect(parseDatabaseId(`https://workspace.notion.site/My-Tasks-${compactId}`)).toBe(compactId)
    expect(parseDatabaseId(`https://app.notion.com/My-Tasks-${compactId}`)).toBe(compactId)
  })

  it('rejects malformed IDs and IDs embedded on unrelated hosts', () => {
    expect(parseDatabaseId('not-an-id')).toBeNull()
    expect(parseDatabaseId(`https://example.com/${compactId}`)).toBeNull()
    expect(parseDatabaseId(`https://notion.so.evil.example/${compactId}`)).toBeNull()
  })
})

describe('external URL validation', () => {
  it('allows HTTPS Notion domains', () => {
    expect(isAllowedNotionUrl(`https://www.notion.so/${compactId}`)).toBe(true)
    expect(isAllowedNotionUrl(`https://app.notion.com/${compactId}`)).toBe(true)
  })

  it('rejects unsafe schemes, credentials, ports, and deceptive domains', () => {
    expect(isAllowedNotionUrl(`http://notion.so/${compactId}`)).toBe(false)
    expect(isAllowedNotionUrl(`file:///tmp/${compactId}`)).toBe(false)
    expect(isAllowedNotionUrl(`https://user:pass@notion.so/${compactId}`)).toBe(false)
    expect(isAllowedNotionUrl(`https://notion.so:8443/${compactId}`)).toBe(false)
    expect(isAllowedNotionUrl(`https://notion.so.evil.example/${compactId}`)).toBe(false)
  })
})

describe('IPC input validation', () => {
  it('accepts supported token shapes without exposing a real token', () => {
    const exampleSuffix = 'example_token_value'
    expect(isValidNotionToken(`secret_${exampleSuffix}`)).toBe(true)
    expect(isValidNotionToken(`ntn_${exampleSuffix}`)).toBe(true)
    expect(isValidNotionToken('invalid-token')).toBe(false)
  })

  it('validates field mappings', () => {
    expect(
      isValidFieldMapping({
        textPropertyId: 'title',
        statusPropertyId: 'status',
        timePropertyId: 'date',
        boundDataSourceId: null
      })
    ).toBe(true)
    expect(isValidFieldMapping({ textPropertyId: [], statusPropertyId: null })).toBe(false)
  })

  it('validates query filters and cursors', () => {
    expect(isValidQueryTasksInput(undefined)).toBe(true)
    expect(isValidQueryTasksInput({ statusFilter: 'in-progress', cursor: 'cursor' })).toBe(true)
    expect(isValidQueryTasksInput({ statusFilter: 'archived' })).toBe(false)
    expect(isValidQueryTasksInput({ cursor: '' })).toBe(false)
  })

  it('validates task updates and rejects duplicates or malformed values', () => {
    expect(
      isValidUpdateTaskInput({
        pageId: uuid,
        updates: [
          { field: 'title', value: 'Updated title' },
          { field: 'due', value: '2026-09-04' }
        ]
      })
    ).toBe(true)
    expect(
      isValidUpdateTaskInput({
        pageId: uuid,
        updates: [
          { field: 'title', value: 'First' },
          { field: 'title', value: 'Second' }
        ]
      })
    ).toBe(false)
    expect(
      isValidUpdateTaskInput({ pageId: 'invalid', updates: [{ field: 'due', value: 'tomorrow' }] })
    ).toBe(false)
  })

  it('normalizes finite window dimensions and rejects non-numeric input', () => {
    expect(normalizeWindowSize(300.4, 20, 400, 52)).toEqual({ width: 400, height: 52 })
    expect(normalizeWindowSize(9000, 9000, 400, 52)).toEqual({ width: 4096, height: 4096 })
    expect(normalizeWindowSize(Number.NaN, 500, 400, 52)).toBeNull()
    expect(normalizeWindowSize('500', 500, 400, 52)).toBeNull()
  })
})
