// Pending work is worth saving before the tech knows its job or hours.
// Only an entirely untouched row is omitted. Unknown is a real office-review job.
export function draftEntries(lines) {
  return lines.filter(line => String(line.job_number || '').trim()
    || String(line.description || '').trim()
    || (line.hours != null && String(line.hours).trim() !== ''))
    .map(line => {
      const suppliedHours = line.hours != null && String(line.hours).trim() !== ''
      const hours = suppliedHours ? Number(line.hours) : null
      return {
        job_number: String(line.job_number || '').trim() || 'Unknown',
        hours: hours != null && Number.isFinite(hours) && hours >= 0 ? hours : null,
        description: String(line.description || '').trim(),
      }
    })
}
