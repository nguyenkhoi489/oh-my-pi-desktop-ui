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
## 2026-09-02 — Phase 3: Follow-up Queue & 3 chế độ engine

- **State:** Đã hoàn thành toàn bộ Phase 3:
  - `electron/omp-bridge.ts`: Bổ sung `followUp(message, context)`, `setSteeringMode(mode)`, `setFollowUpMode(mode)`, `setInterruptMode(mode)`, và tự động đồng bộ 3 chế độ từ `settingsStore` sau handshake.
  - `electron/omp-rpc-types.ts`, `electron/types.ts`, `src/types/index.ts`: Bổ sung `FollowUpCommand`, `SetSteeringModeCommand`, `SetFollowUpModeCommand`, `SetInterruptModeCommand`, `queued?: boolean` trong `ChatMessage`, các trường `steeringMode/followUpMode/interruptMode` trong `AppSettings` và engine state `queuedMessageCount`.
  - `electron/main.ts` & `electron/preload.ts`: Đăng ký và expose các IPC handler `omp:follow-up`, `omp:set-steering-mode`, `omp:set-follow-up-mode`, `omp:set-interrupt-mode`. Cập nhật `settings:set` đồng bộ live xuống bridge khi engine đang chạy.
  - `electron/settings-store.ts`: Hỗ trợ lưu trữ và sanitize 3 chế độ `steeringMode`, `followUpMode`, `interruptMode`.
  - `src/hooks/useOmpRpc.ts`: Bổ sung state `followUpQueue`, `followUp` callback, `cancelFollowUp` callback, tự động kích hoạt turn tiếp theo từ hàng đợi khi turn hiện tại kết thúc (`onOmpMessageComplete`), huỷ triệt để trước khi turn chạy.
  - `src/components/AgentPanel/PromptComposer.tsx`: Kích hoạt slot Queue follow-up (phím tắt `⌘Enter`), thêm nút trong split menu dropdown, thanh hiển thị hàng đợi follow-up phía trên composer kèm nút huỷ từng item.
  - `src/components/AgentPanel/ChatHistory.tsx`: Hiển thị badge `queued` (màu xanh dương) cho tin nhắn follow-up đang xếp hàng.
  - `src/components/Modals/SettingsModal.tsx`: Thêm mục "Hành vi Engine (Engine Behavior Modes)" trong tab Engine với 3 dropdown (`steeringMode`, `followUpMode`, `interruptMode`).
  - `scripts/verify-steering.mjs`: Mở rộng verify suite lên 81 checks (framing, offline fallback, settings persistence, renderer contract audit, queue enqueue & cancellation simulation).
  - Typechecks (`npx tsc --noEmit` & `npx tsc -p tsconfig.node.json --noEmit`) và các verify suites pass 100%.
- **In-flight:** Phase 3 hoàn thành, sẵn sàng chuyển tiếp sang Phase 4 (Todos Panel).
- **Next:**
  1. Thực hiện Phase 4: `phase-04-todos-panel.md` (Todos Panel collapsible phía trên ChatHistory, RPC `set_todos`, event `todos`/`todo_reminder`).
- **Refs:**
  - `plans/260902-1133-omp-cli-desktop-parity/phase-03-follow-up-queue-modes.md`
  - `scripts/verify-steering.mjs`

---
## 2026-09-02 — Phase 2: Steering & Stop-and-Send khi agent đang chạy

- **State:** Đã hoàn thành toàn bộ Phase 2:
  - `electron/omp-bridge.ts`: Thêm các method `steer(message, context)`, `abortAndPrompt(prompt, context)`, `abort()`, cập nhật `translateHistoryMessages` giữ cờ `steering: true`.
  - `electron/omp-rpc-types.ts`, `electron/types.ts`, `src/types/index.ts`: Bổ sung `AbortAndPromptCommand`, `steering?: boolean` trong `ChatMessage`, và các API contracts trong `ElectronAPI`.
  - `electron/main.ts` & `electron/preload.ts`: Đăng ký và expose các IPC handler `omp:steer`, `omp:abort-and-prompt`, `omp:abort`.
  - `src/hooks/useOmpRpc.ts`: Bổ sung callbacks `steer`, `abortAndPrompt`, `abort`.
  - `src/components/AgentPanel/PromptComposer.tsx`: Mở khoá composer khi agent đang chạy (`status !== 'idle'`), chỉ chặn khi `isToolApprovalPending`. Thêm split-button (Steer mặc định khi streaming, Stop & send ⌘⇧Enter, slot Queue follow-up ⌘Enter disabled Phase sau).
  - `src/components/AgentPanel/ChatHistory.tsx`: Hiển thị badge `steered` cho tin nhắn người dùng can thiệp tức thời.
  - `scripts/verify-steering.mjs`: Verify suite (28 checks) kiểm tra bridge command framing, offline fallback, IPC contract, session translation. Thêm `test:steering` vào `package.json` và chuỗi `npm test`.
  - Typecheck (`npx tsc --noEmit` & `npx tsc -p tsconfig.node.json --noEmit`) và toàn bộ test suites pass 100%.
- **In-flight:** Phase 2 hoàn thành, sẵn sàng chuyển tiếp sang Phase 3 (Follow-up Queue & Engine Modes).
- **Next:**
  1. Thực hiện Phase 3: `phase-03-follow-up-queue-modes.md` (Queue follow-up ⌘Enter, `set_steering_mode`, `set_follow_up_mode`, `set_interrupt_mode`).
- **Refs:**
  - `plans/260902-1133-omp-cli-desktop-parity/phase-02-steering-stop-send.md`
  - `scripts/verify-steering.mjs`

---
## 2026-09-02 — Image Drag-Drop & Clipboard Paste Attachment
- **State:** Completed Image Drag-Drop & Paste feature across all 4 phases:
  - Phase 1: Electron IPC `fs:save-image-attachment` in `electron/main.ts` and `electron/preload.ts`, saving image buffers to `.omp/attachments/` or temp dir asynchronously without blocking.
  - Phase 2: Pure utility module `src/utils/imageAttachment.ts` (`isImageFile`, `getImageExtension`, `extractImageFromClipboard`, `extractFilesFromDrop`, `computeRelativePath`, `formatImageDimensions`).
  - Phase 3: `PromptComposer.tsx` integration with `onPaste`, drag & drop (`onDragEnter`, `onDragOver`, `onDragLeave`, `onDrop`), drag overlay UI, 36x36px image thumbnail pills with zoom/delete, `ImageLightboxModal.tsx` for full-screen preview, and Object URL memory cleanup on delete/send/unmount.
  - Phase 4: `ChatHistory.tsx` updated with thumbnail cards for image attachments and Lightbox support. Created `scripts/verify-composer-image-attachment.mjs` (61 assertions) integrated as `test:composer-image-attachment` in `npm run test`.
  - Typechecks (`npx tsc --noEmit` and `npx tsc -p tsconfig.node.json --noEmit`) and verify suites pass with 0 errors.
- **In-flight:** All 4 phases complete and ready for commit.
- **Next:**
  1. Review changes and commit.
- **Refs:**
  - `plans/260902-1116-image-drag-drop-paste/plan.md`
  - `scripts/verify-composer-image-attachment.mjs`

---
## 2026-09-02 — Phase 10: Live E2E Observability & Session Control Verification

- **State:** Phase 10 and entire Stage 6 (Phase 1–10) fully implemented and verified against live OMP engine:
  - Live automated test suite `scripts/verify-observability-live.mjs` (44 assertions) created and integrated as `test:observability-live` in `npm run test`.
  - Verified L1 (Usage & Stats), L2 (Rename & disk jsonl title line), L3 (@file attach & fileMention frame expansion), L4 (Slash command & skill parity), L5 (Approval mode switch & tool approval card), L6 (Compaction, branching, and HTML export).
  - Generated findings report `plans/260901-1954-engine-observability-session-control/reports/observability-live-findings-260901.md` resolving all 4 technical points.
  - All 29 verify suites in `npm run test` pass 100% (0 errors in renderer and electron tsc).
  - `plan.md` and all 10 phase documents marked Complete.
- **In-flight:** All 10 phases of Stage 6 are complete and ready to commit.
- **Next:**
  1. Review git status and stage/commit all Phase 1–10 deliverables.
  2. Plan next stage or packaging/release work.
- **Refs:**
  - `plans/260901-1954-engine-observability-session-control/phase-10-live-observability-verification.md`
  - `plans/260901-1954-engine-observability-session-control/plan.md`
  - `plans/260901-1954-engine-observability-session-control/reports/observability-live-findings-260901.md`
  - `plans/journals/2026-09-02-phase-10-live-observability-verification.md`

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
