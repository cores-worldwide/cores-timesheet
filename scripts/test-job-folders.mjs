// node scripts/test-job-folders.mjs — folder names from uploaded paths (Job Files folders).
import { foldersFromPaths, shownFolder, cleanFolder } from '../src/utils/jobFolders.js'
const f = (path) => ({ file: { name: path.split('/').pop() }, path })
const got = (paths) => foldersFromPaths(paths.map(f)).map((x) => `${x.file.name}:${x.folder}`)
let bad = 0
const eq = (name, a, b) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) bad++; console.log(ok ? 'ok  ' : 'FAIL', name, ok ? '' : `\n  got ${JSON.stringify(a)}\n  want ${JSON.stringify(b)}`) }
eq('whole job folder → its sub-folders; loose file stays loose; .DS_Store skipped',
  got(['4685/valve-train/a.xlsx', '4685/con-rods/b.xlsx', '4685/con-rods/deep/c.pdf', '4685/readme.pdf', '4685/.DS_Store']),
  ['a.xlsx:valve-train', 'b.xlsx:con-rods', 'c.pdf:con-rods', 'readme.pdf:null'])
eq('one folder → named after it', got(['valve-train/a.xlsx', 'valve-train/b.pdf']), ['a.xlsx:valve-train', 'b.pdf:valve-train'])
eq('two folders dropped together → one each', got(['valve-train/a.xlsx', 'con-rods/b.xlsx']), ['a.xlsx:valve-train', 'b.xlsx:con-rods'])
eq('plain files → no folder', got(['a.pdf', 'b.pdf']), ['a.pdf:null', 'b.pdf:null'])
eq('Thumbs.db skipped', got(['x/Thumbs.db', 'x/a.pdf']), ['a.pdf:x'])
eq('cleanFolder trims / blanks', [cleanFolder('  a   b '), cleanFolder('   '), cleanFolder(null)], ['a b', null, null])
eq('old report shows in its template folder', shownFolder({ kind: 'report', template_id: 'alco-valve-train-inspection', folder: null }), 'valve-train')
eq('own folder wins', shownFolder({ kind: 'report', template_id: 'alco-valve-train-inspection', folder: 'misc' }), 'misc')
eq('uploaded file with no folder', shownFolder({ kind: 'file', folder: null }), null)
process.exit(bad ? 1 : 0)
