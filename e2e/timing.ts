// WHERE A SPEC'S TIME WENT: the fixture putting the app back on the menu, the
// LOAD that puts the spec's starting state in place (`e2e/load.ts`), and the
// test itself — the move from that state to the next, which is the only part
// a spec is about. Printed as one table at the end of the run, slowest load
// first, with the totals under it.

import type {
  FullResult,
  Reporter,
  TestCase,
  TestResult,
  TestStep
} from '@playwright/test/reporter'

/** What a load step's title starts with — `openBattle` names its step so. */
export const LOAD_STEP = 'load '

interface Row {
  title: string
  setup: number
  load: number
  test: number
}

const seconds = (ms: number): string => `${(ms / 1000).toFixed(1).padStart(6)}s`

/** The milliseconds under steps whose title is a load, however deep. */
const loadIn = (steps: readonly TestStep[]): number =>
  steps.reduce(
    (sum, step) =>
      sum +
      (step.category === 'test.step' && step.title.startsWith(LOAD_STEP)
        ? step.duration
        : loadIn(step.steps)),
    0
  )

export default class Timing implements Reporter {
  private readonly rows: Row[] = []

  onTestEnd(test: TestCase, result: TestResult): void {
    // Only the app's suite loads anything; a unit run prints no table.
    const project = test.parent.project()
    if (project === undefined || project.name !== 'e2e') return
    // The fixture's work is the HOOK steps — before and after the body.
    const setup = result.steps
      .filter((step) => step.category === 'hook')
      .reduce((sum, step) => sum + step.duration, 0)
    const load = loadIn(result.steps)
    this.rows.push({
      title: `${test.location.file.replace(/^.*[\\/]e2e[\\/]/, '')} › ${test.title}`,
      setup,
      load,
      test: Math.max(0, result.duration - setup - load)
    })
  }

  onEnd(_result: FullResult): void {
    if (this.rows.length === 0) return
    const lines = [...this.rows]
      .sort((a, b) => b.load - a.load)
      .map((row) => `${seconds(row.setup)} ${seconds(row.load)} ${seconds(row.test)}  ${row.title}`)
    const total = (key: 'setup' | 'load' | 'test'): number =>
      this.rows.reduce((sum, row) => sum + row[key], 0)
    console.log(
      [
        '',
        '  setup    load    test',
        ...lines,
        `${seconds(total('setup'))} ${seconds(total('load'))} ${seconds(total('test'))}  TOTAL`
      ].join('\n')
    )
  }
}
