// app.js
// This is the "frontend" JavaScript that runs inside the browser window.
// It handles all UI interactions: tab switching, building the request,
// and displaying the response.
//
// To make actual HTTP calls, it uses window.api.sendRequest() which was
// defined in preload.js and communicates with the Electron main process.

// =============================================================
//  INITIALIZATION
//  This file is loaded as type="module" so it is deferred — the
//  browser only runs it after the full HTML has been parsed.
//  No DOMContentLoaded wrapper needed.
// =============================================================

setupTabSwitching()
addHeaderRow()     // start with one empty header row
setupSendButton()

// =============================================================
//  TAB SWITCHING
//  Handles clicking tabs to show/hide panels.
//  Works for both the request tabs and response tabs.
// =============================================================

function setupTabSwitching() {
  // Select every ".tabs" container on the page
  const allTabContainers = document.querySelectorAll('.tabs')

  allTabContainers.forEach((tabsContainer) => {
    const tabButtons = tabsContainer.querySelectorAll('.tabs__tab')
    const tabPanels = tabsContainer.querySelectorAll('.tabs__panel')

    tabButtons.forEach((button) => {
      button.addEventListener('click', () => {
        // 1. Deactivate all tabs and panels in this group
        tabButtons.forEach((btn) => btn.classList.remove('tabs__tab--active'))
        tabPanels.forEach((panel) => panel.classList.remove('tabs__panel--active'))

        // 2. Activate the clicked tab
        button.classList.add('tabs__tab--active')

        // 3. Show the matching panel (panel id = "tab-" + button's data-tab attribute)
        const targetPanelId = 'tab-' + button.getAttribute('data-tab')
        const targetPanel = document.getElementById(targetPanelId)
        if (targetPanel) {
          targetPanel.classList.add('tabs__panel--active')
        }
      })
    })
  })
}

// =============================================================
//  HEADER EDITOR
//  Lets the user add/remove request headers as key-value pairs.
// =============================================================

// Add a new editable row to the request headers list.
// Optional key and value params pre-fill the inputs.
function addHeaderRow(key = '', value = '') {
  const container = document.getElementById('header-rows-container')

  const row = document.createElement('div')
  row.className = 'header-editor__row'

  const keyInput = document.createElement('input')
  keyInput.type = 'text'
  keyInput.className = 'header-editor__key'
  keyInput.placeholder = 'e.g. Content-Type'
  keyInput.value = key

  const valueInput = document.createElement('input')
  valueInput.type = 'text'
  valueInput.className = 'header-editor__value'
  valueInput.placeholder = 'e.g. application/json'
  valueInput.value = value

  const deleteBtn = document.createElement('button')
  deleteBtn.className = 'header-editor__delete-btn'
  deleteBtn.innerHTML = '&times;'
  deleteBtn.title = 'Remove header'
  deleteBtn.addEventListener('click', () => row.remove())

  row.appendChild(keyInput)
  row.appendChild(valueInput)
  row.appendChild(deleteBtn)

  container.appendChild(row)
}

// Read all filled-in header rows and return them as a plain object.
// Example: { "Content-Type": "application/json", "Authorization": "Bearer abc" }
function collectHeaders() {
  const result = {}
  const rows = document.querySelectorAll('#header-rows-container .header-editor__row')

  rows.forEach((row) => {
    const key = row.querySelector('.header-editor__key').value.trim()
    const value = row.querySelector('.header-editor__value').value.trim()

    // Skip rows where either the key or value is empty
    if (key && value) {
      result[key] = value
    }
  })

  return result
}

// Wire up the "+ Add Header" button
document.getElementById('add-header-btn').addEventListener('click', () => addHeaderRow())

// =============================================================
//  SEND REQUEST
// =============================================================

function setupSendButton() {
  const sendBtn = document.getElementById('send-btn')
  const urlInput = document.getElementById('url-input')

  sendBtn.addEventListener('click', sendRequest)

  // Allow pressing Enter in the URL input to trigger Send
  urlInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') sendRequest()
  })
}

async function sendRequest() {
  const method = document.getElementById('method-select').value
  const url = document.getElementById('url-input').value.trim()
  const bodyText = document.getElementById('request-body').value.trim()

  if (!url) {
    showError('Please enter a URL before sending.')
    return
  }

  const headers = collectHeaders()

  // Build the config object to hand off to the main process
  const requestConfig = {
    method,
    url,
    headers,
    body: bodyText || null
  }

  setLoadingState(true)
  clearResponse()

  try {
    // window.api is exposed by preload.js using contextBridge.
    // This call goes to ipcMain.handle('send-request') in main.js.
    const response = await window.api.sendRequest(requestConfig)
    displayResponse(response)
  } catch (error) {
    showError(error.message)
  } finally {
    setLoadingState(false)
  }
}

// =============================================================
//  DISPLAY RESPONSE
// =============================================================

function displayResponse(response) {
  const { status, statusText, headers, body, duration } = response

  // --- Status badge ---
  const statusEl = document.getElementById('response-status')
  statusEl.textContent = `${status} ${statusText}`
  statusEl.className = 'response-meta__status ' + getStatusModifier(status)

  // --- Duration ---
  document.getElementById('response-time').textContent = `${duration} ms`

  // --- Response body ---
  const bodyEl = document.getElementById('response-body')
  bodyEl.className = 'response-body' // clear any modifier classes

  // Try to parse and pretty-print if the response is JSON
  try {
    const parsed = JSON.parse(body)
    bodyEl.innerHTML = syntaxHighlight(JSON.stringify(parsed, null, 2))
  } catch {
    // Not JSON — display as plain text
    bodyEl.textContent = body || '(empty response body)'
  }

  // --- Response headers ---
  const headersTable = document.getElementById('response-headers-table')
  headersTable.innerHTML = ''

  const headerEntries = Object.entries(headers)

  if (headerEntries.length === 0) {
    headersTable.innerHTML = '<p class="header-table__empty">No headers in response.</p>'
    return
  }

  headerEntries.forEach(([key, value]) => {
    const row = document.createElement('div')
    row.className = 'header-table__row'

    const keyEl = document.createElement('span')
    keyEl.className = 'header-table__key'
    keyEl.textContent = key

    const valueEl = document.createElement('span')
    valueEl.className = 'header-table__value'
    valueEl.textContent = value

    row.appendChild(keyEl)
    row.appendChild(valueEl)
    headersTable.appendChild(row)
  })
}

// Returns a BEM modifier class based on the HTTP status code range.
// 2xx → success (green), 3xx → redirect (yellow), 4xx/5xx → error (red)
function getStatusModifier(status) {
  if (status >= 200 && status < 300) return 'response-meta__status--success'
  if (status >= 300 && status < 400) return 'response-meta__status--redirect'
  return 'response-meta__status--error'
}

// Wraps JSON tokens in <span> tags so we can color them via inline styles.
// This is a simple manual implementation so there's no external dependency.
function syntaxHighlight(json) {
  // Escape HTML special characters to prevent XSS
  const escaped = json
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // Regex captures: strings, numbers, booleans, null, keys, punctuation
  return escaped.replace(
    /("(\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
    (match) => {
      let color = '#a6e3a1'  // number → green

      if (/^"/.test(match)) {
        if (/:$/.test(match)) {
          color = '#89b4fa'  // key → blue
        } else {
          color = '#f9e2af'  // string value → yellow
        }
      } else if (/true|false/.test(match)) {
        color = '#cba6f7'    // boolean → purple
      } else if (/null/.test(match)) {
        color = '#f38ba8'    // null → red
      }

      return `<span style="color:${color}">${match}</span>`
    }
  )
}

// =============================================================
//  UI HELPERS
// =============================================================

function clearResponse() {
  const statusEl = document.getElementById('response-status')
  statusEl.textContent = ''
  statusEl.className = 'response-meta__status'

  document.getElementById('response-time').textContent = ''

  const bodyEl = document.getElementById('response-body')
  bodyEl.innerHTML = ''
  bodyEl.className = 'response-body'

  document.getElementById('response-headers-table').innerHTML =
    '<p class="header-table__empty">No response yet.</p>'
}

function showError(message) {
  const bodyEl = document.getElementById('response-body')
  bodyEl.textContent = '⚠ ' + message
  bodyEl.className = 'error-message'
}

function setLoadingState(isLoading) {
  const sendBtn = document.getElementById('send-btn')
  sendBtn.disabled = isLoading
  sendBtn.textContent = isLoading ? 'Sending…' : 'Send'

  if (isLoading) {
    sendBtn.classList.add('url-bar__send-btn--loading')
  } else {
    sendBtn.classList.remove('url-bar__send-btn--loading')
  }
}
