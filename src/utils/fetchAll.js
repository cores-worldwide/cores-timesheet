// The Supabase API returns at most 1000 rows per request (the project's
// "Max rows" setting), and silently drops the rest — no error, just a short
// list. Screens that load a whole growing table (timesheet_entries,
// sms_submissions, gear_photos, …) must page through it with this instead of a
// single select, or once the table passes 1000 rows the oldest ones quietly
// vanish from totals and lists.
//
// makeQuery builds a fresh query each call (a Supabase query can't be re-ranged
// once built), e.g.:
//   fetchAll(() => supabase.schema('Cores').from('timesheet_entries').select('*').order('work_date'))
// Any order the caller sets is kept; 'id' is added as a final tiebreaker so
// rows sharing the same sort value can't be skipped or repeated between pages.
// Resolves to { data, error } like a normal query.
export const PAGE_SIZE = 1000

export async function fetchAll(makeQuery) {
  const rows = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await makeQuery().order('id').range(from, from + PAGE_SIZE - 1)
    if (error) return { data: null, error }
    rows.push(...(data || []))
    if (!data || data.length < PAGE_SIZE) return { data: rows, error: null }
  }
}
