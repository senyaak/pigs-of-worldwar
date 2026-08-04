import type { FileEntry } from './api'

const welcomeEl = document.getElementById('welcome') as HTMLDivElement
const browserEl = document.getElementById('browser') as HTMLDivElement
const fileListEl = document.getElementById('file-list') as HTMLDivElement
const gamePathEl = document.getElementById('game-path') as HTMLSpanElement
const statsEl = document.getElementById('stats') as HTMLSpanElement
const filterEl = document.getElementById('filter') as HTMLInputElement
const selectBtn = document.getElementById('select-dir') as HTMLButtonElement

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
    fragment.append(row)
  }
  fileListEl.append(fragment)
}

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

filterEl.addEventListener('input', renderFiles)

void (async () => {
  const dir = await window.api.getGameDir()
  if (dir) await showGame(dir)
})()
