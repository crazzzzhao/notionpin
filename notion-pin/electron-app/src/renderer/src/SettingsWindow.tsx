/**
 * Settings 独立窗口 - 不卡在主窗口内，可自由拖拽
 */
import { useEffect, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SettingsModal } from '@/components/SettingsModal'
import type { FieldMapping } from '../../preload'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, retry: false }
  }
})

function parseHashTab(): 'connection' | 'field-mapping' {
  const hash = window.location.hash
  const match = hash.match(/#?settings\/(connection|field-mapping)/)
  if (match) {
    return match[1] as 'connection' | 'field-mapping'
  }
  return 'connection'
}

function SettingsWindowContent(): React.JSX.Element {
  const [initialTab, setInitialTab] = useState<'connection' | 'field-mapping'>(() =>
    parseHashTab()
  )
  const [settings, setSettings] = useState<{
    databaseUrl: string | null
    fieldMapping: FieldMapping | null
    dataSourceId: string | null
  }>({ databaseUrl: null, fieldMapping: null, dataSourceId: null })

  useEffect(() => {
    window.settingsAPI.load().then((data) => {
      setSettings({
        databaseUrl: data.databaseUrl,
        fieldMapping: data.fieldMapping,
        dataSourceId: data.dataSourceId
      })
    })
  }, [])

  useEffect(() => {
    const unsub = window.windowAPI.onSettingsSetTab((tab) => {
      setInitialTab(tab as 'connection' | 'field-mapping')
    })
    return unsub
  }, [])

  const handleClose = (): void => {
    window.windowAPI.closeCurrentWindow()
  }

  const handleSaved = async (): Promise<void> => {
    await window.notionAPI.clearCache()
  }

  return (
    <div className="h-screen w-full flex flex-col bg-background overflow-hidden">
      <SettingsModal
        isOpen={true}
        onClose={handleClose}
        onSaved={handleSaved}
        initialDatabaseUrl={settings.databaseUrl || ''}
        initialFieldMapping={settings.fieldMapping}
        initialDataSourceId={settings.dataSourceId}
        initialTab={initialTab}
        standalone={true}
      />
    </div>
  )
}

export function SettingsWindow(): React.JSX.Element {
  return (
    <QueryClientProvider client={queryClient}>
      <SettingsWindowContent />
    </QueryClientProvider>
  )
}
