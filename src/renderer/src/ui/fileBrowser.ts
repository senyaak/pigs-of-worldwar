// The installation browser: full file list, filter, stats. Archive rows
// (.mad/.mtd) are clickable and handed to the archive view.

import type { FileEntry } from '../api'
import { byId, formatSize, listRow } from './dom'

function isArchivePath(filePath: string): boolean {
  return /\.(mad|mtd)$/i.test(filePath)
}

export interface FileBrowser {
  load(): Promise<void>
}

export function initFileBrowser(onArchiveClick: (relPath: string) => void): FileBrowser {
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
      if (isArchivePath(file.path)) {
        row.classList.add('archive')
        row.addEventListener('click', () => onArchiveClick(file.path))
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
