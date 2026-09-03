# AGENTS.md — OMP Agent

Rules for AI coding agents working in this repository. Read before making changes.
Companion files: `DOCTRINE.md` (the "why" behind these rules) and `CONTINUITY.md`
(session handoff log — read the newest entry first, append one when you finish).

## Project

macOS desktop IDE (Electron + React 18 + TypeScript + Vite + Tailwind) for the
**oh-my-pi (OMP)** coding agent. The Electron main process spawns `omp --mode rpc`
and bridges it to the renderer over a JSON-Lines stdio protocol.

## Layout

| Path | Purpose |
|------|---------|
| `electron/` | Main process: `main.ts` (IPC handlers), `omp-bridge.ts` (RPC bridge + engine lifecycle), `preload.ts` (renderer API), `settings-store.ts`, `omp-rpc-types.ts` |
| `src/components/` | React components, PascalCase files (`HeaderBar.tsx`, `AgentPanel/PromptComposer.tsx`) |
| `src/hooks/` | `useOmpRpc.ts` (all engine state/IPC), `useWorkspace.ts` (folder + file tree) |
| `src/utils/` | Pure logic extracted for testability (`fileMention.ts`, `commandMenu.ts`), camelCase files |
| `src/types/index.ts` | Shared types incl. the `window.electronAPI` contract |
| `scripts/verify-*.mjs` | Test suites (Node, no framework), run via `npm run test:*` |
| `plans/` | Plans, `plans/reports/` (debug/fix reports), `plans/journals/` |
| `docs/` | Project docs |

## Commands

```bash
npm run dev                 # Vite dev (renderer); Electron dev per README
npx tsc --noEmit            # Typecheck renderer
npx tsc -p tsconfig.node.json --noEmit   # Typecheck electron/
npm run test                # Full verify suite (~24 scripts, incl. live engine tests)
npm run test:<name>         # One suite, e.g. test:composer-attach, test:handshake
npm run build               # tsc + vite build + electron-builder
```

Always run both typechecks plus the verify suites covering the files you touched.
Live suites (`test:handshake`, `test:*-live`) spawn a real `omp` binary.

## Hard rules

1. **Public contracts are locked.** IPC channel names (`omp:*`, `fs:*`), the
   `preload.ts` API surface, RPC frame shapes in `omp-rpc-types.ts`, and exported
   util signatures are pinned by the verify scripts. Never change them silently —
   update the matching `scripts/verify-*.mjs` in the same change.
2. **No sync child processes in the Electron main process.** No `execSync` /
   `execFileSync` / `spawnSync` — they block the event loop and every IPC call
   (this caused a 2s delay opening the folder dialog once). Use
   `promisify(execFile)` and cache results.
3. **Engine lifecycle is delicate.** `OmpBridge.startProcess` must await the old
   process's real exit (`waitForProcessExit`) before spawning a new one. Failures
   must surface to the UI via `emitNotification(msg, 'error')`, never fail silently.
4. **No unbounded list rendering.** Any list fed by workspace scans or engine
   output gets a cap or virtualization (see `MAX_PICKER_FILES` in
   `PromptComposer.tsx`). Workspace file trees can hold thousands of nodes.
5. **Renderer perf discipline.** Heavy components (`ProjectTree`, `ChatHistory`,
   `AgentPanel`, `PromptComposer`, `CommandMenu`) are wrapped in `React.memo`;
   callbacks passed to them come from `useCallback`. Don't hand them fresh object
   /lambda props from `App.tsx`. No O(n²) work inside render loops.
6. **Real behavior only.** No fake data, mocks, or shortcuts to satisfy a check.
   `src/mock/demoData.ts` exists solely for the browser-preview fallback when
   `window.electronAPI` is absent — keep that pattern.
7. **State teardown symmetry.** UI state that opens (menus, pickers, `slashIndex`,
   `atCursorIndex`, inline-attachment sets) must be reset on every close path:
   select, Escape, click-outside, and send.

## Composer conventions

- `@` file mentions and `/` slash commands both work **mid-message**: track the
  trigger index (`atCursorIndex` / `slashIndex`), trigger only at start-of-input
  or after whitespace, and replace exactly the `@token` / `/token` span on select.
- Inline `@file` chips sync both ways with the text (`findRemovedInlineAttachments`
  in `src/utils/fileMention.ts`). Attachments added via the Attach button have no
  token and are unaffected.

## Style

- TypeScript everywhere; keep types in `src/types/index.ts` or `electron/types.ts`.
- Comments: sparse, **one short line in Vietnamese**, only where purpose isn't
  obvious. No doc blocks, no commented-out code, no plan/ticket IDs in code.
- UI strings đi qua `t()` (renderer) hoặc `tm()` (electron main / scripts) từ `shared/i18n`, key tiếng Anh, `vi` mặc định. Khi thêm key mới: bắt buộc thêm song song vào cả `shared/i18n/vi.ts` và `shared/i18n/en.ts` theo format `<area>.<component>.<slug>`, kiểm tra bằng `npm run test:i18n`. Identifiers and commits are English.
- Follow the surrounding file's naming and structure; extract pure functions into
  `src/utils/` when logic needs a test.
- KISS/DRY; add nothing beyond the requested scope.

## Testing pattern

Verify scripts are plain Node ESM run with `--experimental-strip-types`, importing
TS sources directly (`import { OmpBridge } from '../electron/omp-bridge.ts'`).
They use a local `assert(condition, message)` counter — no test framework. New
logic gets cases appended to the owning suite; a new area gets a new
`scripts/verify-<area>.mjs` plus a `test:<area>` entry in `package.json` and the
`test` chain.

## Git & docs

- Conventional commits, one line, English, no AI references
  (`fix(renderer): cap file picker rendering at 100 items`).
- Never commit secrets, dotenv files, or credentials.
- Markdown goes in `plans/` (reports → `plans/reports/`, naming
  `{type}-{yymmdd-hhmm}-{slug}.md`) or `docs/` — never elsewhere in the tree.
- Debug flow: root-cause diagnosis with `file:line` evidence **before** any fix;
  reports live in `plans/reports/`.
