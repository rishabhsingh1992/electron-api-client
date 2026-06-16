// main.js
// This is the "backend" of the Electron app (the main process).
// It creates the browser window and handles actual HTTP requests.
// Using ESM (import/export) and async/await throughout.

import { app, BrowserWindow, ipcMain } from 'electron'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

// ESM modules don't have __dirname built in — we derive it from import.meta.url
const __dirname = dirname(fileURLToPath(import.meta.url))

// --- WINDOW SETUP ---

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'API Client',
    webPreferences: {
      // preload.js runs before the renderer and safely bridges
      // the main process and the renderer process
      preload: join(__dirname, 'preload.js'),
      // contextIsolation: true means the renderer cannot access Node.js directly
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.loadFile('renderer/index.html')
}

// Top-level await is allowed in ESM — cleaner than .then()
await app.whenReady()
createWindow()

// On macOS, re-create the window when the dock icon is clicked and no windows are open
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

// On Windows/Linux, quit the app when all windows are closed
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// --- IPC: HANDLE HTTP REQUESTS ---
// ipcMain.handle listens for messages sent from the renderer process.
// The renderer sends a request config; we make the HTTP call and return the result.

ipcMain.handle('send-request', async (_event, requestConfig) => {
  return makeHttpRequest(requestConfig)
})

// --- HTTP REQUEST FUNCTION ---
// Uses the global fetch() API (available in Node 18+ / Electron 28+).
// AbortController lets us cancel the request if it takes too long.

async function makeHttpRequest(config) {
  const { method, url, headers, body } = config

  // Validate the URL before attempting a request
  try {
    new URL(url)
  } catch {
    throw new Error(`"${url}" is not a valid URL. Make sure it starts with http:// or https://`)
  }

  // AbortController lets us enforce a 30-second timeout
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 30_000)

  const startTime = Date.now()

  try {
    const response = await fetch(url, {
      method: method.toUpperCase(),
      headers: headers ?? {},
      // Only attach a body for methods that support it
      body: body && ['POST', 'PUT', 'PATCH'].includes(method.toUpperCase()) ? body : undefined,
      signal: controller.signal
    })

    const responseBody = await response.text()
    const duration = Date.now() - startTime

    // Convert the Headers object into a plain key/value object for easy display
    const responseHeaders = {}
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value
    })

    return {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
      body: responseBody,
      duration
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Request timed out after 30 seconds')
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}
