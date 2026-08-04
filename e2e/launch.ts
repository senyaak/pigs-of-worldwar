// Shared Electron launch helper for the e2e suite (docs/testing.md).
//
// Every launch goes through here so the error listeners are attached before
// the renderer bundle runs: a renderer that died at top level keeps its static
// markup, and only the collected errors tell a passing test from wreckage.

import { _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import path from 'node:path'

/** Repo root — the folder holding package.json. */
export const REPO_ROOT = path.dirname(__dirname)

/**
 * The real game installation the suite reads from (never writes to).
 * This repo lives inside the game folder, so the parent is the default;
 * POW_GAME_DIR overrides it on machines laid out differently.
 */
export const GAME_DIR = process.env.POW_GAME_DIR || path.dirname(REPO_ROOT)

/** Scratch space for env files and fabricated installs; wiped by the specs. */
export const TMP = path.join(REPO_ROOT, '_tmp')

export interface Launched {
  app: ElectronApplication
  page: Page
  /** Uncaught renderer errors and console.error output, in order. */
  errors: string[]
  /** Main-process stdout/stderr, line by line. */
  log: string[]
}

export interface LaunchOptions {
  /** Value for POW_ENV_FILE — where the app reads/writes its .env. */
  envFile: string
  /** Extra CLI arguments, e.g. --game-dir=… */
  args?: string[]
}

/**
 * Launch the built app (`out/main/index.js`, the way `npm start` runs it).
 * `envFile` is required on purpose: a spec that forgets it would read and
 * clobber the developer's real .env.
 */
export async function launchApp(options: LaunchOptions): Promise<Launched> {
  const app = await electron.launch({
    args: ['.', ...(options.args ?? [])],
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      POW_ENV_FILE: options.envFile
    } as Record<string, string>
  })
  const errors: string[] = []
  const log: string[] = []
  const collect = (chunk: Buffer | string): void => {
    for (const line of String(chunk).split(/\r?\n/)) if (line.trim()) log.push(line)
  }
  app.process().stdout?.on('data', collect)
  app.process().stderr?.on('data', collect)

  const page = await app.firstWindow()
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  await page.waitForLoadState('domcontentloaded')
  return { app, page, errors, log }
}
