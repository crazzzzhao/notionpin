import { describe, expect, it } from 'vitest'
import {
  isAllowedNotionUrl,
  isFieldMappingCompatible,
  isValidFieldMapping,
  isValidNotionToken,
  isValidQueryTasksInput,
  isValidSettingsInput,
  isValidUpdateTaskInput,
  isTrustedRendererUrl,
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
    expect(parseDatabaseId(`https://workspace.notion.so/My-Tasks-${compactId}`)).toBe(compactId)
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
    expect(isAllowedNotionUrl(`https://workspace.notion.so/${compactId}`)).toBe(true)
  })

  it('rejects unsafe schemes, credentials, ports, and deceptive domains', () => {
    expect(isAllowedNotionUrl(`http://notion.so/${compactId}`)).toBe(false)
    expect(isAllowedNotionUrl(`file:///tmp/${compactId}`)).toBe(false)
    expect(isAllowedNotionUrl(`https://user:pass@notion.so/${compactId}`)).toBe(false)
    expect(isAllowedNotionUrl(`https://notion.so:8443/${compactId}`)).toBe(false)
    expect(isAllowedNotionUrl(`https://notion.so.evil.example/${compactId}`)).toBe(false)
    expect(isAllowedNotionUrl(`https://app.notion.com/${compactId}`)).toBe(false)
    expect(isAllowedNotionUrl(`https://workspace.notion.site/${compactId}`)).toBe(false)
  })
})

describe('IPC input validation', () => {
  it('accepts supported token shapes without exposing a real token', () => {
    const exampleSuffix = 'example_token_value'
    expect(isValidNotionToken(`secret_${exampleSuffix}`)).toBe(true)
    expect(isValidNotionToken(`ntn_${exampleSuffix}`)).toBe(true)
    expect(isValidNotionToken('invalid-token')).toBe(false)
  })

  it('validates complete settings objects and rejects malformed payloads', () => {
    const validSettings = {
      token: 'ntn_example_token_value',
      databaseUrl: `https://www.notion.so/Tasks-${compactId}`
    }

    expect(isValidSettingsInput(validSettings)).toBe(true)
    expect(isValidSettingsInput(null)).toBe(false)
    expect(isValidSettingsInput([])).toBe(false)
    expect(isValidSettingsInput({ ...validSettings, token: 'invalid-token' })).toBe(false)
    expect(
      isValidSettingsInput({ ...validSettings, databaseUrl: 'https://example.com/tasks' })
    ).toBe(false)
    expect(isValidSettingsInput({ token: validSettings.token })).toBe(false)
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
    expect(
      isValidFieldMapping({
        textPropertyId: null,
        statusPropertyId: null,
        timePropertyId: null
      })
    ).toBe(false)
    expect(isValidFieldMapping({ textPropertyId: [], statusPropertyId: null })).toBe(false)
  })

  it('requires field mappings to match the current schema types', () => {
    const mapping = {
      textPropertyId: 'name',
      statusPropertyId: 'state',
      timePropertyId: 'due'
    }
    const schema = [
      { id: 'name', type: 'title' },
      { id: 'state', type: 'status' },
      { id: 'due', type: 'date' }
    ]

    expect(isFieldMappingCompatible(mapping, schema)).toBe(true)
    expect(
      isFieldMappingCompatible(mapping, [
        ...schema.filter((property) => property.id !== 'state'),
        { id: 'state', type: 'select' }
      ])
    ).toBe(false)
    expect(isFieldMappingCompatible({ ...mapping, timePropertyId: null }, schema)).toBe(false)
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

  it('validates the exact packaged renderer or the configured development origin', () => {
    const packaged =
      'file:///Applications/NotionPin.app/Contents/Resources/app.asar/out/renderer/index.html'
    expect(isTrustedRendererUrl(`${packaged}#settings`, packaged, false)).toBe(true)
    expect(isTrustedRendererUrl('file:///tmp/index.html', packaged, false)).toBe(false)
    expect(isTrustedRendererUrl('http://localhost:5173/app', 'http://localhost:5173/', true)).toBe(
      true
    )
    expect(isTrustedRendererUrl('http://evil.local:5173/', 'http://localhost:5173/', true)).toBe(
      false
    )
  })
})
