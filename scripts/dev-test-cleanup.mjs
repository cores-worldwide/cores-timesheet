import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

// Only synthetic records whose IDs the test itself created may be passed here.
// The API deliberately cannot delete audit history; use the existing dev-only
// database credential, never a production connection or an RLS/schema change.
export function clearDevTestAudit(recordIds) {
  const ids = [...new Set(recordIds)]
  if (!ids.length) return
  if (ids.some(id => !/^[0-9a-f-]{36}$/i.test(id))) throw Error('Expected synthetic record UUIDs')
  const literals = ids.map(id => `'${id}'`).join(',')
  const result = spawnSync('/opt/homebrew/opt/libpq/bin/psql', [
    'host=aws-0-us-east-2.pooler.supabase.com port=5432 dbname=postgres user=postgres.giwexoouqxioxkjhoxoe sslmode=require',
    '-v', 'ON_ERROR_STOP=1', '-q', '-c',
    `DELETE FROM "Cores".audit_log WHERE table_name IN ('employees','sms_submissions') AND record_id IN (${literals});`,
  ], {
    env: { ...process.env, PGPASSWORD: readFileSync(`${process.env.HOME}/.config/cores-dev/db-password`, 'utf8').trim(), PGCONNECT_TIMEOUT: '15' },
    encoding: 'utf8', timeout: 20000,
  })
  if (result.status !== 0) throw Error(`Dev test audit cleanup failed: ${result.stderr || result.error?.message}`)
}
