import './globals.css'
import './assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { SettingsWindow } from './SettingsWindow'

// 根据 hash 判断：独立 Settings 窗口 vs 主窗口
const isSettingsWindow = /#?settings\//.test(window.location.hash)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isSettingsWindow ? <SettingsWindow /> : <App />}
  </StrictMode>
)
