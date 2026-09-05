const noop = async (): Promise<void> => {}
const isElectron = navigator.userAgent.includes('Electron/')

if (typeof window !== 'undefined' && !isElectron && !window.windowAPI) {
  let isCollapsed = false
  document.documentElement.dataset.browserPreview = 'true'
  window.windowAPI = {
    setCollapsed: async (collapsed) => {
      isCollapsed = collapsed
      return isCollapsed
    },
    getWindowState: async () => ({ isCollapsed, bounds: null }),
    close: noop,
    minimize: noop,
    resize: noop,
    openExternal: async () => ({ success: true })
  }

  window.settingsAPI = {
    load: async () => ({
      isTokenConfigured: false,
      databaseId: null,
      databaseUrl: null,
      dataSourceId: null,
      fieldMapping: null
    }),
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
    queryTasks: async () => ({
      success: true,
      tasks: [],
      hasMore: false,
      nextCursor: null,
      totalFetched: 0
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
