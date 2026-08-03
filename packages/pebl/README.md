# bepebl

Local-only AI Task Receipts for Claude Code and Codex CLI. Installs as the npm package `bepebl`; the command you run is `pebl`.

After a meaningful AI coding task, `pebl` tells you whether it actually held up — with evidence (a git commit, a real test/build run, and a revert check), not a guess. This is the [Verified AI Task Receipt](../../docs/01-product/mvp-wedge-verified-receipt.md) wedge of the larger [Pebl](../../README.md) project.

## Status

Functional, dogfooded manually against real hook payloads and real git repos, but **not yet validated at scale**. The thing this package's entire pitch depends on — the Verification Join's real-world precision — is genuinely unknown until someone runs it against real usage for real days. See [`docs/prd/verified-ai-task-receipt/PRD.md`](../../docs/prd/verified-ai-task-receipt/PRD.md) §9 (Success metrics) and the [IMPL plan](../../docs/impl/verified-ai-task-receipt/IMPL.md) §6 for exactly what "unvalidated" means here and why.

## What it does

- Registers hooks with Claude Code and/or Codex CLI.
- Watches meaningful tasks locally — nothing leaves your machine, no account, no cloud.
- After a task, joins the session to a real git commit, runs your project's actual test/build command, and checks back at 24h and 5 days whether the commit stuck.
- Renders a receipt that says exactly what it found — and says "not yet verified" rather than guessing when it doesn't have enough evidence.

## Install

```bash
npm install -g bepebl
```

(Not yet published. Until then, build from source: `npm install && npm run build` in this directory, then `npm link`.)

## Usage

```bash
# Register hooks for Claude Code in this project
pebl setup --agent claude-code

# Register hooks for Codex CLI globally, and opt in to the daily recheck scheduler
pebl setup --agent codex --global --scheduler

# After doing some real work with the agent, see the receipt
pebl receipt

# Check hook registration, scheduler status, and known permission caveats
pebl doctor

# Remove hooks (never touches your local event history unless you ask)
pebl uninstall

# Also delete all local event data and the index
pebl uninstall --purge-data
```

## Privacy

Everything is local: an append-only JSONL event log plus a SQLite index, both under `~/.pebl` (override with `PEBL_HOME`). No network calls. No account. Raw prompt text stays on your machine.

## Platforms

macOS, Linux, and Windows. The scheduler uses `cron` on macOS/Linux and Task Scheduler on Windows — both opt-in only (`--scheduler`); without it, rechecks still run opportunistically whenever a hook fires.

## Development

```bash
npm install
npm run build      # tsup -> dist/cli.js
npm test           # vitest
npm run lint        # eslint
npm run typecheck   # tsc --noEmit
```

## License

Apache-2.0 — see [LICENSE](./LICENSE).
