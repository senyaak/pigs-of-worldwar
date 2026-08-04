// The installation browser: full file list, filter, stats. Openable rows —
// archives (.mad/.mtd) and map grounds (.pmg) — are clickable; the
// composition root decides what opens where.

import type { FileEntry } from '../api'
import { byId, formatSize, listRow } from './dom'

function isOpenablePath(filePath: string): boolean {
  return /\.(mad|mtd|pmg)$/i.test(filePath)
}

export interface FileBrowser {
  load(): Promise<void>
}

export function initFileBrowser(onFileClick: (relPath: string) => void): FileBrowser {
  const listEl = byId<HTMLDivElement>('file-list')
  const statsEl = byId<HTMLSpanElement>('stats')
  const filterEl = byId<HTMLInputElement>('filter')

  let allFiles: FileEntry[] = []

  const render = (): void => {
    const query = filterEl.value.trim().toLowerCase()
    const files = query ? allFiles.filter((f) => f.path.toLowerCase().includes(query)) : allFiles
    const totalSize = files.reduce((sum, f) => sum + f.size, 0)
    statsEl.textContent = `${files.length} files, ${formatSize(totalSize)}`

    listEl.replaceChildren()
    const fragment = document.createDocumentFragment()
    for (const file of files) {
      const row = listRow(file.path, file.size)
      if (isOpenablePath(file.path)) {
        row.classList.add('archive')
        row.addEventListener('click', () => onFileClick(file.path))
      }
      fragment.append(row)
    }
    listEl.append(fragment)
  }

  filterEl.addEventListener('input', render)

  return {
    async load() {
      allFiles = await window.api.listFiles()
      render()
    }
  }
}
