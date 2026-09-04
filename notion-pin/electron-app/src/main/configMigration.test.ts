import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { prepareLocalConfig, stripObsoleteLocalState } from './configMigration'

const temporaryDirectories: string[] = []

function makeTemporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'notionpin-config-test-'))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('local configuration migration', () => {
  it('removes obsolete access state while preserving Notion configuration', () => {
    expect(
      stripObsoleteLocalState({
        encryptedToken: 'encrypted-placeholder',
        databaseId: 'database-id',
        entitlement: { plan: 'legacy' }
      })
    ).toEqual({
      encryptedToken: 'encrypted-placeholder',
      databaseId: 'database-id'
    })
  })

  it('migrates a legacy file without copying obsolete access state', () => {
    const directory = makeTemporaryDirectory()
    const legacyPath = join(directory, 'legacy.json')
    const currentPath = join(directory, 'current', 'config.json')
    writeFileSync(
      legacyPath,
      JSON.stringify({
        encryptedToken: 'encrypted-placeholder',
        databaseId: 'database-id',
        fieldMapping: { textPropertyId: 'title' },
        entitlement: { plan: 'legacy' }
      })
    )

    expect(prepareLocalConfig(legacyPath, currentPath)).toEqual({ status: 'migrated' })
    expect(JSON.parse(readFileSync(currentPath, 'utf8'))).toEqual({
      encryptedToken: 'encrypted-placeholder',
      databaseId: 'database-id',
      fieldMapping: { textPropertyId: 'title' }
    })
  })

  it('does not overwrite an existing destination', () => {
    const directory = makeTemporaryDirectory()
    const legacyPath = join(directory, 'legacy.json')
    const currentPath = join(directory, 'current.json')
    writeFileSync(legacyPath, JSON.stringify({ databaseId: 'legacy' }))
    writeFileSync(currentPath, JSON.stringify({ databaseId: 'current' }))

    expect(prepareLocalConfig(legacyPath, currentPath)).toEqual({ status: 'current-exists' })
    expect(JSON.parse(readFileSync(currentPath, 'utf8'))).toEqual({ databaseId: 'current' })
  })

  it('cleans an existing destination in place', () => {
    const directory = makeTemporaryDirectory()
    const currentPath = join(directory, 'current.json')
    writeFileSync(
      currentPath,
      JSON.stringify({ databaseId: 'current', entitlement: { plan: 'legacy' } })
    )

    expect(prepareLocalConfig(join(directory, 'missing.json'), currentPath)).toEqual({
      status: 'cleaned'
    })
    expect(JSON.parse(readFileSync(currentPath, 'utf8'))).toEqual({ databaseId: 'current' })
  })
})
