// The welcome screen: pick the game folder via the native dialog or by
// pasting a path (the test-reachable way — docs/testing.md).

import { byId } from './dom'

export function initWelcome(onLocated: (dir: string) => void): void {
  const pathInput = byId<HTMLInputElement>('path-input')
  const pathError = byId<HTMLParagraphElement>('path-error')

  byId<HTMLButtonElement>('select-dir').addEventListener('click', async () => {
    const dir = await window.api.selectGameDir()
    if (dir) onLocated(dir)
  })

  const usePath = async (): Promise<void> => {
    const result = await window.api.setGameDir(pathInput.value)
    if (result.ok) {
      pathError.textContent = ''
      onLocated(result.dir)
    } else {
      pathError.textContent = result.error
    }
  }
  byId<HTMLButtonElement>('use-path').addEventListener('click', () => void usePath())
  pathInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') void usePath()
  })
}
