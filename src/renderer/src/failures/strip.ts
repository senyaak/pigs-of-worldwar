// Where the person looks: a strip of the reports along the top of the window,
// over every screen, the battle included. A click takes a line away; the log
// and the console keep it.

import type { FailureReport } from '../../../lib/failures'

/** The newest this many stay; older ones are in the session log. */
const SHOWN = 5

const STRIP_STYLE =
  'position:fixed;top:8px;left:8px;right:8px;z-index:1000;display:flex;' +
  'flex-direction:column;gap:4px;pointer-events:none'
const LINE_STYLE =
  'padding:6px 10px;background:#6b1f1a;color:#fff;font:13px Consolas,monospace;' +
  'border:1px solid #d47b6a;cursor:pointer;pointer-events:auto;overflow-wrap:anywhere'

let strip: HTMLDivElement | null = null

function theStrip(): HTMLDivElement {
  if (strip === null) {
    strip = document.createElement('div')
    strip.id = 'failures'
    strip.style.cssText = STRIP_STYLE
    document.body.append(strip)
  }
  return strip
}

export function showOnStrip(report: FailureReport): void {
  const lines = theStrip()
  // A failure that repeats is one thing to read, not five.
  for (const line of lines.children) if (line.textContent === report.text) return
  const line = document.createElement('div')
  line.className = `failure-line ${report.kind}`
  line.setAttribute('role', 'alert')
  line.style.cssText = LINE_STYLE
  line.title = 'Click to dismiss'
  line.textContent = report.text
  line.addEventListener('click', () => line.remove())
  lines.append(line)
  while (lines.children.length > SHOWN) lines.children[0].remove()
}
