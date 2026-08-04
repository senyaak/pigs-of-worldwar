import type { FileEntry } from './api'
import { showModel } from './viewer'

const welcomeEl = document.getElementById('welcome') as HTMLDivElement
const browserEl = document.getElementById('browser') as HTMLDivElement
const fileListEl = document.getElementById('file-list') as HTMLDivElement
const gamePathEl = document.getElementById('game-path') as HTMLSpanElement
const statsEl = document.getElementById('stats') as HTMLSpanElement
const filterEl = document.getElementById('filter') as HTMLInputElement
const selectBtn = document.getElementById('select-dir') as HTMLButtonElement
const pathInput = document.getElementById('path-input') as HTMLInputElement
const usePathBtn = document.getElementById('use-path') as HTMLButtonElement
const pathErrorEl = document.getElementById('path-error') as HTMLParagraphElement
const archiveViewEl = document.getElementById('archive-view') as HTMLDivElement
const archiveTitleEl = document.getElementById('archive-title') as HTMLSpanElement
const archiveListEl = document.getElementById('archive-list') as HTMLDivElement
const archiveBackBtn = document.getElementById('archive-back') as HTMLButtonElement
const viewerEl = document.getElementById('viewer') as HTMLDivElement
const viewerStatsEl = document.getElementById('viewer-stats') as HTMLSpanElement
const viewerCanvasEl = document.getElementById('viewer-canvas') as HTMLDivElement
const viewerBackBtn = document.getElementById('viewer-back') as HTMLButtonElement

function isArchivePath(filePath: string): boolean {
  return /\.(mad|mtd)$/i.test(filePath)
}

let allFiles: FileEntry[] = []

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function renderFiles(): void {
  const query = filterEl.value.trim().toLowerCase()
  const files = query
    ? allFiles.filter((f) => f.path.toLowerCase().includes(query))
    : allFiles
  const totalSize = files.reduce((sum, f) => sum + f.size, 0)
  statsEl.textContent = `${files.length} files, ${formatSize(totalSize)}`

  fileListEl.replaceChildren()
  const fragment = document.createDocumentFragment()
  for (const file of files) {
    const row = document.createElement('div')
    row.className = 'file-row'
    const name = document.createElement('span')
    name.textContent = file.path
    const size = document.createElement('span')
    size.className = 'file-size'
    size.textContent = formatSize(file.size)
    row.append(name, size)
    if (isArchivePath(file.path)) {
      row.classList.add('archive')
      row.addEventListener('click', () => void openArchive(file.path))
    }
    fragment.append(row)
  }
  fileListEl.append(fragment)
}

async function openArchive(relPath: string): Promise<void> {
  const result = await window.api.listArchive(relPath)
  if (!result.ok) {
    archiveTitleEl.textContent = result.error
    return
  }
  const { kind, entries } = result.archive
  archiveTitleEl.textContent = `${relPath} — ${entries.length} entries (${kind})`
  archiveListEl.replaceChildren()

  // A model is a VTX/NO2/FAC triple sharing a base name — those rows open
  // the viewer.
  const stems = new Map<string, Set<string>>()
  for (const entry of entries) {
    const match = entry.name.match(/^(.*)\.(vtx|no2|fac)$/i)
    if (!match) continue
    const base = match[1].toLowerCase()
    if (!stems.has(base)) stems.set(base, new Set())
    stems.get(base)?.add(match[2].toLowerCase())
  }

  const fragment = document.createDocumentFragment()
  for (const entry of entries) {
    const row = document.createElement('div')
    row.className = 'file-row'
    const name = document.createElement('span')
    name.textContent = entry.name
    const size = document.createElement('span')
    size.className = 'file-size'
    size.textContent = formatSize(entry.size)
    row.append(name, size)
    const base = entry.name.replace(/\.(vtx|no2|fac)$/i, '')
    if (base !== entry.name && stems.get(base.toLowerCase())?.size === 3) {
      row.classList.add('archive')
      row.addEventListener('click', () => void openModel(relPath, base))
    }
    fragment.append(row)
  }
  archiveListEl.append(fragment)
  browserEl.classList.add('hidden')
  fileListEl.classList.add('hidden')
  archiveViewEl.classList.remove('hidden')
}

archiveBackBtn.addEventListener('click', () => {
  archiveViewEl.classList.add('hidden')
  browserEl.classList.remove('hidden')
  fileListEl.classList.remove('hidden')
})

async function openModel(relPath: string, base: string): Promise<void> {
  const result = await window.api.loadModel(relPath, base)
  if (!result.ok) {
    viewerStatsEl.textContent = result.error
    return
  }
  const { model } = result
  archiveViewEl.classList.add('hidden')
  viewerEl.classList.remove('hidden')
  viewerStatsEl.textContent =
    `${base} — ${model.triangleCount} triangles ` +
    `(${model.sourceTriangles} + ${model.sourceQuads} quads), ${model.vertexCount} vertices`
  showModel(viewerCanvasEl, model)
}

viewerBackBtn.addEventListener('click', () => {
  viewerEl.classList.add('hidden')
  archiveViewEl.classList.remove('hidden')
})

async function showGame(dir: string): Promise<void> {
  gamePathEl.textContent = dir
  welcomeEl.classList.add('hidden')
  browserEl.classList.remove('hidden')
  fileListEl.classList.remove('hidden')
  allFiles = await window.api.listFiles()
  renderFiles()
}

selectBtn.addEventListener('click', async () => {
  const dir = await window.api.selectGameDir()
  if (dir) await showGame(dir)
})

async function usePath(): Promise<void> {
  const result = await window.api.setGameDir(pathInput.value)
  if (result.ok) {
    pathErrorEl.textContent = ''
    await showGame(result.dir)
  } else {
    pathErrorEl.textContent = result.error
  }
}

usePathBtn.addEventListener('click', usePath)
pathInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') void usePath()
})

filterEl.addEventListener('input', renderFiles)

void (async () => {
  const dir = await window.api.getGameDir()
  if (dir) await showGame(dir)
})()
