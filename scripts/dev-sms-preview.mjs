// Local-only SMS simulator for manual dev review. It never sends a text.
import { createServer } from 'node:http'
import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { loadEnv } from 'vite'
import { createClient } from '@supabase/supabase-js'
import { clearDevTestAudit } from './dev-test-cleanup.mjs'

const env = loadEnv('development', new URL('..', import.meta.url).pathname, 'VITE_')
const devUrl = env.VITE_SUPABASE_URL
if (new URL(devUrl).hostname !== 'giwexoouqxioxkjhoxoe.supabase.co') throw Error('Dev database required')
const db = createClient(devUrl, env.VITE_SUPABASE_ANON_KEY).schema('Cores')
const phone = `999${String(Date.now()).slice(-7)}`
const csrf = randomBytes(24).toString('hex')
const headers = { 'Content-Type': 'application/json', apikey: env.VITE_SUPABASE_ANON_KEY }
try { headers['x-test-secret'] = readFileSync(`${process.env.HOME}/.config/cores-dev/test-secret`, 'utf8').trim() } catch {}
const port = Number(process.env.DEV_SMS_PORT || 3004)
const origin = `http://127.0.0.1:${port}`

async function rows() {
  const { data, error } = await db.from('sms_submissions').select('id,work_date,entries,status').eq('from_phone', phone).order('work_date')
  if (error) throw Error(error.message)
  return data
}
async function reset() {
  const records = await rows()
  const { error } = await db.from('sms_submissions').delete().eq('from_phone', phone)
  if (error) throw Error(error.message)
  clearDevTestAudit(records.map(row => row.id))
}
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DEV SMS preview</title>
<style>body{font:16px system-ui;margin:0;background:#f4f5f7;color:#18202a}main{max-width:760px;margin:32px auto;padding:20px}header{background:#2d6a38;color:white;padding:12px;text-align:center;font-weight:bold}textarea{box-sizing:border-box;width:100%;min-height:120px;padding:12px;font:inherit;border:1px solid #bcc4ca;border-radius:8px}button{padding:12px 20px;font:inherit;border-radius:6px;border:1px solid #bbb;margin:10px 8px 10px 0;cursor:pointer}button[type=submit]{background:#065fbd;color:white}pre{white-space:pre-wrap;background:white;padding:16px;border-radius:8px}li{margin:8px 0}.entry{background:white;border-radius:8px;padding:14px;margin:10px 0}.muted{color:#59636f}</style>
<header>DEV · TEST DATABASE · no real texts are sent</header><main><h1>Try a timesheet text</h1>
<p>This simulator saves to the dev bot, using a separate test sender. It does not use the crew text number.</p>
<form><label for="message">Message</label><textarea id="message" required placeholder="Removed bearings and cleaned valve gear"></textarea><button type="submit">Try message</button><button type="button" id="reset">Clear my test messages</button></form>
<p class="muted">Try a note alone; then a job number with a note and no hours. Start a fresh test with Clear. Missing hours should stay blank.</p>
<h2>Bot reply</h2><pre id="reply">No message yet.</pre><h2>What was saved on dev</h2><div id="entries"></div>
<p><a href="http://127.0.0.1:3003/cores-timesheet/#/my" target="_blank">Open the dev phone page</a></p></main>
<script>const token=${JSON.stringify(csrf)}; const reply=document.querySelector('#reply'), entries=document.querySelector('#entries');
async function request(path,body){const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json','x-dev-preview-token':token},body:JSON.stringify(body||{})});const result=await response.json();if(!response.ok)throw Error(result.error||'Request failed');return result;}
function show(rows){entries.replaceChildren();for(const row of rows)for(const entry of row.entries||[]){const card=document.createElement('div');card.className='entry';const title=document.createElement('strong');title.textContent='Job '+entry.job_number+' · '+(entry.hours==null?'Hours: blank':entry.hours+' hours');const note=document.createElement('p');note.textContent=entry.description||'(no description supplied)';card.append(title,note);entries.append(card);}}
document.querySelector('form').onsubmit=async event=>{event.preventDefault();const button=event.submitter;button.disabled=true;try{const result=await request('/sms',{message:document.querySelector('#message').value});reply.textContent=result.reply;show(result.rows);}catch(error){reply.textContent=error.message;}finally{button.disabled=false;}};
document.querySelector('#reset').onclick=async()=>{try{await request('/reset');reply.textContent='Test messages cleared.';show([]);}catch(error){reply.textContent=error.message;}};
</script></html>`

const server = createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  if (req.headers.host !== `127.0.0.1:${port}`) { res.writeHead(403).end(); return }
  if (req.method === 'GET' && req.url === '/') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(html); return }
  res.setHeader('Content-Type', 'application/json')
  if (req.method !== 'POST' || req.headers['x-dev-preview-token'] !== csrf || req.headers.origin !== origin) {
    res.writeHead(403).end(JSON.stringify({ error: 'Local preview only' })); return
  }
  try {
    let body = ''
    for await (const chunk of req) { body += chunk; if (body.length > 8000) throw Error('Message is too long') }
    if (req.url === '/reset') { await reset(); res.end('{}'); return }
    if (req.url !== '/sms') { res.writeHead(404).end('{}'); return }
    const message = String(JSON.parse(body).message || '').trim()
    if (!message) throw Error('Enter a message')
    const response = await fetch(`${devUrl}/functions/v1/sms-timesheet`, {
      method: 'POST', headers, body: JSON.stringify({ from_phone: phone, body: message }),
    })
    const result = await response.json()
    if (!response.ok || result.error) throw Error('The dev bot could not save that message')
    res.end(JSON.stringify({ reply: result.reply, rows: await rows() }))
  } catch (error) { res.writeHead(400).end(JSON.stringify({ error: error.message })) }
})
server.listen(port, '127.0.0.1', () => console.log(`Dev SMS preview: ${origin}`))
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => {
  try { await reset() } finally { server.close(() => process.exit(0)) }
})
