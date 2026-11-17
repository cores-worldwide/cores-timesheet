// Texted "day off", optionally with a per diem claim (Jim, 2026-11-17: techs
// on the road claim per diem on days off the same way they do on work days).
// Plain JS with no imports so both the edge function and node:test load it.
//
// Returns null when the text isn't this rule (it then goes through the normal
// handling exactly as before), otherwise { perDiemLocation } — 'none', the
// place the tech named, or 'PD claimed'. A tech's claim always means x1; the
// office adjusts it on the SMS Review card.

const PD = String.raw`(?:pd|p\.d\.?|per\s*diem)(?![a-z])`
// A date anywhere means a day other than today — not handled by this rule.
const DATE_WORDS = /\b(?:today|tonight|tomorrow|yesterday|mon|tues?|wed|thu|thurs?|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i

export function parseDayOffText(text) {
  const m = String(text || '').trim().match(/^day\s+off(?![a-z])([\s\S]*)$/i)
  if (!m) return null
  const rest = m[1].replace(/^[\s,.:;!\-–—]+/, '').replace(/[\s.!]+$/, '')
  if (!rest) return { perDiemLocation: 'none' }
  if (DATE_WORDS.test(rest)) return null
  if (new RegExp(`^no\\s+${PD}\\s*$`, 'i').test(rest)) return { perDiemLocation: 'none' }
  const claim = rest.match(new RegExp(`^${PD}([\\s\\S]*)$`, 'i'))
  if (claim) {
    const place = claim[1].replace(/^[\s,.:;\-–—]+/, '').replace(/^(?:in|at)\s+/i, '').trim()
    return { perDiemLocation: place || 'PD claimed' }
  }
  if (/^(?:hotel|staying)(?![a-z])/i.test(rest)) return { perDiemLocation: rest }
  return null
}
