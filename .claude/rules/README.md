# Working rules — index

Rules every Claude session in the owner's projects follows, a fleet role or
not. Claude Code loads every markdown file under `.claude/rules/` into every
session by itself, this index included, so they are short. They are a **copy
of a version of `senyaak/claude-fleet`**, like `.claude/fleet/`, and never
edited here. A project names its own parts of them — its reporters, its test
harness, its commands — in [docs/fleet/project.md](../../docs/fleet/project.md)
§ Build rules and § Verify; a project rule that goes further than these lives
in the project's own docs.

- [code.md](code.md) — small single-purpose modules, no leftovers, the mouse drives every control
- [commits.md](commits.md) — the owner authors, Claude commits, staged by name, no trailer
- [docs.md](docs.md) — one thing per file or an index; sorted one-line entries; corrections replace
- [failures.md](failures.md) — no failure is swallowed: every catch hands it on, reports it, or says why it is none
- [investigating.md](investigating.md) — search before reading, a negative is a list of searches, prove the cause
- [testing.md](testing.md) — a test fails at the moment something goes wrong; a gesture is an action the test waits on
- [writing-rules.md](writing-rules.md) — a rule is a protocol: when it applies, what to do
