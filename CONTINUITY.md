# CONTINUITY.md — OMP Agent

Handoff log between AI sessions. **Read the newest entry before starting work;
append a new entry (newest first) before ending a session that changed state.**
Keep entries short: state, in-flight, blockers, next. Details belong in
`plans/reports/` and `plans/journals/` — link, don't duplicate.

Entry template:

```markdown
## YYYY-MM-DD — <one-line focus>
- **State:** what works now, what changed
- **In-flight:** uncommitted / unfinished items
- **Next:** ranked next steps
- **Refs:** report/journal/plan paths
```

---

## 2026-09-02 — Composer & engine UX fix wave (uncommitted)

- **State:** Large fix wave verified green (tsc renderer+electron, full verify
  suite ~24 suites 0 failed) but **NOT yet committed** — sits on `main` working
  tree together with earlier Stage 5-7 work (sessions, settings, notifications,
  slash commands). Fixed this wave:
  - Composer perf: file picker capped at `MAX_PICKER_FILES=100`; command filter
    computed once (parent passes `items`/`groups` to `CommandMenu`); O(n²)
    `indexOf` → Map; `React.memo` on `ProjectTree`/`ChatHistory`/`AgentPanel`/
    `PromptComposer`/`CommandMenu`.
  - Inline `@file` chips sync both ways with text tokens
    (`findRemovedInlineAttachments`, 5 new tests in `verify-composer-attach`).
  - Command/file popovers no longer overflow the 420px panel
    (`sm:max-w-[calc(100%-24px)]`).
  - Engine restart race fixed: `startProcess` awaits `waitForProcessExit(old,
    3000)`; handshake/negotiation failures emit error toasts; engine start runs
    parallel to directory scan in `useWorkspace`.
  - Folder-dialog 2s delay fixed: removed all `execSync`/`execFileSync` from
    main process (`detectViaLoginShell` async + version cache).
  - Slash commands work mid-message (`slashIndex` mirrors `@` picker); Commands
    button/⌘+/ insert `/` at cursor. ProjectTree no longer auto-expands level-1.
  - Root agent docs added: `AGENTS.md`, `DOCTRINE.md`, this file.
- **In-flight:** everything above uncommitted; user confirmed perf feel is good.
- **Next:**
  1. Commit the wave (conventional commits; likely split renderer-perf /
     bridge-lifecycle / composer-ux / docs).
  2. Perf backlog (deliberately deferred): virtualize `ProjectTree`, lazy-load
     folder children instead of depth-8 upfront scan.
  3. Watch for report of residual first-open NSOpenPanel slowness (macOS cold
     start, not app code).
- **Refs:**
  - `plans/reports/ak-debug-260901-2322-composer-lag-attach-sync-project-switch.md`
  - `plans/reports/ak-fix-260901-2327-composer-lag-attach-sync-project-switch.md`
  - `plans/journals/2026-09-01-fix-composer-lag-attach-chip-sync-command-menu-overflow-proj.md`
