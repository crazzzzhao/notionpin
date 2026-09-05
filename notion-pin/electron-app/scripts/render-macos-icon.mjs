import { app, BrowserWindow } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const [sourcePath, outputPath] = process.argv.slice(2)
if (!sourcePath || !outputPath) {
  throw new Error('Usage: electron render-macos-icon.mjs source.svg output.png')
}

// Keep this build-only renderer isolated from every app's real configuration.
app.setPath('userData', join(dirname(outputPath), 'icon-renderer-profile'))
app.disableHardwareAcceleration()

app.whenReady().then(async () => {
  app.dock?.hide()
  const window = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false }
  })

  try {
    // SVG filters are rendered by Chromium; sips does not preserve all of them.
    const imageUrl = `data:image/svg+xml;base64,${readFileSync(sourcePath).toString('base64')}`
    await window.loadURL('data:text/html,<html><body></body></html>')
    const pngDataUrl = await window.webContents.executeJavaScript(`(async () => {
      const image = new Image()
      image.src = ${JSON.stringify(imageUrl)}
      await image.decode()
      if (image.naturalWidth !== 1024 || image.naturalHeight !== 1024) {
        throw new Error('The macOS icon source must be 1024 by 1024 pixels')
      }
      const canvas = document.createElement('canvas')
      canvas.width = 1024
      canvas.height = 1024
      canvas.getContext('2d').drawImage(image, 0, 0)
      return canvas.toDataURL('image/png')
    })()`)
    writeFileSync(outputPath, Buffer.from(pngDataUrl.split(',')[1], 'base64'))
    window.destroy()
    app.quit()
  } catch (error) {
    console.error('Failed to render the macOS icon:', error)
    window.destroy()
    app.exit(1)
  }
})
