import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '../..')
const repositoryRoot = join(appRoot, '../..')

describe('unsigned macOS release safeguards', () => {
  it('seals the app with an ad-hoc signature while keeping notarization disabled', () => {
    const config = readFileSync(join(appRoot, 'electron-builder.yml'), 'utf8')

    expect(config).toMatch(/^ {2}identity: '-'$/m)
    expect(config).toMatch(/^ {2}hardenedRuntime: true$/m)
    expect(config).toMatch(/^ {2}notarize: false$/m)
    expect(config).toMatch(/^ {2}entitlements: build\/entitlements\.mac\.plist$/m)
    expect(config).toMatch(/^ {2}entitlementsInherit: build\/entitlements\.mac\.plist$/m)
  })

  it('limits signing exceptions to Electron JIT and ad-hoc library loading', () => {
    const entitlements = readFileSync(join(appRoot, 'build/entitlements.mac.plist'), 'utf8')
    const keys = [...entitlements.matchAll(/<key>([^<]+)<\/key>/g)].map((match) => match[1])

    expect(keys.sort()).toEqual([
      'com.apple.security.cs.allow-jit',
      'com.apple.security.cs.disable-library-validation'
    ])
  })

  it('verifies artifacts before publishing and includes the unsigned opening instructions', () => {
    const workflow = readFileSync(join(repositoryRoot, '.github/workflows/release.yml'), 'utf8')
    const notes = readFileSync(join(repositoryRoot, 'docs/releases/unsigned-macos.md'), 'utf8')

    expect(workflow).toContain('electron-builder --mac --x64 --publish never')
    expect(workflow).toContain('electron-builder --mac --arm64 --publish never')
    expect(workflow).toContain('codesign --verify --deep --strict')
    expect(workflow).toContain('hdiutil verify')
    expect(workflow.indexOf('codesign --verify')).toBeLessThan(
      workflow.indexOf('gh release create')
    )
    expect(workflow).toContain('--notes-file ../../docs/releases/unsigned-macos.md')
    expect(workflow).toContain('Unsigned / 未签名')
    expect(notes).toContain('隐私与安全性')
    expect(notes).toContain('Privacy & Security')
    expect(notes).toContain('support.apple.com/zh-cn/guide/mac-help/mh40616/mac')
  })
})
