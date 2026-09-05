import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../..')
const ignoredDirectories = new Set(['.agents', '.git', 'dist', 'docs', 'node_modules', 'out'])
const shippingExtensions = new Set([
  '.css',
  '.html',
  '.js',
  '.json',
  '.jsx',
  '.pen',
  '.plist',
  '.sh',
  '.svg',
  '.ts',
  '.tsx',
  '.yaml',
  '.yml'
])
const bannedRuntimePatterns = [
  /\bbilling\b/i,
  /\bsubscription\b/i,
  /\bpayment\b/i,
  /\bpurchase\b/i,
  /\bpaywall\b/i,
  /BillingTab/,
  /BillingPopover/,
  /PAYWALL_LOCKED/,
  /canEdit/,
  /Pro plan/i,
  /Upgrade to Pro/i,
  /Lifetime access/i,
  /Simulate .*Purchase/i,
  /interface Entitlement/,
  /type BillingPlan/
]

function collectShippingSources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      return ignoredDirectories.has(entry.name) ? [] : collectShippingSources(path)
    }
    if (!shippingExtensions.has(extname(entry.name))) return []
    if (
      entry.name.endsWith('.test.ts') ||
      entry.name === 'configMigration.ts' ||
      entry.name === 'package-lock.json'
    ) {
      return []
    }
    return [path]
  })
}

describe('open-source runtime guard', () => {
  it('contains no billing UI, bridge, IPC, or access restriction', () => {
    const violations = collectShippingSources(repositoryRoot).flatMap((path) => {
      const source = readFileSync(path, 'utf8')
      return bannedRuntimePatterns
        .filter((pattern) => pattern.test(path) || pattern.test(source))
        .map((pattern) => `${path}: ${pattern.source}`)
    })

    expect(violations).toEqual([])
  })
})
