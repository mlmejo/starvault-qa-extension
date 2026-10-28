// Captures every tracking.js batch POSTed to StarVault's ingest API, per tab.
// webRequest (not a page hook) so keepalive batches sent during unload —
// page_leave, the final flush — are still seen.

const INGEST_PATHS = ['/api/events', '/api/events/collect']
const MAX_EVENTS_PER_TAB = 2000

const SHORT_KEYS = {
  i: 'event_id', en: 'event_name', el: 'element_name', t: 'site', h: 'host',
  u: 'user_uuid', a: 'anonymous_id', p: 'properties', dl: 'page_url', dp: 'path',
  dr: 'referrer', s: 'session_id', st: 'source_type', sv: 'sdk_version',
  v: 'schema_version', ts: 'occurred_at',
}

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {})

function expand(event) {
  const out = {}
  for (const [key, value] of Object.entries(event || {})) out[SHORT_KEYS[key] || key] = value
  return out
}

function decodeBody(requestBody) {
  if (!requestBody || !requestBody.raw) return null
  const chunks = requestBody.raw.filter((part) => part.bytes).map((part) => new Uint8Array(part.bytes))
  const size = chunks.reduce((n, c) => n + c.length, 0)
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const c of chunks) { bytes.set(c, offset); offset += c.length }
  return new TextDecoder().decode(bytes)
}

// Same shapes IngestEventsController accepts: { d: base64 }, { e: [...] }, { events: [...] }, or one event.
function eventsFrom(text, pathname) {
  let body
  try { body = JSON.parse(text) } catch { return { events: [], parseError: 'Body is not JSON' } }
  if (pathname === '/api/events') return { events: [expand(body)] }
  if (typeof body.d === 'string' && body.d) {
    try { body = { e: JSON.parse(atob(body.d)) } } catch { return { events: [], parseError: 'Bad base64 "d" payload' } }
  }
  const list = Array.isArray(body.e) ? body.e : Array.isArray(body.events) ? body.events : null
  if (!list) return { events: [], parseError: 'No events array (expected "e" or "events")' }
  return { events: list.map(expand) }
}

// Serialise storage writes: listeners fire faster than read-modify-write completes.
let writeChain = Promise.resolve()
function updateTab(tabId, mutate) {
  writeChain = writeChain.then(async () => {
    const key = `tab:${tabId}`
    const state = (await chrome.storage.session.get(key))[key] || { batches: {}, events: [] }
    mutate(state)
    if (state.events.length > MAX_EVENTS_PER_TAB) {
      state.events = state.events.slice(-MAX_EVENTS_PER_TAB)
      const live = new Set(state.events.map((e) => e.batchId))
      for (const id of Object.keys(state.batches)) if (!live.has(id)) delete state.batches[id]
    }
    await chrome.storage.session.set({ [key]: state })
    updateBadge(tabId, state)
  }).catch((error) => console.error('[sv-qa]', error))
  return writeChain
}

function updateBadge(tabId, state) {
  const failed = Object.values(state.batches).some((b) => b.status === 'error' || (b.status >= 400))
  chrome.action.setBadgeText({ tabId, text: state.events.length ? String(state.events.length) : '' }).catch(() => {})
  chrome.action.setBadgeBackgroundColor({ tabId, color: failed ? '#d93025' : '#5b5bd6' }).catch(() => {})
}

const filter = { urls: ['*://*/api/events*'] }

function ingestPath(url) {
  try {
    const { pathname } = new URL(url)
    return INGEST_PATHS.includes(pathname) ? pathname : null
  } catch { return null }
}

chrome.webRequest.onBeforeRequest.addListener((details) => {
  const pathname = ingestPath(details.url)
  if (!pathname || details.method !== 'POST' || details.tabId < 0) return
  const text = decodeBody(details.requestBody)
  const { events, parseError } = text == null ? { events: [], parseError: 'Body not readable' } : eventsFrom(text, pathname)
  const capturedAt = Date.now()
  const batchId = details.requestId

  updateTab(details.tabId, (state) => {
    state.batches[batchId] = {
      id: batchId, url: details.url, sentAt: capturedAt, status: 'pending',
      count: events.length, parseError: parseError || null, raw: parseError ? text : null,
    }
    events.forEach((event, index) => state.events.push({ batchId, index, capturedAt, event }))
  })
}, filter, ['requestBody'])

chrome.webRequest.onCompleted.addListener((details) => {
  if (!ingestPath(details.url) || details.tabId < 0) return
  updateTab(details.tabId, (state) => {
    const batch = state.batches[details.requestId]
    if (batch) { batch.status = details.statusCode; batch.doneAt = Date.now() }
  })
}, filter)

chrome.webRequest.onErrorOccurred.addListener((details) => {
  if (!ingestPath(details.url) || details.tabId < 0) return
  updateTab(details.tabId, (state) => {
    const batch = state.batches[details.requestId]
    if (batch) { batch.status = 'error'; batch.error = details.error; batch.doneAt = Date.now() }
  })
}, filter)

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.session.remove([`tab:${tabId}`, `auto:${tabId}`])
})

// Auto-flush lives in the page, so a full navigation wipes it — re-arm on every load.
chrome.tabs.onUpdated.addListener(async (tabId, info) => {
  if (info.status !== 'complete') return
  const key = `auto:${tabId}`
  if ((await chrome.storage.session.get(key))[key]) armAutoFlush(tabId, true)
})

function armAutoFlush(tabId, enabled) {
  return chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    args: [enabled],
    func: (on) => {
      clearInterval(window.__svQaFlushTimer)
      window.__svQaFlushTimer = on
        ? setInterval(() => window.StarvaultTracking && window.StarvaultTracking.flush && window.StarvaultTracking.flush(), 1000)
        : null
    },
  })
}

chrome.runtime.onMessage.addListener((message, _sender, reply) => {
  if (message.type === 'flush') {
    chrome.scripting.executeScript({
      target: { tabId: message.tabId },
      world: 'MAIN',
      func: () => {
        const sdk = window.StarvaultTracking
        if (!sdk || typeof sdk.flush !== 'function') return false
        sdk.flush()
        return true
      },
    }).then(([result]) => reply({ ok: result && result.result === true }))
      .catch((error) => reply({ ok: false, error: error.message }))
    return true
  }

  if (message.type === 'autoflush') {
    chrome.storage.session.set({ [`auto:${message.tabId}`]: message.enabled })
      .then(() => armAutoFlush(message.tabId, message.enabled))
      .then(() => reply({ ok: true }))
      .catch((error) => reply({ ok: false, error: error.message }))
    return true
  }

  if (message.type === 'clear') {
    updateTab(message.tabId, (state) => { state.batches = {}; state.events = [] }).then(() => reply({ ok: true }))
    return true
  }
})
