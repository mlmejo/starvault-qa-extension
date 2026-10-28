// Checks one expanded event against the ingest validation (IngestEventData::rules)
// and the Design Data Point rules in rules.js. Pure functions; no DOM.

;(() => {
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NUMERIC = /^-?\d+(\.\d+)?$/

const regexCache = new Map()
function asMatcher(spec) {
  if (typeof spec !== 'string' || !/^\/.+\/[a-z]*$/.test(spec)) return (value) => value === spec
  if (!regexCache.has(spec)) {
    const last = spec.lastIndexOf('/')
    regexCache.set(spec, new RegExp(spec.slice(1, last), spec.slice(last + 1)))
  }
  const re = regexCache.get(spec)
  return (value) => value != null && re.test(String(value))
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object'
}

// Mirrors the server's validation — one failing event makes the whole batch 422.
function envelopeIssues(ev) {
  const issues = []
  const err = (message) => issues.push({ level: 'error', message })
  const tooLong = (key, max) => typeof ev[key] === 'string' && ev[key].length > max && err(`${key} longer than ${max} chars`)
  const notString = (key) => ev[key] != null && typeof ev[key] !== 'string' && err(`${key} must be a string`)

  if (typeof ev.event_name !== 'string' || ev.event_name === '') err('event_name missing')
  if (ev.event_id != null && !UUID.test(String(ev.event_id))) err('event_id is not a UUID')
  if (!ev.site && !ev.host) err('site and host both missing')
  if (ev.properties != null && !isPlainObject(ev.properties)) err('properties must be an object')
  if (ev.schema_version != null && !(Number.isInteger(ev.schema_version) && ev.schema_version >= 1)) err('schema_version must be an integer ≥ 1')
  if (ev.occurred_at != null && Number.isNaN(Date.parse(ev.occurred_at))) err('occurred_at is not a date')
  for (const key of ['event_name', 'element_name', 'site', 'host', 'user_uuid', 'anonymous_id', 'page_url', 'path', 'referrer', 'session_id', 'source_type', 'sdk_version']) notString(key)
  tooLong('event_name', 100)
  for (const key of ['element_name', 'site', 'host', 'user_uuid', 'anonymous_id', 'session_id']) tooLong(key, 255)
  for (const key of ['page_url', 'path', 'referrer']) tooLong(key, 2048)
  tooLong('source_type', 50)
  tooLong('sdk_version', 50)

  if (!ev.session_id) issues.push({ level: 'warn', message: 'session_id missing — session-scoped D-points will drop this event' })
  if (!ev.user_uuid) issues.push({ level: 'info', message: 'user_uuid empty (logged out, or init() ran before login)' })
  return issues
}

const TYPE_CHECKS = {
  int: (v) => typeof v === 'number' && Number.isFinite(v),
  numeric: (v) => (typeof v === 'number' && Number.isFinite(v)) || (typeof v === 'string' && NUMERIC.test(v)),
  bool: (v) => typeof v === 'boolean',
  boolstr: (v) => v === 'true' || v === 'false',
  string: (v) => typeof v === 'string' && v !== '',
  any: () => true,
}

const TYPE_HINTS = {
  int: 'a JSON number (a string reads as 0)',
  numeric: 'a number or numeric string',
  bool: 'a JSON true/false (the string "true" reads as false)',
  boolstr: 'the string "true" or "false"',
  string: 'a non-empty string',
  any: 'present',
}

function describe(value) {
  if (value === undefined) return 'missing'
  return `${JSON.stringify(value)} (${value === null ? 'null' : typeof value})`
}

// ClickHouse versions disagree on reading "7" via JSONExtractInt or 7 via
// JSONExtractString, so those cross-type cases warn rather than fail.
const LOOSE_FALLBACK = {
  int: (v) => typeof v === 'string' && NUMERIC.test(v),
  string: (v) => typeof v === 'number' && Number.isFinite(v),
}

function propIssues(props, spec) {
  const issues = []
  const properties = isPlainObject(props) ? props : {}
  for (const [keys, rawType] of Object.entries(spec || {})) {
    const optional = rawType.endsWith('?')
    const type = optional ? rawType.slice(0, -1) : rawType
    const check = TYPE_CHECKS[type] || TYPE_CHECKS.any
    const alternatives = keys.split('|')
    if (alternatives.some((key) => key in properties && check(properties[key]))) continue
    const present = alternatives.find((key) => key in properties)
    const shown = present ? `${present} is ${describe(properties[present])}` : `${keys} missing`
    const loose = present && LOOSE_FALLBACK[type] && LOOSE_FALLBACK[type](properties[present])
    issues.push({ level: optional || loose ? 'warn' : 'error', message: `${shown} — needs ${TYPE_HINTS[type] || type}` })
  }
  return issues
}

function matches(ev, match) {
  if (!match || (match.event !== '*' && ev.event_name !== match.event)) return false
  if (match.element != null && !asMatcher(match.element)(ev.element_name)) return false
  if (match.path != null && !asMatcher(match.path)(ev.path)) return false
  if (match.url != null && !asMatcher(match.url)(ev.page_url)) return false
  if (match.has) {
    const properties = isPlainObject(ev.properties) ? ev.properties : {}
    if (!match.has.split('|').some((key) => key in properties)) return false
  }
  if (match.prop) {
    const properties = isPlainObject(ev.properties) ? ev.properties : {}
    for (const [key, spec] of Object.entries(match.prop)) {
      if (!asMatcher(spec)(properties[key] == null ? null : String(properties[key]))) return false
    }
  }
  return true
}

// Every D-point rule this event satisfies, each with its own data-quality issues.
function designPointHits(ev, rules) {
  const hits = []
  for (const point of rules) {
    for (const rule of point.events || []) {
      if (!matches(ev, rule.match)) continue
      const issues = propIssues(ev.properties, rule.props)
      if (rule.elementType && !TYPE_CHECKS[rule.elementType](ev.element_name)) {
        issues.push({ level: 'error', message: `element_name is ${describe(ev.element_name)} — needs ${TYPE_HINTS[rule.elementType]}` })
      }
      if (rule.source === 'server' && ev.source_type === 'tracking_js') {
        issues.push({ level: 'warn', message: 'browser copy of a server-side event — the query only counts the dating-backend copy' })
      }
      hits.push({ code: point.code, title: point.title, label: rule.label, note: rule.note || null, issues })
    }
  }
  return hits
}

function inspectEvent(ev, rules) {
  const envelope = envelopeIssues(ev)
  const hits = designPointHits(ev, rules)
  const all = envelope.concat(...hits.map((h) => h.issues.map((i) => ({ ...i, message: `${h.code}: ${i.message}` }))))
  const level = all.some((i) => i.level === 'error') ? 'error' : all.some((i) => i.level === 'warn') ? 'warn' : 'ok'
  return { envelope, hits, issues: all, level }
}

self.SvInspect = { inspectEvent, matches }
})()
