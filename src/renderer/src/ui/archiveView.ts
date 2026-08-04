// The archive view: entries of one MAD/MTD. Rows of a complete VTX/NO2/FAC
// triple are clickable and handed to the model viewer.

import { byId, listRow } from './dom'

export interface ArchiveView {
  open(relPath: string): Promise<boolean>
}

export function initArchiveView(
  onModelClick: (relPath: string, base: string) => void,
  onBack: () => void
): ArchiveView {
  const titleEl = byId<HTMLSpanElement>('archive-title')
  const listEl = byId<HTMLDivElement>('archive-list')
  byId<HTMLButtonElement>('archive-back').addEventListener('click', onBack)

  return {
    async open(relPath) {
      const result = await window.api.listArchive(relPath)
      if (!result.ok) {
        titleEl.textContent = result.error
        return false
      }
      const { kind, entries } = result.archive
      titleEl.textContent = `${relPath} — ${entries.length} entries (${kind})`

      // A model is a VTX/NO2/FAC triple sharing a base name.
      const stems = new Map<string, Set<string>>()
      for (const entry of entries) {
        const match = entry.name.match(/^(.*)\.(vtx|no2|fac)$/i)
        if (!match) continue
        const base = match[1].toLowerCase()
        if (!stems.has(base)) stems.set(base, new Set())
        stems.get(base)?.add(match[2].toLowerCase())
      }

      listEl.replaceChildren()
      const fragment = document.createDocumentFragment()
      for (const entry of entries) {
        const row = listRow(entry.name, entry.size)
        const base = entry.name.replace(/\.(vtx|no2|fac)$/i, '')
        if (base !== entry.name && stems.get(base.toLowerCase())?.size === 3) {
          row.classList.add('archive')
          row.addEventListener('click', () => onModelClick(relPath, base))
        }
        fragment.append(row)
      }
      listEl.append(fragment)
      return true
    }
  }
}
