// One entry per job: supplied hours add (or replace for corrections), notes
// join, and an explicit job survives missing hours. No job-history inference.
// Pure functions let the regression tests exercise the same code as the bot.
const suppliedHours = value => value == null || String(value).trim() === ''
  || !Number.isFinite(Number(value)) || Number(value) < 0 ? null : Number(value)

export function mergeEntries(prevEntries, newEntries, now) {
  const merged = prevEntries.map(e => ({ ...e, job_number: String(e.job_number || '').trim() || 'Unknown' }))

  const foldInto = (target, hours, desc, replaceHours) => {
    if (hours != null) {
      target.hours = replaceHours || !(Number(target.hours) > 0)
        ? hours
        : Math.round((Number(target.hours) + hours) * 100) / 100
    }
    const existingDesc = String(target.description || '').trim()
    if (desc && !existingDesc.toLowerCase().includes(desc.toLowerCase())) {
      target.description = existingDesc ? `${existingDesc}; ${desc}` : desc
    }
    target.last_mentioned_at = now
  }

  for (const raw of newEntries) {
    // A job-number correction renames the existing entry rather than adding a
    // second one under the new number — "actually that was 4760, not 9999".
    const correctsFrom = String(raw.corrects_job_number || '').trim()
    if (correctsFrom) {
      const oldEntry = merged.find((e) => String(e.job_number || '').toLowerCase() === correctsFrom.toLowerCase())
      if (oldEntry) {
        const newJobNum = String(raw.job_number || '').trim()
        const hours = suppliedHours(raw.hours)
        const desc = String(raw.description || '').replace(/\s+/g, ' ').trim()
        // A real entry may already exist under the corrected number (e.g. the tech
        // separately texted 4760 earlier) — fold the mistyped one into it rather
        // than leaving two rows for what's really one job.
        const target = newJobNum
          ? merged.find((e) => e !== oldEntry && String(e.job_number || '').toLowerCase() === newJobNum.toLowerCase())
          : null
        if (target) {
          foldInto(target, Number(oldEntry.hours) > 0 ? Number(oldEntry.hours) : null, String(oldEntry.description || '').trim(), false)
          merged.splice(merged.indexOf(oldEntry), 1)
          foldInto(target, hours, desc, !!raw.replace_hours)
        } else {
          if (newJobNum) oldEntry.job_number = newJobNum
          foldInto(oldEntry, hours, desc, !!raw.replace_hours)
        }
        continue
      }
      // The "old" number wasn't found (e.g. from a prior day) — fall through so
      // the new job number still gets recorded instead of silently dropped.
    }

    const jobNum = String(raw.job_number || '').trim() || 'Unknown'
    const hours = suppliedHours(raw.hours)
    const desc = String(raw.description || '').replace(/\s+/g, ' ').trim()
    if (!raw.job_number && hours == null && !desc) continue
    const existing = jobNum
      ? merged.find((e) => String(e.job_number || '').toLowerCase() === String(jobNum).toLowerCase())
      : null
    if (existing) {
      foldInto(existing, hours, desc, !!raw.replace_hours)
    } else {
      merged.push({ job_number: jobNum || null, hours, description: desc, last_mentioned_at: now })
    }
  }

  // ── Safety net: collapse any duplicate job numbers into one entry ──
  // A job number can land on an entry several ways (direct match, a correction,
  // an occasional LLM parsing quirk) — however it happens, two rows for the same
  // job is never correct. Always combine down to one before doing anything else.
  const byJob = new Map()
  const deduped = []
  for (const e of merged) {
    const key = e.job_number ? String(e.job_number).toLowerCase() : null
    const prior = key ? byJob.get(key) : null
    if (prior) {
      foldInto(prior, Number(e.hours) > 0 ? Number(e.hours) : null, String(e.description || '').trim(), false)
      if (String(e.last_mentioned_at || '') > String(prior.last_mentioned_at || '')) prior.last_mentioned_at = e.last_mentioned_at
    } else {
      deduped.push(e)
      if (key) byJob.set(key, e)
    }
  }

  return deduped
}

// If parsing fails, retain the original text for office review. Only a plainly
// supplied job is attached; never infer a job or duration from a different day.
export function unparsedWorkEntry(message) {
  const job = message.trim().match(/(?:^|\bjob\s*#?\s*)(\d{4}|SHOP)\b/i)?.[1]
  return { job_number: job ? job.toUpperCase() : 'Unknown', hours: null, description: message.trim() }
}

export function parsedWorkEntries(parsed, message) {
  const entries = (Array.isArray(parsed.entries) ? parsed.entries : [])
    .filter(e => e && (String(e.job_number || '').trim() || String(e.description || '').trim() || suppliedHours(e.hours) != null))
  if (entries.length) return entries
  // Pure shift/supply replies are not work entries. An otherwise unparsed
  // message must survive even when the parser missed its work description.
  if (parsed.supplies?.length || parsed.low_stock?.length || !message.trim()) return []
  const controlText = message
    .replace(/\b(?:time\s+in|time\s+out|in|out|started?(?:\s+at)?|finished?(?:\s+at)?|stopped?(?:\s+at)?)\s*:?\s*\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?\b/gi, '')
    .replace(/\b(?:lunch|break)\s*:?\s*\d+(?:\.\d+)?\s*(?:minutes?|mins?|hours?|hrs?)?\b/gi, '')
    .replace(/\b(?:no|none|zero)\s*(?:lunch|break|pd|per\s+diem)\b|\b(?:pd|per\s+diem)\s*:?\s*(?:no|none|yes)\b/gi, '')
    .replace(/\b(?:today|yesterday|and|at)\b|[\s,;.!:-]/gi, '')
  const structured = parsed.time_in || parsed.stated_time_out || parsed.lunch_minutes != null || parsed.per_diem_location != null
  // Ambiguous follow-up answers to lunch/PD questions carry no work prose.
  const shortAnswer = /^(?:no|none|nope|yes|\d+\s*(?:min(?:utes?)?)?|half\s+(?:an?\s+)?hour)[.!]?$/i.test(message.trim())
  return structured && (!controlText || shortAnswer) ? [] : [unparsedWorkEntry(message)]
}
