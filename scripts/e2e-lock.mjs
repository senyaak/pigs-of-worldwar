// One e2e run at a time on this machine, whichever checkout it comes from.
//
//   npm run e2e:locked -- <spec files or playwright arguments>
//
// Every e2e run launches Electron with a 3D scene against the one installed
// game, and the suite's timeouts are short on purpose (docs/testing.md). Five
// fleet slots running it at once make each other miss frames and time out, and
// a red run that is only the machine being busy costs a whole review round.
// So the e2e project runs under a lock in the game folder, which every slot and
// the main checkout share; the unit suite needs no lock and runs freely.
//
// The lock is a directory (`mkdir` is atomic) holding who took it. A holder
// whose process is gone, or that has held it past STALE_MINUTES, is cleared.
// Waiting happens here, inside Node, so the caller never needs a shell sleep.

import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const STALE_MINUTES = 45
const POLL_MS = 5000

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const lock = join(repo, '..', '.pow-e2e.lock')
const owner = join(lock, 'owner.json')

function alive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function holder() {
  try {
    return JSON.parse(readFileSync(owner, 'utf8'))
  } catch {
    return null
  }
}

function tryTake() {
  try {
    mkdirSync(lock)
  } catch (error) {
    if (error.code !== 'EEXIST') throw error
    const held = holder()
    const age = held ? (Date.now() - held.since) / 60000 : 0
    if (held && (!alive(held.pid) || age > STALE_MINUTES)) {
      console.log(`[e2e-lock] clearing a stale lock from ${held.checkout} (pid ${held.pid})`)
      rmSync(lock, { recursive: true, force: true })
      return tryTake()
    }
    return held ?? { checkout: 'unknown', since: Date.now() }
  }
  writeFileSync(owner, JSON.stringify({ pid: process.pid, checkout: repo, since: Date.now() }))
  return true
}

async function take() {
  let said = 0
  for (;;) {
    const got = tryTake()
    if (got === true) return
    if (Date.now() - said > 60000) {
      const minutes = Math.round((Date.now() - got.since) / 60000)
      console.log(`[e2e-lock] waiting: ${got.checkout} has held the e2e lock for ${minutes} min`)
      said = Date.now()
    }
    await new Promise((done) => setTimeout(done, POLL_MS))
  }
}

function release() {
  const held = holder()
  if (held && held.pid === process.pid) rmSync(lock, { recursive: true, force: true })
}

await take()
console.log(`[e2e-lock] taken by ${repo}`)
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    release()
    process.exit(130)
  })
}

const args = ['playwright', 'test', '--project=e2e', ...process.argv.slice(2)]
const run = spawn('npx', args, { cwd: repo, stdio: 'inherit', shell: true })
run.on('exit', (code) => {
  release()
  process.exit(code ?? 1)
})
