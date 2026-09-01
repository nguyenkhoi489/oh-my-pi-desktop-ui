---
title: Fix Electron preload and set up Git
status: completed
priority: P1
effort: small
branch: main
tags: [electron, vite, git]
created: 2026-09-01
---

# Fix Electron preload and set up Git

## Outcome

Build exactly one CommonJS `dist-electron/preload.cjs`, load it in Electron without a syntax error, verify `electronAPI` exposure when feasible, then initialize a safe local Git baseline.

## Proven root cause

`package.json` keeps the project in ESM mode. `vite-plugin-electron` supplies preload format `es`, while `vite.config.ts` adds `cjs`; Vite merges both format arrays and both outputs target `preload.cjs`. The later ESM write leaves `export default` in a `.cjs` file, which Electron cannot parse as CommonJS.

## Constraints

- Keep `"type": "module"` and main-process ESM behavior.
- Minimal config fix plus a focused regression check; no dependency upgrade, IPC refactor, UI/API change, remote, push, or PR.
- Preserve project files; ignore dependencies, generated artifacts, logs, local env files, and OS metadata.
- Use npm. Never expose or commit secrets. Do not modify global Git identity.

## Tasks

| ID | Status | Task |
|---|---|---|
| 1 | Completed | Replace the preload `build.lib` output settings in `vite.config.ts` with one explicit `rollupOptions.output` entry using `format: 'cjs'` and `entryFileNames: 'preload.cjs'`. Keep the existing preload entry, output directory, and reload hook. |
| 2 | Completed | Add root `.gitignore` entries for `node_modules/`, `dist/`, `dist-electron/`, `release/`, coverage/log/cache files, `.DS_Store`, and `.env*` while allowing `.env.example`. |
| 3 | Completed | Add a focused Node regression check for CommonJS syntax, prove it fails against the broken artifact, rebuild, then prove it passes. Run the project build and confirm a single preload artifact. |
| 4 | Completed | Verify `node --check dist-electron/preload.cjs`, confirm no top-level `import`/`export`, and run Electron development startup long enough to check that the preload syntax error is absent and `window.electronAPI` exists when practical. Stop every process started for verification. |
| 5 | Completed | Run `git init -b main`, verify ignore rules and staged filenames, ensure no secret/generated/dependency files are tracked, then create one focused baseline commit if Git identity is already available. Report identity as the only blocker if unavailable. |
| 6 | Completed | Review the final diff/status for scope, regressions, and documentation impact; report exact verification evidence and any remaining limitation. |

## Acceptance criteria

- Resolved build config contains one preload output: CommonJS `preload.cjs`.
- `dist-electron/preload.cjs` passes Node syntax checking and has no top-level ESM import/export.
- npm build passes, or any unrelated packaging failure is isolated with the narrower Electron/Vite build passing.
- Electron emits no preload `Unexpected token 'export'`; `electronAPI` exposure is verified when feasible.
- Local Git repository exists on `main`; generated/dependency/secret files are ignored; safe baseline commit exists when identity permits.

## Risks and rollback

- Electron UI verification may be constrained by desktop automation; retain console/process evidence and state the limitation.
- If full packaging fails for an unrelated signing/toolchain reason, do not weaken checks; record it separately.
- Rollback is limited to restoring `vite.config.ts`, removing `.gitignore` if unwanted, and removing only the newly created `.git` directory with explicit user approval.

## Unresolved questions

- None.
