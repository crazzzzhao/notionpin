import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const sourceRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const bannedRuntimePatterns = [
  /billingAPI/i,
  /billing:/i,
  /BillingTab/,
  /BillingPopover/,
  /PAYWALL_LOCKED/,
  /canEdit/,
  /Pro plan/i,
  /Upgrade to Pro/i,
  /Simulate .*Purchase/i,
  /interface Entitlement/,
  /type BillingPlan/
]

function collectRuntimeSources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return collectRuntimeSources(path)
    if (!['.ts', '.tsx'].includes(extname(entry.name))) return []
    if (entry.name.endsWith('.test.ts') || entry.name === 'configMigration.ts') return []
    return [path]
  })
}

describe('open-source runtime guard', () => {
  it('contains no billing UI, bridge, IPC, or access restriction', () => {
    const violations = collectRuntimeSources(sourceRoot).flatMap((path) => {
      const source = readFileSync(path, 'utf8')
      return bannedRuntimePatterns
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `${path}: ${pattern.source}`)
    })

    expect(violations).toEqual([])
  })
})
