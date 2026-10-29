// Runs in the page (MAIN world) before any site script. tracking.js keeps the
// user uuid private, so wrap init/identify as the SDK installs them and keep the
// last uuid the site passed in, for the side panel to read on open.
//
// An accessor on window (not a placeholder object): the loader's
// _whenStarvaultTrackingReady treats any truthy StarvaultTracking as the SDK.
;(() => {
  const identity = window.__svQaIdentity = { user_uuid: null }
  let sdk

  // Mirrors tracking.js: init keeps the previous uuid when given none, identify always replaces it.
  const record = {
    init: (userUuid) => { if (userUuid) identity.user_uuid = userUuid },
    identify: (userUuid) => { identity.user_uuid = userUuid || null },
  }

  function wrap(obj) {
    if (!obj || typeof obj !== 'object') return obj
    for (const name of Object.keys(record)) {
      const original = obj[name]
      if (typeof original !== 'function' || original.__svQa) continue
      const wrapped = function (userUuid, ...rest) {
        record[name](userUuid)
        return original.call(this, userUuid, ...rest)
      }
      wrapped.__svQa = true
      obj[name] = wrapped
    }
    return obj
  }

  Object.defineProperty(window, 'StarvaultTracking', {
    configurable: true,
    get: () => sdk,
    set: (value) => { sdk = wrap(value) },
  })
})()
