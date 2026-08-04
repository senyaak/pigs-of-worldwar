// Small DOM helpers shared by the UI modules.

export function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id)
  if (!element) throw new Error(`missing #${id}`)
  return element as T
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

/** A name+size row for the file and archive lists. */
export function listRow(name: string, size: number): HTMLDivElement {
  const row = document.createElement('div')
  row.className = 'file-row'
  const nameEl = document.createElement('span')
  nameEl.textContent = name
  const sizeEl = document.createElement('span')
  sizeEl.className = 'file-size'
  sizeEl.textContent = formatSize(size)
  row.append(nameEl, sizeEl)
  return row
}
