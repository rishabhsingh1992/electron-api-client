// main.js
// This is the "backend" of the Electron app (the main process).
// It creates the browser window and handles actual HTTP requests
// using Node.js, since the renderer (browser) cannot make arbitrary HTTP calls.

const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const http = require('http')
const https = require('https')
const { URL } = require('url')

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
      preload: path.join(__dirname, 'preload.js'),
      // contextIsolation: true means the renderer cannot access Node.js directly
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.loadFile('renderer/index.html')
}

app.whenReady().then(createWindow)

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

ipcMain.handle('send-request', async (event, requestConfig) => {
  return makeHttpRequest(requestConfig)
})

// --- HTTP REQUEST FUNCTION ---
// Uses Node.js built-in http/https modules to make the actual network call.

function makeHttpRequest(config) {
  return new Promise((resolve, reject) => {
    const { method, url, headers, body } = config

    // Parse and validate the URL
    let parsedUrl
    try {
      parsedUrl = new URL(url)
    } catch {
      return reject(new Error(`"${url}" is not a valid URL. Make sure it starts with http:// or https://`))
    }

    // Choose http or https module based on the URL protocol
    const isHttps = parsedUrl.protocol === 'https:'
    const httpModule = isHttps ? https : http

    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: method.toUpperCase(),
      headers: headers || {},
      // Abort the request if it takes longer than 30 seconds
      timeout: 30000
    }

    const startTime = Date.now()

    const req = httpModule.request(options, (res) => {
      let responseBody = ''

      // Collect response data chunk by chunk
      res.on('data', (chunk) => {
        responseBody += chunk
      })

      // When all data has arrived, resolve the promise with the full response
      res.on('end', () => {
        const duration = Date.now() - startTime
        resolve({
          status: res.statusCode,
          statusText: res.statusMessage,
          headers: res.headers,
          body: responseBody,
          duration
        })
      })
    })

    // Handle network errors (e.g. server unreachable, DNS failure)
    req.on('error', (err) => {
      reject(new Error(err.message))
    })

    // Handle timeout
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('Request timed out after 30 seconds'))
    })

    // Send request body for methods that support it
    if (body && ['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
      req.write(body)
    }

    req.end()
  })
}
