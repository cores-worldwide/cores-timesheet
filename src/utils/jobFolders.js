// Folders (Jim, 2026-11-02): one level per job, e.g. "valve-train". null = no folder.
export const cleanFolder = (name) => {
  const f = (name || '').replace(/\s+/g, ' ').trim().slice(0, 100)
  return f || null
}

// The folder shown for a file is only ever the one a person put it in.
// Nothing is placed in a folder automatically (Jim, 2026-11-02: "you can't
// just move files around") — no folder means it shows with the loose files.
export const shownFolder = (f) => f.folder || null

// Files picked or dropped, with their path inside the chosen folder
// ("4685/valve-train/x.xlsx"), to { file, folder }. The folder is the first
// level under the one chosen, so choosing 4685/ gives its sub-folders
// (valve-train, con-rods, ...) and anything deeper goes into that sub-folder.
// Choosing valve-train/ on its own gives one folder named valve-train.
// Loose files beside sub-folders stay out of a folder. Hidden system files
// (.DS_Store, Thumbs.db) are skipped.
export function foldersFromPaths(items) {
  const keep = items.filter(({ file }) => !file.name.startsWith('.') && file.name !== 'Thumbs.db' && file.name !== 'desktop.ini')
  const parts = keep.map(({ path }) => (path || '').split('/').filter(Boolean))
  const hasSubfolders = parts.some((p) => p.length >= 3)
  return keep.map(({ file }, i) => {
    const p = parts[i]
    let folder = null
    if (p.length >= 3) folder = p[1]
    else if (p.length === 2 && !hasSubfolders) folder = p[0]
    return { file, folder: cleanFolder(folder) }
  })
}
