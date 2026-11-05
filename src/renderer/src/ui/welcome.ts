// The welcome screen: pick the game folder via the native dialog or by
// pasting a path (the test-reachable way — docs/testing.md).

import { Refusal } from '../../../lib/failures'
import { reportFailure } from '../failures/report'
import { clearRefusals } from '../failures/strip'
import { byId } from './dom'

export function initWelcome(onLocated: (dir: string) => void): void {
  const pathInput = byId<HTMLInputElement>('path-input')

  byId<HTMLButtonElement>('select-dir').addEventListener('click', async () => {
    const dir = await window.api.selectGameDir()
    if (dir) {
      clearRefusals()
      onLocated(dir)
    }
  })

  const usePath = async (): Promise<void> => {
    const result = await window.api.setGameDir(pathInput.value)
    // The last answer to this field is the only one that still holds.
    clearRefusals()
    // The person's own path, and what is wrong with it: theirs to put right.
    if (result.ok) onLocated(result.dir)
    else reportFailure('using that game folder', new Refusal(result.error))
  }
  byId<HTMLButtonElement>('use-path').addEventListener('click', () => void usePath())
  pathInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') void usePath()
  })
}
