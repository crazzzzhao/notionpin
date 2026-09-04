const noop = async (): Promise<void> => {}
const unsubscribe = (): void => {}
const isElectron = navigator.userAgent.includes('Electron/')

if (typeof window !== 'undefined' && !isElectron && !window.windowAPI) {
  window.windowAPI = {
    toggleCollapsed: async () => false,
    getWindowState: async () => ({ isCollapsed: false, bounds: null }),
    setWindowState: noop,
    close: noop,
    minimize: noop,
    resize: noop,
    openSettings: noop,
    onSettingsWindowClosed: () => unsubscribe,
    onSettingsSetTab: () => unsubscribe,
    closeCurrentWindow: noop,
    openExternal: async () => ({ success: true })
  }

  window.settingsAPI = {
    save: async () => ({ success: true }),
    load: async () => ({
      isTokenConfigured: false,
      databaseId: null,
      databaseUrl: null,
      dataSourceId: null,
      fieldMapping: null
    }),
    saveFieldMapping: async () => ({ success: true }),
    clear: async () => ({ success: true })
  }

  window.notionAPI = {
    testConnection: async () => ({
      success: false,
      error: {
        code: 'browser-preview',
        message: 'Notion API unavailable in browser preview',
        userMessage: 'Notion API unavailable in browser preview'
      }
    }),
    getSchema: async () => ({
      success: false,
      error: {
        code: 'browser-preview',
        message: 'Schema unavailable in browser preview',
        userMessage: 'Schema unavailable in browser preview'
      }
    }),
    saveFieldMapping: async () => ({ success: true }),
    loadFieldMapping: async () => ({
      mapping: null,
      status: 'not_configured' as const
    }),
    queryTasks: async () => ({
      success: true,
      tasks: [],
      hasMore: false,
      nextCursor: null,
      totalFetched: 0
    }),
    getDatabaseInfo: async () => ({
      success: false,
      error: {
        code: 'browser-preview',
        message: 'Database info unavailable in browser preview',
        userMessage: 'Database info unavailable in browser preview'
      }
    }),
    getDatabaseSchema: async () => ({
      success: false,
      error: {
        code: 'browser-preview',
        message: 'Database schema unavailable in browser preview',
        userMessage: 'Database schema unavailable in browser preview'
      }
    }),
    updateTask: async () => ({
      success: false,
      error: {
        code: 'browser-preview',
        message: 'Task updates unavailable in browser preview',
        userMessage: 'Task updates unavailable in browser preview'
      }
    }),
    clearCache: async () => ({ success: true })
  }
}
