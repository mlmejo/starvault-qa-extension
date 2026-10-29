const RULES = self.SV_RULES || []
const { inspectEvent, matches } = self.SvInspect

const $ = (id) => document.getElementById(id)
const openRows = new Set()
let tabId = null
let state = { batches: {}, events: [] }
let live = null // ids read from the page itself, see refreshIdentity()
let renderQueued = false

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag)
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'class') node.className = value
    else if (key === 'text') node.textContent = value
    else node.setAttribute(key, value)
  }
  for (const child of children.flat()) if (child != null) node.append(child)
  return node
}

function flash(message) {
  const box = $('flash')
  box.textContent = message
  box.hidden = false
  clearTimeout(flash.timer)
  flash.timer = setTimeout(() => { box.hidden = true }, 3000)
}

function clock(ms) {
  return new Date(ms).toLocaleTimeString([], { hour12: false })
}

function short(id) {
  return id ? String(id).slice(0, 8) : '—'
}

function statusLabel(batch) {
  if (!batch) return { text: '?', cls: 'pending' }
  if (batch.status === 'pending') return { text: 'sending', cls: 'pending' }
  if (batch.status === 'error') return { text: batch.error || 'network error', cls: 'bad' }
  if (batch.status >= 400) return { text: `${batch.status}${batch.status === 422 ? ' rejected' : ''}`, cls: 'bad' }
  return { text: String(batch.status), cls: '' }
}

// ─── data ────────────────────────────────────────────────────────────────

// sidepanel.html?tab=<id> pins the inspector to one tab, so it can run as a
// normal tab beside the site (e.g. for screen recording).
const pinnedTabId = Number(new URLSearchParams(location.search).get('tab')) || null

async function load() {
  if (pinnedTabId) {
    tabId = pinnedTabId
  } else {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    tabId = tab ? tab.id : null
  }
  if (tabId == null) return
  const key = `tab:${tabId}`
  const stored = await chrome.storage.session.get([key, `auto:${tabId}`])
  state = stored[key] || { batches: {}, events: [] }
  $('autoflush').checked = !!stored[`auto:${tabId}`]
  openRows.clear()
  live = null
  queueRender()
  refreshIdentity()
}

// Ids straight from the page, so they show before any event is captured.
async function refreshIdentity() {
  const id = tabId
  if (id == null) return
  const res = await chrome.runtime.sendMessage({ type: 'identity', tabId: id })
  if (id !== tabId) return
  live = res && res.ok ? res.identity : null
  queueRender()
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'session' || tabId == null) return
  const change = changes[`tab:${tabId}`]
  if (!change) return
  state = change.newValue || { batches: {}, events: [] }
  queueRender()
  refreshIdentity()
})

chrome.tabs.onUpdated.addListener((id, info) => {
  if (id === tabId && info.status === 'complete') refreshIdentity()
})

if (!pinnedTabId) {
  chrome.tabs.onActivated.addListener(load)
  chrome.windows.onFocusChanged.addListener(load)
}

function queueRender() {
  if (renderQueued) return
  renderQueued = true
  requestAnimationFrame(() => { renderQueued = false; render() })
}

// ─── render ──────────────────────────────────────────────────────────────

function haystack(ev) {
  return [ev.event_name, ev.element_name, ev.path, JSON.stringify(ev.properties || {})].join(' ').toLowerCase()
}

function render() {
  const query = $('search').value.trim().toLowerCase()
  const point = $('point').value
  const show = $('show').value

  const rows = state.events.map((entry) => ({ entry, result: inspectEvent(entry.event, RULES) }))

  renderIdentity()
  renderSummary(rows)
  renderCoverage(point)

  const visible = rows.filter(({ entry, result }) => {
    if (point && !result.hits.some((h) => h.code === point)) return false
    if (show === 'points' && !result.hits.length) return false
    if (show === 'issues' && result.level === 'ok') return false
    if (query && !haystack(entry.event).includes(query)) return false
    return true
  }).reverse()

  const list = $('list')
  list.replaceChildren()
  if (!visible.length) {
    list.append(el('div', {
      class: 'empty',
      text: state.events.length
        ? 'No events match the filters.'
        : 'No StarVault events captured on this tab yet. Interact with the site, then Flush now to skip the SDK\'s 30-second batch wait.',
    }))
    return
  }
  for (const row of visible) list.append(renderRow(row))
}

const SESSION_TTL_MS = 600000 // tracking.js rotates session_id after this much idle time

// Live page values win over the last captured event, which can be from an earlier page.
function identity() {
  const ev = state.events[state.events.length - 1]?.event || {}
  return {
    site: ev.site || ev.host || live?.host,
    user_uuid: live?.hooked ? live.user_uuid : ev.user_uuid,
    identified: !live?.hooked || !!live.user_uuid,
    session_id: live?.session_id || ev.session_id,
    session_expired: !!live?.session_touched_at && Date.now() - live.session_touched_at >= SESSION_TTL_MS,
    sdk_version: ev.sdk_version,
  }
}

function renderIdentity() {
  const id = identity()
  const box = $('identity')
  $('copy-user').disabled = !id.user_uuid
  $('copy-session').disabled = !id.session_id
  if (!id.user_uuid && !id.session_id && !state.events.length) { box.textContent = 'Waiting for StarVault events on this tab…'; return }
  box.replaceChildren(
    'site ', el('b', { text: id.site || '—' }),
    ' · user ', el('b', { text: id.identified ? short(id.user_uuid) : 'not identified', title: id.user_uuid || '' }),
    ' · session ', el('b', { text: short(id.session_id), title: id.session_id || '' }),
    id.session_expired ? el('span', { class: 'warn', text: ' (idle >10 min, rotates on next event)' }) : null,
    ' · ', el('b', { text: id.sdk_version || 'unknown sdk' }),
  )
}

function renderSummary(rows) {
  const batches = Object.values(state.batches)
  const failed = batches.filter((b) => b.status === 'error' || b.status >= 400).length
  const errors = rows.filter((r) => r.result.level === 'error').length
  const warns = rows.filter((r) => r.result.level === 'warn').length
  const points = new Set(rows.flatMap((r) => r.result.hits.map((h) => h.code)))
  $('summary').replaceChildren(...[
    `${rows.length} events · ${batches.length} batches · ${points.size} D-points hit`,
    failed ? el('span', { class: 'error', text: ` · ${failed} batch${failed > 1 ? 'es' : ''} failed` }) : null,
    errors ? el('span', { class: 'error', text: ` · ${errors} with errors` }) : null,
    warns ? el('span', { class: 'warn', text: ` · ${warns} with warnings` }) : null,
  ].filter(Boolean))
}

// What a D-point needs, and how much of it this tab has fired — a QA checklist.
function renderCoverage(code) {
  const box = $('coverage')
  const point = RULES.find((p) => p.code === code)
  if (!point) { box.hidden = true; return }
  box.hidden = false
  const items = (point.events || []).map((rule) => {
    const count = state.events.filter((entry) => matches(entry.event, rule.match)).length
    const where = rule.source === 'server'
      ? 'server-side — never visible in the browser'
      : rule.source === 'unknown' ? 'source unknown' : ''
    return el('li', {},
      el('span', { class: `count${count ? '' : ' zero'}`, text: String(count) }),
      el('span', { text: rule.label || rule.match.event }),
      el('span', { class: 'src', text: [rule.match.event, where].filter(Boolean).join(' · '), title: rule.note || '' }),
    )
  })
  box.replaceChildren(el('h2', { text: `${point.code} — ${point.title}` }), el('ul', {}, items))
}

function renderRow({ entry, result }) {
  const ev = entry.event
  const key = `${entry.batchId}:${entry.index}`
  const status = statusLabel(state.batches[entry.batchId])

  const details = el('details', { class: 'event' })
  details.open = openRows.has(key)
  details.addEventListener('toggle', () => {
    if (details.open) { openRows.add(key); fillBody(details, entry, result) } else openRows.delete(key)
  })

  const issueCount = result.issues.filter((i) => i.level !== 'info').length
  details.append(el('summary', {},
    el('span', { class: `dot ${result.level}` }),
    el('span', { class: 'name' }, ev.event_name || '(no event_name)', ev.element_name ? el('span', { class: 'el', text: ` · ${ev.element_name}` }) : null),
    el('span', { class: 'time', text: clock(entry.capturedAt) }),
    el('span', { class: 'meta' },
      [...new Set(result.hits.map((h) => h.code))].map((code) => el('span', { class: 'chip', text: code })),
      el('span', { text: ev.path || '' }),
      el('span', { class: `status ${status.cls}`, text: `· ${status.text}` }),
      issueCount ? el('span', { class: result.level === 'error' ? 'status bad' : 'status pending', text: `· ${issueCount} issue${issueCount > 1 ? 's' : ''}` }) : null,
    ),
  ))
  if (details.open) fillBody(details, entry, result)
  return details
}

function fillBody(details, entry, result) {
  details.querySelector('.body')?.remove()
  const ev = entry.event
  const batch = state.batches[entry.batchId]
  const body = el('div', { class: 'body' })

  if (batch && (batch.status === 422 || batch.parseError)) {
    body.append(el('div', { class: 'issues' }, el('span', { class: 'error', text: batch.parseError || 'Server rejected this whole batch (422) — one invalid event fails every event sent with it.' })))
  }

  if (result.issues.length) {
    body.append(el('h3', { text: 'Issues' }), el('ul', { class: 'issues' },
      result.issues.map((i) => el('li', { class: i.level, text: i.message }))))
  }

  body.append(el('h3', { text: 'Design Data Points' }), result.hits.length
    ? el('ul', { class: 'hits' }, result.hits.map((h) => el('li', { text: `${h.code} ${h.label} — ${h.title}${h.note ? ` (${h.note})` : ''}` })))
    : el('div', { class: 'issues' }, el('span', { class: 'info', text: 'Not read by any D-point query.' })))

  const props = ev.properties && typeof ev.properties === 'object' ? Object.entries(ev.properties) : []
  if (props.length) {
    body.append(el('h3', { text: 'Properties' }), el('table', {}, props.map(([k, v]) => el('tr', {},
      el('td', { text: k }),
      el('td', {}, JSON.stringify(v), el('span', { class: 'type', text: `  ${v === null ? 'null' : typeof v}` })),
    ))))
  }

  const copy = el('button', { text: 'Copy JSON' })
  copy.addEventListener('click', () => navigator.clipboard.writeText(JSON.stringify(ev, null, 2)).then(() => flash('Event JSON copied')))
  body.append(el('h3', { text: 'Envelope' }), el('pre', { text: JSON.stringify(ev, null, 2) }), el('div', {}, copy))
  details.append(body)
}

// ─── controls ────────────────────────────────────────────────────────────

for (const point of RULES) $('point').append(el('option', { value: point.code, text: `${point.code} — ${point.title}` }))
for (const id of ['search', 'point', 'show']) $(id).addEventListener('input', queueRender)

$('flush').addEventListener('click', async () => {
  const res = await chrome.runtime.sendMessage({ type: 'flush', tabId })
  flash(res.ok ? 'Flushed — buffered events sent' : `StarvaultTracking not found on this page${res.error ? ` (${res.error})` : ''}`)
})

$('autoflush').addEventListener('change', async (e) => {
  const res = await chrome.runtime.sendMessage({ type: 'autoflush', tabId, enabled: e.target.checked })
  if (!res.ok) { e.target.checked = false; flash(`Could not arm auto-flush: ${res.error}`); return }
  flash(e.target.checked ? 'Auto-flush on: events ship every second on this tab' : 'Auto-flush off')
})

$('clear').addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'clear', tabId })
  openRows.clear()
})

$('copy-user').addEventListener('click', () => {
  const { user_uuid } = identity()
  if (user_uuid) navigator.clipboard.writeText(user_uuid).then(() => flash('User ID copied'))
})

$('copy-session').addEventListener('click', () => {
  const { session_id } = identity()
  if (session_id) navigator.clipboard.writeText(session_id).then(() => flash('Session ID copied'))
})

$('export').addEventListener('click', () => {
  const data = state.events.map((entry) => {
    const result = inspectEvent(entry.event, RULES)
    return {
      captured_at: new Date(entry.capturedAt).toISOString(),
      batch_status: state.batches[entry.batchId]?.status ?? null,
      design_points: result.hits.map((h) => h.code),
      issues: result.issues,
      event: entry.event,
    }
  })
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
  const link = el('a', { href: url, download: `starvault-events-${new Date().toISOString().replace(/[:.]/g, '-')}.json` })
  link.click()
  URL.revokeObjectURL(url)
})

load()
