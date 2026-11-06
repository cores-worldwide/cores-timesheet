#!/usr/bin/env node
// Local-only report preview. Reads the dev database; no database-write routes.
import http from 'node:http';
import {readFile, stat} from 'node:fs/promises';
import {dirname, extname, resolve, sep} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const STATIC_ROOT = resolve(ROOT, 'docs/mockups/report-builder');
const DEV_HOST = 'giwexoouqxioxkjhoxoe.supabase.co';
const MIME = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png'};

export function parseEnv(text) {
  return Object.fromEntries(text.split(/\r?\n/).map(line => line.match(/^\s*(?:export\s+)?([A-Z_0-9]+)\s*=\s*(.*?)\s*$/)).filter(Boolean).map(match => [match[1], match[2].replace(/^(['"])(.*)\1$/, '$2')]));
}

export function validateDevConfig(env) {
  let url;
  try { url = new URL(env.VITE_SUPABASE_URL); } catch { throw new Error('The dev database URL is missing or invalid.'); }
  if (env.VITE_DEV_DATABASE !== '1' || url.protocol !== 'https:' || url.hostname !== DEV_HOST || url.username || url.password || url.port) {
    throw new Error('Refusing to connect: the report preview only supports cores-timesheets-dev.');
  }
  if (!env.VITE_SUPABASE_ANON_KEY) throw new Error('The dev public client key is missing.');
  return {url: url.origin, key: env.VITE_SUPABASE_ANON_KEY};
}

async function readDevRows(config, table, select, filters = {}) {
  const rows = [];
  const size = 500;
  for (let offset = 0; ;) {
    const url = new URL(`/rest/v1/${table}`, config.url);
    url.searchParams.set('select', select);
    url.searchParams.set('order', table === 'jobs' ? 'job_number.asc,id.asc' : 'id.asc');
    url.searchParams.set('limit', String(size));
    url.searchParams.set('offset', String(offset));
    for (const [name, value] of Object.entries(filters)) url.searchParams.set(name, value);
    const response = await fetch(url, {
      headers: {apikey: config.key, 'Accept-Profile':'Cores', Prefer:'count=exact'},
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error(`The dev ${table} read failed (${response.status}). Check the local dev connection.`);
    const page = await response.json();
    if (!Array.isArray(page)) throw new Error('The dev database returned an unexpected response.');
    rows.push(...page);
    const total = Number(response.headers.get('Content-Range')?.split('/')[1]);
    if (!page.length || (Number.isFinite(total) ? rows.length >= total : page.length < size)) return rows;
    offset += page.length;
  }
}

const JOB_SELECT = 'id,job_number,status,description,vessel_id,customer_id,customers(name,contact_name),vessels(name)';
const JOB_LIST_SELECT = 'id,job_number,status,description,vessel_id,customer_id,customers(name),vessels(name)';
const text = value => typeof value === 'string' ? value : '';
function summarizeJob(row) {
  return {id:row.id, number:text(row.job_number), status:text(row.status), description:text(row.description), vessel:text(row.vessels?.name), customer:text(row.customers?.name)};
}

export async function createReportServer({port = 5210, config, readRows = readDevRows} = {}) {
  config ||= validateDevConfig(parseEnv(await readFile(resolve(ROOT, '.env.development.local'), 'utf8')));
  validateDevConfig({VITE_DEV_DATABASE:'1',VITE_SUPABASE_URL:config.url,VITE_SUPABASE_ANON_KEY:config.key});
  const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  const json = (response, status, value) => {
    response.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
    response.end(JSON.stringify(value));
  };
  return http.createServer(async (request, response) => {
    if (!allowedHosts.has(request.headers.host)) return json(response, 403, {error:'Use the local report preview address.'});
    if (request.headers.origin && ![`http://127.0.0.1:${port}`,`http://localhost:${port}`].includes(request.headers.origin)) return json(response, 403, {error:'Cross-origin requests are not supported.'});
    if (!['GET','HEAD'].includes(request.method)) {
      response.setHeader('Allow','GET, HEAD');
      return json(response, 405, {error:'This preview only reads data.'});
    }
    let path;
    try { path = decodeURIComponent(new URL(request.url, `http://127.0.0.1:${port}`).pathname); }
    catch { return json(response, 400, {error:'Invalid request.'}); }
    try {
      if (path === '/api/jobs') {
        const jobs = (await readRows(config,'jobs',JOB_LIST_SELECT)).map(summarizeJob);
        return json(response,200,{environment:'dev',database:'cores-timesheets-dev',jobs});
      }
      const detail = path.match(/^\/api\/jobs\/([0-9a-f-]{36})$/i);
      if (detail) {
        const rows = await readRows(config,'jobs',JOB_SELECT,{id:`eq.${detail[1]}`});
        const job = rows[0];
        if (!job) return json(response,404,{error:'This project is no longer in the dev jobs table.'});
        const warnings = [];
        let engines = [];
        let services = [];
        if (job.vessel_id) {
          try { engines = await readRows(config,'engines','id,vessel_id,manufacturer,model,serial_number,side,terminated_date',{vessel_id:`eq.${job.vessel_id}`}); }
          catch { warnings.push('Engine records could not be loaded. Engine fields can be entered manually.'); }
        }
        try { services = await readRows(config,'engine_service_log','id,engine_id,hours_at_service,service_date',{work_order_id:`eq.${job.id}`}); }
        catch { warnings.push('Job-specific engine hours could not be loaded.'); }
        return json(response,200,{
          environment:'dev', job:{...summarizeJob(job), contact:text(job.customers?.contact_name)},
          engines:engines.map(engine => ({id:engine.id,manufacturer:text(engine.manufacturer),model:text(engine.model),serial:text(engine.serial_number),side:text(engine.side),retired:!!engine.terminated_date})),
          services:services.map(service => ({engineId:service.engine_id,hours:service.hours_at_service,date:service.service_date})), warnings,
        });
      }
      if (path.startsWith('/api/')) return json(response,404,{error:'Unknown report preview endpoint.'});
      if (path.includes('\0')) return json(response,400,{error:'Invalid path.'});
      const file = resolve(STATIC_ROOT, `.${path === '/' ? '/index.html' : path}`);
      if (!file.startsWith(STATIC_ROOT + sep) || path.split('/').some(part => part.startsWith('.'))) return json(response,403,{error:'File is outside the preview.'});
      const info = await stat(file);
      if (!info.isFile()) return json(response,404,{error:'File not found.'});
      const body = await readFile(file);
      response.writeHead(200,{'Content-Type':MIME[extname(file)] || 'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
      response.end(request.method === 'HEAD' ? undefined : body);
    } catch (error) {
      if (path.startsWith('/api/')) return json(response,502,{error:error.message || 'The dev database could not be read.'});
      return json(response,404,{error:'File not found.'});
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const port = args.length === 2 && args[0] === '--port' ? Number(args[1]) : args.length ? NaN : 5210;
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Usage: node scripts/serve-report-builder.mjs [--port 5210]');
  const server = await createReportServer({port});
  server.on('error',error => {console.error(`Report preview could not start (${error.code || 'server error'}).`);process.exitCode=1;});
  server.listen(port,'127.0.0.1',() => console.log(`Report preview: http://127.0.0.1:${port}/\nDEV DATABASE: cores-timesheets-dev · read-only access`));
}
