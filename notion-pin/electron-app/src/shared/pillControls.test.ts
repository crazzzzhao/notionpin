import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const components = join(dirname(fileURLToPath(import.meta.url)), '../renderer/src/components')

describe('pill-shaped tabs and settings actions', () => {
  it('rounds the tab rail, selected background and buttons without an inline override', () => {
    const tabs = readFileSync(join(components, 'ui/tabs.tsx'), 'utf8')
    expect(tabs.match(/rounded-full/g)).toHaveLength(3)
    expect(tabs).not.toContain('borderRadius:')
    expect(tabs).toContain('rounded-full p-1')
    expect(tabs).toContain('absolute top-0 left-0 rounded-full pointer-events-none')
  })

  it('keeps settings actions rounded, with minimum heights that allow text to wrap', () => {
    const settings = readFileSync(join(components, 'SettingsModal.tsx'), 'utf8')
    expect(settings.match(/min-h-9 max-w-full px-\[18px\] rounded-full/g)).toHaveLength(3)
    expect(settings.match(/min-h-8 max-w-full px-3 rounded-full/g)).toHaveLength(2)
    expect(settings).not.toMatch(/h-(?:8|9) px-(?:3|\[18px\]) rounded-lg/)
  })
})
