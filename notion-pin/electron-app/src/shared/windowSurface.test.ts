import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const sourceRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

describe('single-owner macOS window surface', () => {
  it('leaves the outer rounded clip, blur and shadow to the native window', () => {
    const css = readFileSync(join(sourceRoot, 'renderer/src/globals.css'), 'utf8')
    const surface = css.match(/^\.window-surface\s*\{([^}]+)\}/m)?.[1]
    expect(surface).toBeDefined()
    expect(surface).not.toMatch(/border-radius|backdrop-filter|mask-image|box-shadow/)
    const base = readFileSync(join(sourceRoot, 'renderer/src/assets/main.css'), 'utf8')
    expect(base.match(/body\s*\{([^}]+)\}/)?.[1]).not.toContain('border-radius')
    const main = readFileSync(join(sourceRoot, 'main/index.ts'), 'utf8')
    expect(main).toContain('roundedCorners: true')
    expect(main).toContain("vibrancy: 'sidebar'")
  })

  it('keeps collapsed content mounted but inaccessible, with a short opacity-only transition', () => {
    const css = readFileSync(join(sourceRoot, 'renderer/src/globals.css'), 'utf8')
    const app = readFileSync(join(sourceRoot, 'renderer/src/App.tsx'), 'utf8')
    expect(css).toContain('transition: opacity 150ms ease-out')
    expect(css).toMatch(
      /prefers-reduced-motion: reduce[\s\S]*?\.window-content\s*\{\s*transition: none/
    )
    expect(app).toContain('inert={isCollapsed}')
    expect(app).toContain('aria-hidden={isCollapsed}')
    expect(app).toContain('aria-expanded={!isCollapsed}')
    expect(app).not.toContain('onTransitionEnd')
    expect(app).not.toContain('showMain &&')
  })
})
