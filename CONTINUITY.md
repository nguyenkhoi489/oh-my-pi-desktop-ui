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

## 2026-09-02 — Phase 2: Engine Config Backend (omp config parity)

- **State:** Đã hoàn thành toàn bộ Phase 2 của roadmap OMP Parity Gap:
  - `electron/engine-config.ts`: Module đọc/ghi cấu hình engine qua `omp config list --json` (482 keys) và `omp config list` (trích xuất 87 enum options dạng `(a|b|c)`), hỗ trợ `setEngineConfigValue`, `resetEngineConfigValue`, `getEngineConfigPath`, cơ chế cache in-memory 60s theo `profile` (tự động invalidate khi set/reset, hỗ trợ `forceRefresh`), timeout 15s, buffer 10MB và validation key an toàn.
  - `electron/types.ts` & `src/types/index.ts`: Bổ sung các kiểu `EngineConfigValueType`, `EngineConfigEntry`, `FetchEngineConfigOptions`, `SetEngineConfigOptions`, `ResetEngineConfigOptions`, `EngineConfigPathOptions`, `EngineConfigListResult`, `EngineConfigMutationResult`, `EngineConfigPathResult`, và cập nhật `ElectronAPI` với `getEngineConfig`, `setEngineConfigValue`, `resetEngineConfigValue`, `getEngineConfigPath`.
  - `electron/main.ts` & `electron/preload.ts`: Đăng ký 4 IPC handler (`omp:config-list`, `omp:config-set`, `omp:config-reset`, `omp:config-path`) và expose trong context bridge preload.
  - `src/hooks/useOmpRpc.ts`: Bổ sung các callback `getEngineConfig`, `setEngineConfigValue`, `resetEngineConfigValue`, `getEngineConfigPath`.
  - `scripts/verify-engine-config.mjs`: Test suite (35 assertions) kiểm tra parser, banner handling, merger enum options, validation key rỗng/khoảng trắng, live fetch (≥480 keys, ≥80 enums), roundtrip set/reset trên `tui.tight`, `config path`, và cache/forceRefresh invalidation.
  - `package.json`: Thêm script `test:engine-config` vào `test` chain.
  - Verification: `test:engine-config` (35/35 passed), `test:preload` (pass), và cả 2 typechecks (`npx tsc --noEmit` & `npx tsc -p tsconfig.node.json --noEmit`) 0 lỗi.
- **In-flight:** Không có. Sẵn sàng cho Phase 3: Engine Config Editor UI.
- **Next:**
  1. Triển khai Phase 3: Engine Config Editor UI (`plans/260902-2057-omp-parity-gap-i18n/phase-03-engine-config-editor-ui.md`).
- **Refs:**
  - `plans/260902-2057-omp-parity-gap-i18n/plan.md`
  - `plans/260902-2057-omp-parity-gap-i18n/phase-02-engine-config-backend.md`
  - `scripts/verify-engine-config.mjs`

---
## 2026-09-02 — OMP CLI → Desktop Feature Parity Roadmap (All 18 Phases Complete)

- **State:** Đã hoàn thành 100% toàn bộ 18 Phase của Roadmap Parity CLI v18:
  - **Phase 1-6 (RPC Core & Observability):** Probe live, Steering, Follow-up queue & 3 modes, Todos Panel, Subagent Transcript, Auto-retry/Fast Mode/Handoff.
  - **Phase 7 (Global Usage & Stats):** `omp usage --json` & `omp stats --json`, cache 60s, SessionStatsPanel tabs.
  - **Phase 8 (Session Import):** `session-import.ts`, import session từ Claude Code (`~/.claude/projects`) và Codex (`~/.codex/sessions` / sqlite), convert sang format OMP v3 headers, ImportSessionModal UI.
  - **Phase 9 (Engine Maintenance):** `engine-maintenance.ts`, check update binary `omp update`, quản lý local tiny-models, setup components, OpsModal Engine tab.
  - **Phase 10 & 11 (Bash Bridge & Terminal Panel UI):** RPC `bash` execution, streaming output & buffer truncation, `abort_bash`, TerminalView component tích hợp trong Canvas.
  - **Phase 12 (Collab Share & Join):** `collab-share.ts`, `omp share` (gist/url), `omp join`, ShareSessionModal & JoinSessionModal UI.
  - **Phase 13 (PS & Worktree Managers):** `ops-manager.ts`, `omp ps` background daemons list/logs/stop/restart/kill, `omp worktree` list/clear, OpsModal Processes & Worktrees tabs.
  - **Phase 14 & 15 (Plugin & Agents Managers):** `extension-manager.ts`, `omp plugin` install/uninstall/link/list, `omp agents unpack` (user/project scope), OpsModal Extensions & Agents tabs.
  - **Phase 16 (Profiles):** `profile-paths.ts`, `--profile` spawn flag, resolve `~/.omp/profiles/<name>`, list/create/switch profiles, SettingsModal profile selector & active badge.
  - **Phase 17 & 18 (Host Tools Foundation, Suite & URI Schemes):** `host-tools.ts`, `HostToolRegistry`, protocol `set_host_tools` & `set_host_uri_schemes`, inbound `host_tool_call` execution (với timeout guard & abort controller) & `host_tool_result` response, 5 built-in tools (`notify_user`, `open_in_browser`, `reveal_file`, `open_in_app`, `pick_file`), SettingsModal toggle.
  - **Verification & Testing:** Toàn bộ test verify suites (`test:host-tools`, `test:profiles`, `test:extension-manager`, `test:ops-manager`, `test:share-join`, `test:terminal`, `test:engine-maintenance`, `test:session-import`, `test:usage-stats`, `test:retry-fastmode`, `test:subagent-transcript`, `test:todos-panel`, `test:steering`) và cả 2 typechecks (`npx tsc --noEmit` & `npx tsc -p tsconfig.node.json --noEmit`) đạt 100% pass.
- **In-flight:** Toàn bộ code đã clean, sẵn sàng commit.
- **Next:**
  1. Thực hiện commit thay đổi và bàn giao cho người dùng.
- **Refs:**
  - `plans/260902-1133-omp-cli-desktop-parity/plan.md`
  - `plans/260902-1133-omp-cli-desktop-parity/phase-*.md`

---
## 2026-09-02 — Phase 7: Global Usage & Stats (omp usage / omp stats)

- **State:** Đã hoàn thành toàn bộ Phase 7:
  - `electron/usage-stats.ts`: Module spawn `omp usage --json` và `omp stats --json` qua `execFileAsync`, cơ chế cache in-memory 60s, timeout 15s, parse JSON an toàn (bóc tách banner đồng bộ như `Syncing session files...`), chuẩn hóa thành `OmpGlobalUsageData` và `OmpGlobalStatsData`, xử lý lỗi mềm và lưu `raw` output khi cần degrade.
  - `electron/types.ts` & `src/types/index.ts`: Bổ sung toàn bộ kiểu dữ liệu cho `OmpUsageLimit`, `OmpUsageReport`, `OmpUsageCapacityItem`, `OmpGlobalUsageData`, `OmpOverallStats`, `OmpModelStats`, `OmpFolderStats`, `OmpAgentTypeStats`, `OmpGlobalStatsData`, `GlobalUsageResult`, `GlobalStatsResult`, và cập nhật `ElectronAPI` với `getGlobalUsage`, `getGlobalStats`.
  - `electron/main.ts` & `electron/preload.ts`: Đăng ký IPC handler `omp:global-usage`, `omp:global-stats` (sử dụng `resolveOmpBinaryPath()`), và expose trong context bridge preload.
  - `src/hooks/useOmpRpc.ts`: Bổ sung các callback `getGlobalUsage(forceRefresh?)` và `getGlobalStats(forceRefresh?)`.
  - `src/components/HeaderBar/SessionStatsPanel.tsx`: Cập nhật giao diện với 3 tab chuyển đổi (`Session`, `Usage Limits`, `Global Stats`), skeleton loading, nút làm mới cưỡng bức (bỏ qua cache), thanh hạn mức quota trực quan với phân loại màu sắc (emerald/amber/rose), badge cảnh báo khi quota > 80%, thời gian reset đếm ngược, bảng chi tiết theo model và top workspace.
  - `src/components/HeaderBar.tsx` & `src/App.tsx`: Truyền các props `onGetGlobalUsage` và `onGetGlobalStats` vào `HeaderBar` và `SessionStatsPanel`.
  - `scripts/verify-usage-stats.mjs`: Test suite (45 assertions) kiểm tra việc trích xuất JSON, parse fixture thực tế, cache 60s & forceRefresh, timeout, error fallback, và IPC/preload contract.
  - `package.json`: Bổ sung `test:usage-stats` vào `scripts` và chuỗi `test`.
  - Typecheck (`npx tsc --noEmit` & `npx tsc -p tsconfig.node.json --noEmit`), `test:usage-stats`, `test:preload`, và `build` pass 100%.
- **In-flight:** Phase 7 hoàn thành trọn vẹn, toàn bộ 7 Phase của parity roadmap đã hoàn tất.
- **Next:**
  1. Review tổng thể và commit theo conventional commit (`feat(observability): add global usage limits and stats parity`).
- **Refs:**
  - `plans/260902-1133-omp-cli-desktop-parity/phase-07-global-usage-stats.md`
  - `scripts/verify-usage-stats.mjs`

---
## 2026-09-02 — Phase 6: Auto-retry, Fast Mode & Tiện ích RPC nhỏ

- **State:** Đã hoàn thành toàn bộ Phase 6:
  - `electron/omp-rpc-types.ts`, `electron/types.ts`, `src/types/index.ts`: Bổ sung `SetAutoRetryCommand`, `AbortRetryCommand`, `SetFastModeCommand`, `GetLastAssistantTextCommand`, `HandoffCommand`, `AutoRetryStartEvent`, `AutoRetryEndEvent`, `OmpRetryState`, và các API contracts trong `ElectronAPI`.
  - `electron/omp-bridge.ts`: Bổ sung các RPC method `setAutoRetry(enabled)`, `abortRetry()`, `setFastMode(enabled)`, `getLastAssistantText()`, `handoff()`, bắt event `auto_retry_start` & `auto_retry_end` để cập nhật `retryState` và bắn IPC `omp:retry-state` sang renderer, tự động dọn dẹp retry khi `turn_start`, `turn_end`, hoặc kết thúc tiến trình.
  - `electron/main.ts` & `electron/preload.ts`: Đăng ký và expose các IPC handler `omp:set-auto-retry`, `omp:abort-retry`, `omp:set-fast-mode`, `omp:get-last-assistant-text`, `omp:handoff`, cùng listener `onOmpRetryState`.
  - `electron/settings-store.ts`: Hỗ trợ lưu trữ và sanitize 2 thiết lập `autoRetry` và `fastMode`.
  - `src/hooks/useOmpRpc.ts`: Bổ sung `retryState`, `abortRetry`, `setAutoRetry`, `setFastMode`, `getLastAssistantText`, `handoff`, lắng nghe `onOmpRetryState`.
  - `src/components/AgentPanel/AgentPanel.tsx`: Thêm banner retry ("Đang retry (lần N)..." + nút "Huỷ retry") ngay phía trên PromptComposer khi `retryState.isRetrying === true`, tự động ẩn khi kết thúc và không che composer.
  - `src/components/Modals/SettingsModal.tsx`: Thêm 2 toggle switch cho Auto-retry (`autoRetry`) và Fast Mode (`fastMode`) trong tab Engine, đồng bộ live xuống engine đang chạy và lưu vào `SettingsStore`.
  - `src/components/HeaderBar.tsx` & `src/components/AgentPanel/ChatHistory.tsx`: Bổ sung nút sao chép câu trả lời cuối cùng (`getLastAssistantText`) với toast xác nhận.
  - `src/utils/commandMenu.ts`: Thêm lệnh `handoff` vào danh mục `DEMO_COMMANDS` phục vụ Omnibar.
  - `scripts/verify-retry-fastmode.mjs`: Test suite (54 checks) kiểm tra persistence, event dispatch, framing, offline fallback, IPC/preload contract.
  - `package.json`: Thêm `test:retry-fastmode` vào `scripts` và chuỗi `npm test`.
  - Typecheck (`npx tsc --noEmit` & `npx tsc -p tsconfig.node.json --noEmit`) và `scripts/verify-retry-fastmode.mjs` pass 100%.
- **In-flight:** Phase 6 hoàn thành, toàn bộ 6 Phase của parity roadmap đã sẵn sàng.
- **Next:**
  1. Review toàn diện codebase, chạy live verify và commit deliverables.
- **Refs:**
  - `plans/260902-1133-omp-cli-desktop-parity/phase-06-retry-fastmode-utils.md`
  - `scripts/verify-retry-fastmode.mjs`

---
## 2026-09-02 — Phase 5: Subagent Transcript Viewer

- **State:** Đã hoàn thành toàn bộ Phase 5:
  - `electron/omp-rpc-types.ts`, `electron/types.ts`, `src/types/index.ts`: Bổ sung `GetSubagentMessagesCommand`, `GetSubagentMessagesResponseData`, `OmpCommandFrame` union update, và API contract `getSubagentMessages` trong `ElectronAPI`.
  - `electron/omp-bridge.ts`: Bổ sung `getSubagentMessages({ subagentId, sessionFile, fromByte })` gọi lệnh RPC `get_subagent_messages`, dịch `messages` qua `translateHistoryMessages` thành `ChatMessage[]`, trả về `{ sessionFile, fromByte, nextByte, reset, messages }`, và xử lý lỗi mềm không crash.
  - `electron/main.ts` & `electron/preload.ts`: Đăng ký IPC handler `omp:get-subagent-messages` và expose trong context bridge preload.
  - `src/hooks/useSubagentTranscript.ts`: Tạo hook quản lý transcript incremental, tracking `fromByte`, tự động tail polling interval khi subagent có trạng thái `running`/`started`, tự động dừng khi kết thúc hoặc đóng drawer, hỗ trợ manual `refresh` và `clear`.
  - `src/components/AgentPanel/SubagentTranscript.tsx`: Tạo slide-over drawer xem transcript chi tiết của subagent với backdrop blur, header info (id, agent badge, status pulse, live indicator), banner mô tả nhiệm vụ, scroll view hiển thị message bubbles (User, Assistant ThinkingCard, ToolCallCard, MarkdownRenderer, System), toggle auto-scroll, và status bar đếm số message / dung lượng byte.
  - `src/components/Sidebar/SubagentHub.tsx`: Click vào subagent card trong SubagentHub để mở `SubagentTranscript` drawer.
  - `scripts/verify-subagent-transcript.mjs`: Test suite (39 checks) kiểm tra offline guard, validation, command formatting, translation sang ChatMessage, incremental nextByte, reset handling, bus unavailable error handling, và IPC/preload contract.
  - `package.json`: Thêm `test:subagent-transcript` vào `scripts` và `npm test`.
  - Typecheck (`npx tsc --noEmit` & `npx tsc -p tsconfig.node.json --noEmit`) và toàn bộ test suites pass 100%.
- **In-flight:** Phase 5 hoàn thành, sẵn sàng chuyển tiếp sang Phase 6 (Retry, Fast Mode & Utils).
- **Next:**
  1. Thực hiện Phase 6: `phase-06-retry-fastmode-utils.md` (`set_auto_retry`, `abort_retry`, `set_fast_mode`, `get_last_assistant_text`, `cycle_model`, `cycle_thinking_level`, `handoff`).
- **Refs:**
  - `plans/260902-1133-omp-cli-desktop-parity/phase-05-subagent-transcript.md`
  - `scripts/verify-subagent-transcript.mjs`

---
## 2026-09-02 — Phase 4: Todos Panel — hiển thị plan/tiến độ của agent

- **State:** Đã hoàn thành toàn bộ Phase 4:
  - `electron/omp-rpc-types.ts`, `electron/types.ts`, `src/types/index.ts`: Bổ sung `OmpTodoPhase`, `OmpTodoItem`, `OmpTodoStatus`, `SetTodosCommand`, `TodosEvent`, `TodoReminderEvent`, và cập nhật `OmpEngineState` với `todoPhases` & `todos`.
  - `electron/omp-bridge.ts`: Bổ sung `getTodos()`, `setTodos(phases)`, `normalizeAndSetTodos()`, `emitTodosUpdate()`, bắt event `todos` & `todo_reminder`, đồng bộ `getState()` vào todos snapshot, và dọn dẹp sạch khi đổi/tạo session mới hoặc tắt process.
  - `electron/main.ts` & `electron/preload.ts`: Đăng ký và expose các IPC handler `omp:get-todos`, `omp:set-todos`, và listener `omp:todos-update`.
  - `src/hooks/useOmpRpc.ts`: Bổ sung state `todoPhases`, `todos`, `setTodos: updateTodos`, `refreshTodos`, tự động sync từ engine state/event và dọn dẹp khi đổi session.
  - `src/components/AgentPanel/TodoPanel.tsx`: Tạo mới component `TodoPanel` (`React.memo`), collapsible, hiển thị thanh tiến độ `x/y hoàn thành`, mini progress bar, auto-scroll tới mục in-progress, phân nhóm theo phase hoặc flat list, ẩn hoàn toàn khi không có todo.
  - `src/components/AgentPanel/AgentPanel.tsx` & `src/App.tsx`: Gắn `TodoPanel` ngay phía trên `ChatHistory` và kết nối với `useOmpRpc`.
  - `scripts/verify-todos-panel.mjs`: Test suite 57 checks kiểm tra framing, event dispatch, snapshot replay, session clear, IPC contract, UI memo and structure. Thêm `test:todos-panel` vào `package.json` và `npm test`.
  - Typechecks (`npx tsc --noEmit` & `npx tsc -p tsconfig.node.json --noEmit`) và các verify suites pass 100%.
- **In-flight:** Phase 4 hoàn thành, sẵn sàng chuyển tiếp sang Phase 5 (Subagent Transcript) hoặc Phase 6 (Retry, Fast Mode & Utils).
- **Next:**
  1. Thực hiện Phase 5: `phase-05-subagent-transcript.md` hoặc Phase 6: `phase-06-retry-fastmode-utils.md`.
- **Refs:**
  - `plans/260902-1133-omp-cli-desktop-parity/phase-04-todos-panel.md`
  - `scripts/verify-todos-panel.mjs`

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
