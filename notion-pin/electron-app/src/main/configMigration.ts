import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { isRecord } from '../shared/validation'

export interface ConfigMigrationResult {
  status: 'migrated' | 'cleaned' | 'current-exists' | 'legacy-missing' | 'invalid'
}

export function stripObsoleteLocalState(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) return null

  const sanitized = { ...value }
  delete sanitized.entitlement
  return sanitized
}

function readConfig(path: string): Record<string, unknown> | null {
  try {
    return stripObsoleteLocalState(JSON.parse(readFileSync(path, 'utf8')))
  } catch {
    return null
  }
}

function writeConfigAtomically(path: string, value: Record<string, unknown>): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  const temporaryPath = `${path}.migration-${process.pid}`
  writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
  renameSync(temporaryPath, path)
}

export function prepareLocalConfig(legacyPath: string, currentPath: string): ConfigMigrationResult {
  if (existsSync(currentPath)) {
    const currentConfig = readConfig(currentPath)
    if (!currentConfig) return { status: 'invalid' }

    const rawConfig = JSON.parse(readFileSync(currentPath, 'utf8')) as unknown
    if (isRecord(rawConfig) && Object.hasOwn(rawConfig, 'entitlement')) {
      writeConfigAtomically(currentPath, currentConfig)
      return { status: 'cleaned' }
    }
    return { status: 'current-exists' }
  }

  if (!existsSync(legacyPath)) return { status: 'legacy-missing' }

  const legacyConfig = readConfig(legacyPath)
  if (!legacyConfig) return { status: 'invalid' }

  writeConfigAtomically(currentPath, legacyConfig)
  return { status: 'migrated' }
}
