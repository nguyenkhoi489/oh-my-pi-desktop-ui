# DOCTRINE.md — OMP Agent

Engineering philosophy behind the rules in `AGENTS.md`. When a rule seems to get
in your way, this file explains why it exists; change the rule only with evidence
that beats the incident that created it.

## 1. Diagnosis before fix

Every bug gets a root-cause diagnosis with `file:line` evidence before any code
changes. Symptom patches are failure: they hide causes, multiply later work, and
rot trust in the codebase. Reports live in `plans/reports/`; a fix that can't
cite its cause doesn't merge.

## 2. The main process is sacred

Electron's main process serves every IPC call, dialog, and engine frame. One
synchronous child process or one large blocking loop there degrades the *entire*
app at once — this is how a 2-second delay appeared before the folder-picker
dialog. Anything slow runs async, cached, or in the engine process.

## 3. Contracts are tests, tests are contracts

The `scripts/verify-*.mjs` suites are not decoration; they pin the IPC surface,
RPC frames, and util signatures that renderer, main process, and the OMP engine
all depend on. A contract change without its verify-script change is a broken
contract, even if the app happens to run.

## 4. The UI never lies

Every failure surfaces: engine start failures emit an error toast, busy states
disable actions with a reason, background races resolve deterministically
(await the old process's death before spawning the new one). Silent failure cost
users a "reopen the project twice" ritual once; never again.

## 5. Scale is the default input

A workspace is assumed to hold thousands of files and a session thousands of
tokens per second. Render caps, `React.memo`, rAF batching, and bounded IPC
payloads are the baseline, not optimizations to add later. If a list, tree, or
stream has no bound, it is a bug waiting for a big project.

## 6. Symmetry of state

Whatever opens must close from every exit path; whatever is inserted inline must
be removable from both representations (text token ↔ chip). Asymmetric state is
where UI ghosts live.

## 7. Real behavior only

Mocks exist in exactly one place (`src/mock/demoData.ts`) for browser preview
without Electron. Everywhere else, code talks to the real engine, real
filesystem, real settings. A check satisfied by fake data is a check defeated.

## 8. Two languages, one codebase

Users read Vietnamese: UI strings, toasts, and code comments (one short line,
only when purpose isn't obvious). Machines and history read English: identifiers,
commits, and agent-facing docs. Don't mix directions.

## 9. Small, scoped, boring changes

Deliver the requested scope, match the surrounding style, prefer extracting a
pure function over adding an abstraction. Cleverness that the next agent must
reverse-engineer is negative work.
