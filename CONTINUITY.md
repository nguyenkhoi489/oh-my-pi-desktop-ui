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
## 2026-09-02 — Phase 9: Modal & Omnibar Refinement

- **State:** Phase 9 implemented and fully verified (all 27 verify suites in `npm run test` passed, 0 errors in renderer and electron tsc):
  - Tool approval extracted into non-blocking `ToolApprovalCard` docked above composer with explicit ⌘↵ Approve and ⌘⌫ Deny shortcuts (no ESC dismissal path).
  - PromptComposer disables message sending while tool approval is pending.
  - `PermissionModal` modularized with `SelectView`, `ConfirmView`, `InputView`; `SelectView` supports keyboard navigation (↑/↓, Enter, 1–9 number keys).
  - Fake countdown removed; truthful engine timeout countdown rendered only when positive timeout is provided by engine.
  - Omnibar modal updated with real command/skill catalog via shared `useCommandCatalog` hook and keyboard navigation.
  - Unified Z-index layering: `OmpRequiredModal` (z-[60]) > `PermissionModal` (z-[55]) > `OmnibarModal` (z-[50]).
  - Added `scripts/verify-modal-ux.mjs` and `npm run test:modal-ux`.
- **In-flight:** Phase 9 ready; Phase 10 (Live E2E Observability & Composer Verification) is next.
- **Next:**
  1. Execute Phase 10: Live E2E verification across all Phase 1–9 features.
  2. Stage and commit changes.
- **Refs:**
  - `plans/260901-1954-engine-observability-session-control/phase-09-modal-omnibar-refinement.md`
  - `plans/260901-1954-engine-observability-session-control/plan.md`


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
