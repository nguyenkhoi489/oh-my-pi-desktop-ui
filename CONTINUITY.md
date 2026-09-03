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
## 2026-09-03 — Fix & Feature: Rich Markdown Preview (KaTeX Math, Prism Highlighting, DOMPurify) & Ops Process Removal
- **State:**
  - **Rich Markdown Preview:**
    - Cài đặt `katex`, `marked-katex-extension`, `prismjs`, `dompurify`, `@types/dompurify`, `@types/prismjs`, `@types/katex`.
    - Tách logic markdown core parser ra module độc lập `src/utils/markdownParser.ts`, tích hợp GitHub-flavored alerts, GFM tables, KaTeX inline/display math tokens (`$..$`, `$$..$$`), Prism code syntax highlighting, task lists, and DOMPurify sanitization.
    - Tích hợp KaTeX CSS (`katex/dist/katex.min.css`) và theme CSS vào `src/styles/globals.css`.
    - Đa ngôn ngữ hóa toàn bộ nhãn nút bấm/loading Markdown (`markdown.*`) qua `options.t` và `tm` fallback, xóa bỏ hoàn toàn text tiếng Anh hardcode.
    - Siết chặt bảo mật Mermaid diagram: chuyển `securityLevel: 'strict'` và làm sạch SVG qua `DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true } })`.
    - Cập nhật `src/components/Common/MarkdownRenderer.tsx` và `scripts/verify-markdown-renderer.mjs` sử dụng chung module parser.
    - Verification: `npm run test:markdown` pass 47/47 tests.
  - **Background Daemon Cross-Scope Operations & Process Removal:**
    - Chẩn đoán lỗi `omp ps kill <name>` thất bại khi process thuộc project scope khác cwd của app: `omp ps` chạy theo project context, thiếu cờ `--dir=<projectDir>`.
    - Chẩn đoán lỗi không thể xóa record daemon đã exit: CLI `omp ps` không có lệnh `rm`/`delete`.
    - Bổ sung `options.dir` cho `controlProcess`, `getProcessLogs`, `getProcessInfo`, `startProcessLogFollow` trong `electron/ops-manager.ts`, `electron/main.ts`, `electron/preload.ts`, và `electron/types.ts`.
    - Cung cấp `removeProcess` trong `OpsManager` xóa trực tiếp daemon metadata directory/file (`~/.omp/run/daemons/...`), tự động dọn broker nếu là daemon cuối cùng.
    - Phòng chống triệt để Path Traversal trong `removeProcess`: kiểm tra định dạng tên daemon/service và xác thực qua `path.relative` để ngăn chặn việc thoát khỏi thư mục gốc.
    - Khắc phục race condition hủy broker: kiểm tra lại danh sách tiến trình hoạt động trước khi gửi tín hiệu SIGTERM.
    - An toàn hóa test suite `scripts/verify-ops-manager.mjs`: chuyển sang stubbed process kill boundary và mock layout `<runtimeDir>/daemons/<name>/` dưới `tmpDir`, loại bỏ hoàn toàn nguy cơ kill nhầm tiến trình máy chủ.
    - Cập nhật UI `src/components/Modals/ops/ProcessesTab.tsx`: truyền `scope.projectDir` vào mọi hành động daemon (Info, Logs, Stop, Restart, Kill), phân biệt rõ trạng thái active (`running` / `starting`) và terminal (`exited` / `stopped`), phân tách nút Kill (Square) và nút Remove (Trash2).
    - Bổ sung đồng bộ i18n keys trong `shared/i18n/vi.ts` và `shared/i18n/en.ts`.
    - Cập nhật `scripts/verify-ops-manager.mjs` với 12 checks đầy đủ.
  - **Code Editor Save & Concurrency:**
    - Sử dụng `currentFilePathRef` và `latestEditorValueRef` để ngăn chặn race condition khi người dùng chuyển file hoặc gõ tiếp trong lúc đang lưu.
    - Thêm guard `selectedFileRef.current?.path === filePath` trong `useWorkspace.ts` để tránh cập nhật đè `fileContent` khi lưu tệp cũ.
- **In-flight:** Không có.
- **Next:** Tiếp tục kiểm thử và phát triển các tính năng tiếp theo theo yêu cầu người dùng.
- **Refs:**
  - `plans/reports/fix-260903-2245-ps-cross-scope-dir-and-remove.md`
  - `plans/260903-2200-rich-markdown-preview/plan.md`

## 2026-09-03 — Fix Engine Config Editor Save and Reset Stuck on "Đang lưu..." Spinner

- **State:** Đã khắc phục triệt để lỗi mục cấu hình trong Engine Config Editor bị treo vô tận ở trạng thái "Đang lưu..." sau khi lưu thành công:
  - `src/components/Modals/settings/EngineConfigEditor.tsx`:
    - Bổ sung khối `finally` cho cả `handleSaveKey` và `handleResetKey` để luôn xóa `key` khỏi `savingKeys` Set sau khi hoàn thành request (kể cả trường hợp thành công, lỗi trả về từ engine hay ngoại lệ thrown).
  - `scripts/verify-engine-config-ui.mjs`:
    - Bổ sung kiểm tra static contract và unit simulation vòng đời `savingKeys`, đảm bảo key luôn được xóa khỏi state saving ở cả 3 kịch bản: `success`, `failure` response và thrown exception.
  - Verification: `npm run test:engine-config-ui` (172/172 passed), `npm run test:engine-config` (35/35 passed), `npm run test:settings` (48/48 passed), `npm run test:i18n` (3256/3256 passed), `npx tsc --noEmit` và `npx tsc -p tsconfig.node.json --noEmit` 0 lỗi.
- **In-flight:** Không có.
- **Next:**
  1. Sẵn sàng theo dõi thêm trải nghiệm người dùng trên bảng cấu hình Engine.
- **Refs:**
  - `plans/reports/fix-260903-2220-engine-config-save-stuck-spinner.md`
  - `src/components/Modals/settings/EngineConfigEditor.tsx`
  - `scripts/verify-engine-config-ui.mjs`

## 2026-09-03 — Rich Markdown Preview Parity (KaTeX Math, Prism Highlighting, Mermaid Diagrams)

- **State:** Nâng cấp toàn diện bộ dựng Markdown của OMP-Agent đạt độ phong phú tương đương VS Code Preview và GitHub:
  - `src/utils/markdownParser.ts`:
    - Trích xuất toàn bộ cấu hình Marked parser ra module độc lập dùng chung cho Renderer và Node test scripts.
    - Tích hợp KaTeX tokenizer/renderer native cho cả công thức inline `$E = mc^2$` và block `$$\int_0^1 x dx$$` với MathML + HTML display.
    - Tích hợp PrismJS syntax highlighting cho code blocks (TypeScript, Python, Bash, Rust, Go, SQL, JSON, YAML, v.v.).
    - Thêm cơ chế nhận diện ````mermaid` và sinh container chuẩn bị cho việc dựng biểu đồ bất đồng bộ phía client.
    - Bổ sung `DOMPurify.sanitize()` bảo vệ an toàn XSS nhưng whitelist các tags và attributes của KaTeX MathML và SVG.
  - `src/components/Common/MarkdownRenderer.tsx`:
    - Bổ sung hiệu ứng dựng lười (lazy load) Mermaid diagrams qua dynamic import khi stream kết thúc (`!isStreaming`).
    - Bổ sung nút chuyển đổi xem mã nguồn ("Code") và xử lý hiển thị lỗi trực quan khi cú pháp Mermaid không hợp lệ.
  - `src/styles/globals.css` & `src/main.tsx`:
    - Import `katex/dist/katex.min.css` vào entry point Vite.
    - Định nghĩa bảng màu syntax highlighting cho Prism theo theme sáng/tối đồng bộ với Tailwind CSS.
    - Định nghĩa styling responsive cho biểu đồ Mermaid và thanh cuộn công thức KaTeX.
  - `shared/i18n/vi.ts` & `shared/i18n/en.ts`: Thêm đầy đủ các key i18n cho Mermaid loading, error, copy, code toggle.
  - Verification: `npm run test:markdown` (42/42 passed), `npm run test:i18n` (3256/3256 passed), `npm run test:artifacts-hydration` (41/41 passed), `npm run test:composer-attach` (38/38 passed), `npx tsc --noEmit` và `npx tsc -p tsconfig.node.json --noEmit` 0 lỗi.
- **In-flight:** Không có.
- **Next:**
  1. Tiếp tục hoàn thiện trải nghiệm Markdown và Canvas Preview theo phản hồi người dùng.
- **Refs:**
  - `plans/260903-2200-rich-markdown-preview/plan.md`
  - `src/utils/markdownParser.ts`
  - `src/components/Common/MarkdownRenderer.tsx`
  - `scripts/verify-markdown-renderer.mjs`

## 2026-09-03 — Fix Code Editor Save Hanging on Saving Spinner

- **State:** Đã khắc phục triệt để lỗi nút Lưu trong Code Editor bị treo vô tận ở trạng thái "Đang lưu...":
  - `src/components/Canvas/CodeEditor.tsx`:
    - Bổ sung khối `finally { setIsSaving(false); }` trong `handleSave`. Đảm bảo cờ `isSaving` luôn được reset về `false` sau khi lưu xong hoặc khi gặp lỗi.
    - Bổ sung cơ chế rollback an toàn cho `savedContentRef` và `isUserDirty` nếu thao tác lưu ghi file thất bại.
  - `scripts/verify-editor-save-state.mjs`: Bổ sung Test 4 kiểm tra vòng đời của `isSaving` và khẳng định cờ này luôn được reset ở cả 2 nhánh thành công và thất bại.
  - Verification: `npm run test:editor-save` (19/19 passed), `npm run test:unsaved-guard` (30/30 passed), `npm run test:git-timeline` (31/31 passed), `npm run test:git-file-history` (15/15 passed), `npm run test:i18n` (3244 passed, 0 failed), TypeScript Renderer và Electron 0 lỗi.
- **In-flight:** Không có.
- **Next:**
  1. Sẵn sàng cho các yêu cầu tiếp theo từ người dùng.
- **Refs:**
  - `plans/reports/fix-260903-2145-code-editor-save-stuck-spinner.md`
  - `src/components/Canvas/CodeEditor.tsx`
  - `scripts/verify-editor-save-state.mjs`

## 2026-09-03 — Fix Code Editor Async File Load and False Conflict Detection

- **State:** Đã khắc phục triệt để lỗi Code Editor không tự động nạp nội dung khi mở file và bắt người dùng phải bấm thủ công "Nạp lại từ đĩa":
  - `src/components/Canvas/CodeEditor.tsx`:
    - Bổ sung state `isUserDirty: boolean` và ref `savedContentRef`. Chỉ khi người dùng thực sự gõ phím trong Monaco (`onChange`), cờ `isUserDirty` mới được kích hoạt.
    - Tự động đồng bộ prop `content` mới từ đĩa vào `editorValue` khi `!isUserDirty` mà không kích hoạt cờ xung đột bên ngoài (`hasExternalConflict`).
    - Cờ xung đột bên ngoài chỉ kích hoạt khi người dùng có bản nháp chưa lưu VÀ file trên đĩa bị tiến trình bên ngoài sửa đổi khác với mốc đã lưu.
  - `src/hooks/useWorkspace.ts`: Cập nhật `selectFile` và `openFolderDialog` để đọc file trước khi gán đồng thời `selectedFile` và `fileContent`, loại bỏ trạng thái render trung gian rỗng.
  - `scripts/verify-unsaved-guard.mjs`: Bổ sung Test Case C kiểm tra việc tải bất đồng bộ không gây conflict giả.
  - Verification: `npm run test:unsaved-guard` (30/30 passed), `npm run test:editor-save` (13/13 passed), `npm run test:git-timeline` (31/31 passed), `npm run test:git-file-history` (15/15 passed), `npm run test:i18n` (3244 passed, 0 failed), TypeScript Renderer và Electron 0 lỗi.
- **In-flight:** Không có.
- **Next:**
  1. Sẵn sàng cho các yêu cầu tiếp theo từ người dùng.
- **Refs:**
  - `plans/reports/fix-260903-2140-code-editor-async-load-conflict.md`
  - `src/components/Canvas/CodeEditor.tsx`
  - `src/hooks/useWorkspace.ts`
  - `scripts/verify-unsaved-guard.mjs`

## 2026-09-03 — Preserve Complete Assistant Text and System Messages in Session History

- **State:** Đã khắc phục triệt để lỗi mất văn bản phản hồi/kết luận của Agent (sau các lệnh `bash` / tool calls) và mất tin nhắn `system` khi xem lại lịch sử session:
  - `electron/omp-bridge.ts`:
    - Mở rộng trích xuất văn bản đa dạng cho `msg.content` (hỗ trợ `string` trực tiếp, mảng `string[]`, các object blocks với `text`/`content`/`value`, các trường `output`/`prompt`/`text`).
    - Bổ sung nhánh xử lý đầy đủ cho `role === 'system'`, đảm bảo các tin nhắn hệ thống không bị drop.
    - Chuẩn hóa trích xuất kết quả `toolResult` toàn diện thay vì chỉ lấy dòng đầu tiên.
  - `scripts/verify-sessions.mjs`: Bổ sung test case kiểm tra tin nhắn trợ lý có `content` dạng plain string sau lệnh `bash` và tin nhắn hệ thống.
  - Verification: `scripts/verify-sessions.mjs` (67/67 passed), `npm run test:i18n` (3200/3200 passed), `npx tsc --noEmit` & `npx tsc -p tsconfig.node.json --noEmit` 0 lỗi.
- **In-flight:** Không có.
- **Next:**
  1. Sẵn sàng cho các yêu cầu tiếp theo từ người dùng.
- **Refs:**
  - `plans/reports/fix-260903-2055-missing-assistant-text-history.md`
  - `electron/omp-bridge.ts`
  - `scripts/verify-sessions.mjs`

## 2026-09-03 — Resolve Stuck Tool Call Spinner upon Session Completion

- **State:** Đã khắc phục triệt để lỗi tool call cuối cùng (`read`, ...) bị kẹt icon quay tròn (`running`) sau khi session hoặc turn đã hoàn tất:
  - `electron/omp-bridge.ts`:
    - Mở rộng nhận diện ID đa dạng trong `toolResult` (`tool_call_id`, `tool_use_id`, `call_id`) kèm cơ chế fallback tìm tool call `running` gần nhất.
    - Bổ sung post-processing sweep trong `translateHistoryMessages` để chuẩn hóa tất cả tool calls trong session history về `completed` (hoặc `failed` nếu có lỗi) kèm `endTime`.
    - Cập nhật `turn_end`, `agent_end` và `abort` để phát sự kiện đồng bộ `completed` cho các active tool calls còn lại trước khi dọn dẹp bộ nhớ.
  - `src/hooks/useOmpRpc.ts`: Chuẩn hóa toàn bộ tool calls trong `activeToolCallsRef.current` và `msg.toolCalls` sang `completed` khi nhận sự kiện `onOmpMessageComplete`.
  - `scripts/verify-sessions.mjs`: Bổ sung test case kiểm tra tool call không có `toolResult` hoặc có `tool_call_id` không chuẩn.
  - Verification: `scripts/verify-sessions.mjs` (61/61 passed), `scripts/verify-tool-events.mjs` (56/56 passed), `npm run test:i18n` (3200/3200 passed), `npx tsc --noEmit` & `npx tsc -p tsconfig.node.json --noEmit` 0 lỗi.
- **In-flight:** Không có.
- **Next:**
  1. Sẵn sàng cho các yêu cầu tiếp theo từ người dùng.
- **Refs:**
  - `plans/reports/fix-260903-2045-stuck-toolcall-spinner-resolved.md`
  - `electron/omp-bridge.ts`
  - `src/hooks/useOmpRpc.ts`
  - `scripts/verify-sessions.mjs`

## 2026-09-03 — Unify Multi-Step Tool Calls into Seamless Assistant Turns in Session History

- **State:** Đã khắc phục triệt để tình trạng các tool calls (`read`, `edit`, `bash`, ...) bị phân mảnh, xa cách và lặp lại nhiều header OMP Agent khi xem lại các session chat cũ:
  - `electron/omp-bridge.ts`: Cập nhật `translateHistoryMessages` tự động gộp các raw `assistant` messages kế tiếp nhau trong cùng 1 turn hội thoại thành 1 `ChatMessage` trợ lý duy nhất (gộp mảng `toolCalls` theo thứ tự thực thi, nối chuỗi `content`, và bảo toàn `thinking`).
  - `src/components/AgentPanel/ChatHistory.tsx`:
    - Chỉ render container `MarkdownRenderer` khi `msg.content` thực sự có nội dung, loại bỏ hoàn toàn padding thừa khi tin nhắn chỉ chứa tool calls.
    - Chỉ hiển thị nút `Copy` khi có nội dung phản hồi văn bản.
  - `scripts/verify-sessions.mjs`: Cập nhật Test 4 kiểm tra cấu trúc gom nhóm 1 turn hoàn chỉnh từ fixture và bổ sung test case multi-step tool calls (`read` -> `edit` -> `bash`).
  - Verification: `scripts/verify-sessions.mjs` (57/57 passed), `scripts/verify-composer-attach.mjs` (38/38 passed), `scripts/verify-steering.mjs` (80/80 passed), `npm run test:i18n` (3200/3200 passed), `npx tsc --noEmit` & `npx tsc -p tsconfig.node.json --noEmit` 0 lỗi.
- **In-flight:** Không có.
- **Next:**
  1. Sẵn sàng nhận các yêu cầu tiếp theo từ người dùng.
- **Refs:**
  - `plans/reports/fix-260903-2030-session-toolcalls-grouping.md`
  - `electron/omp-bridge.ts`
  - `src/components/AgentPanel/ChatHistory.tsx`
  - `scripts/verify-sessions.mjs`

## 2026-09-03 — Eliminate Duplicate Attached Context Cards in Chat History

- **State:** Đã khắc phục triệt để lỗi nhân đôi 2 thẻ Attached Context (1 thẻ ở trên và 1 thẻ ở dưới tin nhắn user) khi đính kèm file/ảnh trong khung chat:
  - `src/hooks/useOmpRpc.ts`:
    - Tắt việc tự chèn optimistic `fileMention` trước `userMsg` khi chạy trong Electron (`window.electronAPI`), chỉ giữ giả lập cho browser preview mode. OMP Engine đóng vai trò single source of truth cho context frame.
    - Bổ sung deduplication guard trong listener `onOmpMessageComplete` cho tin nhắn `role === 'fileMention'` trong cửa sổ 60s.
  - `src/components/AgentPanel/ChatHistory.tsx`:
    - Bổ sung presentation guard loại bỏ thẻ `fileMention` trùng lặp liền kề hoặc bị kẹp cạnh tin nhắn `user`.
  - `scripts/verify-composer-attach.mjs`: Bổ sung Test 5 kiểm tra deduplication logic cho fileMention.
  - Verification: `scripts/verify-composer-attach.mjs` (38/38 passed), `scripts/verify-composer-image-attachment.mjs` (65/65 passed), `scripts/verify-observability.mjs` (44/44 passed), `scripts/verify-omp-bridge.mjs` (55/55 passed), `npm run test:i18n` (3200/3200 passed), `npx tsc --noEmit` & `npx tsc -p tsconfig.node.json --noEmit` 0 lỗi.
- **In-flight:** Không có.
- **Next:**
  1. Tiếp tục cải tiến UI hoặc các tính năng tiếp theo theo yêu cầu người dùng.
- **Refs:**
  - `plans/reports/fix-260903-2025-chat-history-duplicate-attachments.md`
  - `src/hooks/useOmpRpc.ts`
  - `src/components/AgentPanel/ChatHistory.tsx`
  - `scripts/verify-composer-attach.mjs`

## 2026-09-03 — Transform Commit Assistant into First-Class Inline Canvas Tab

- **State:** Đã chuyển đổi Commit Assistant từ dạng Popup Modal thành một **First-Class Canvas Tab** hiển thị trực tiếp trong khu vực Canvas (tương tự như tab Terminal Logs):
  - `src/types/index.ts`: Mở rộng `ActiveCanvasTab` hỗ trợ `'commit'`.
  - `src/components/Canvas/CommitView.tsx`: Xây dựng component giao diện Commit Assistant chuyên dụng cho Canvas, loại bỏ hoàn toàn modal backdrop và fixed portal. Tích hợp thanh trạng thái branch/dirty files, form cấu hình context & model, AI message generation, preview/chỉnh sửa commit message, và streaming process logs.
  - `src/components/Canvas/CanvasContainer.tsx`: Bổ sung tab `Commit Assistant` ngay cạnh `Terminal Logs` trong Tab Bar, chuyển tab trực tiếp sang `'commit'` khi người dùng click, và render `CommitView` trong main canvas area.
  - `src/App.tsx`: Kết nối `workspacePath`, `availableModels`, `selectedModel`, và callback `refreshFiles` khi commit thành công vào `CanvasContainer`.
  - `scripts/verify-commit-assistant.mjs`: Cập nhật Test 11 kiểm tra `CanvasContainer` tích hợp tab `commit` và render `CommitView`.
  - Verification: `npm run test:commit-assistant` (12/12 passed), `npm run test:headerbar-layout` (21/21 passed), `npm run test:i18n` (3200/3200 passed), `npm run test:modal-ux` (44/44 passed), `npm run test:usage-history-dashboard` (77/77 passed), `npx tsc --noEmit` & `npx tsc -p tsconfig.node.json --noEmit` 0 lỗi.
- **In-flight:** Không có.
- **Next:**
  1. Tiếp tục triển khai Phase 18 hoặc các tính năng tiếp theo theo roadmap.
- **Refs:**
  - `src/components/Canvas/CommitView.tsx`
  - `src/components/Canvas/CanvasContainer.tsx`
  - `src/types/index.ts`
  - `src/App.tsx`
  - `scripts/verify-commit-assistant.mjs`
## 2026-09-03 — Eliminate HeaderBar Overlapping & Optimize Navbar Layout

- **State:** Đã khắc phục triệt để hiện tượng các phần tử trên HeaderBar bị chồng chéo (overlapping) lên nhau và tối ưu giao diện:
  - `src/components/HeaderBar.tsx`:
    - Bỏ hoàn toàn badge `Idle` gây nhiễu và chiếm diện tích (`default: return null;`), chỉ hiển thị status badge khi agent thực sự hoạt động (`thinking`, `streaming`, `executing_tool`, `compacting`, `waiting_permission`).
    - Bỏ chữ "Copilot" ở nút chuyển đổi Agent Panel, chuyển thành icon button `PanelRight`/`PanelRightClose` (`p-1.5`) đồng bộ gọn gàng với hàng nút điều khiển bên phải.
    - Khắc phục lỗi Flexbox `justify-center` gây tràn 2 bên: chuyển khối Center sang `flex-1 flex items-center justify-center min-w-0 overflow-hidden` để không bao giờ có thể tràn sang đè lên Left hay Right.
    - Tinh chỉnh khoảng cách `gap-1 sm:gap-1.5` cho khối Right, co gọn max-width cho model name và approval mode. Tổng chiều rộng thanh Navbar giảm hơn 250px, loại bỏ hoàn toàn hiện tượng chật chội và đè chồng element.
  - `scripts/verify-headerbar-layout.mjs`: Cập nhật 21 checks xác minh icon-only Copilot, loại bỏ Idle badge, và cấu trúc flex chống overlapping.
  - Verification: `npm run test:headerbar-layout` (21/21 passed), `npm run test:i18n` (3200/3200 passed), `npm run test:usage-history-dashboard` (77/77 passed), `npm run test:ansi-tts` (21/21 passed), `npm run test:commit-assistant` (12/12 passed), `npm run test:modal-ux` (44/44 passed), `npx tsc` 0 lỗi.
- **In-flight:** Không có.
- **Next:**
  1. Tiếp tục triển khai Phase 18 hoặc các tính năng tiếp theo theo roadmap.
- **Refs:**
  - `plans/reports/fix-260903-2010-headerbar-overlapping-optimization.md`
  - `scripts/verify-headerbar-layout.mjs`
  - `src/components/HeaderBar.tsx`

## 2026-09-03 — Fix SessionStatsPanel React Rules of Hooks Violation

- **State:** Đã khắc phục triệt để lỗi vi phạm Rules of Hooks (`Rendered more hooks than during the previous render`) khi click xem context window:
  - `src/components/HeaderBar/SessionStatsPanel.tsx`: Di chuyển hook `useMemo` tính toán `groupedSparklines` từ dòng 530 (nằm sau early return `if (!isOpen) return null;`) lên dòng 457 (trước early return). Đảm bảo toàn bộ 35 hooks của component được gọi đồng nhất và theo thứ tự cố định ở 100% các lần render.
  - `scripts/verify-usage-history-dashboard.mjs`: Bổ sung kiểm tra tĩnh khẳng định không có hook nào nằm sau câu lệnh early return trong `SessionStatsPanel.tsx`.
  - Verification: `npm run test:usage-history-dashboard` (77/77 passed), `npm run test:usage-stats` (45/45 passed), `npm run test:headerbar-layout` (18/18 passed), `npm run test:i18n` (3200/3200 passed), `npm run test:settings` (48/48 passed), `npx tsc --noEmit` & `npx tsc -p tsconfig.node.json --noEmit` 0 lỗi.
- **In-flight:** Không có.
- **Next:**
  1. Tiếp tục triển khai Phase 18 hoặc các tính năng tiếp theo theo roadmap.
- **Refs:**
  - `plans/reports/fix-260903-1950-session-stats-panel-rules-of-hooks.md`
  - `src/components/HeaderBar/SessionStatsPanel.tsx`

## 2026-09-03 — Fix HeaderBar Layout Overflow Protection During Task Execution

- **State:** Đã khắc phục triệt để lỗi HeaderBar bị tràn chiều ngang làm biến mất các nút điều khiển bên phải khi task đang chạy:
  - `src/components/HeaderBar.tsx`:
    - Thêm `min-w-0 overflow-hidden` vào thẻ `<header>` chống vỡ khung chứa.
    - Bảo vệ khối Right với `shrink-0` trên container và từng button con, đảm bảo các controls (Copilot, Theme, TTS, Terminal, Ops, Git, Settings, ⌘K) luôn luôn hiển thị và không bao giờ bị flex-shrink ép dẹp hay bị đẩy ra khỏi viewport.
    - Khối Center nhận `min-w-0 flex-shrink justify-center` cùng responsive truncation cho model name và approval mode.
    - Status badge (`thinking`, `executing_tool`, `streaming`, `compacting`, `waiting_permission`), tokens/s và context meter được tối ưu responsive (thu gọn nhãn text phụ khi màn hình hẹp, hiển thị đầy đủ trên màn hình lớn), tránh phình to đột biến làm tràn thanh tiêu đề.
    - Khối Left nhận `shrink-0 min-w-0` cùng responsive truncation cho tên workspace.
  - `scripts/verify-headerbar-layout.mjs`: Test suite mới gồm 18 checks kiểm tra cơ chế chống tràn và bảo vệ các controls của HeaderBar.
  - `package.json`: Bổ sung script `"test:headerbar-layout"` và đưa vào chuỗi `"test"`.
  - Verification: `npm run test:headerbar-layout` (18/18 passed), `npm run test:i18n` (3200/3200 passed), `npm run test:ansi-tts` (21/21 passed), `npm run test:commit-assistant` (12/12 passed), `npm run test:modal-ux` (44/44 passed), cả 2 lệnh `npx tsc` 0 lỗi.
- **In-flight:** Không có.
- **Next:**
  1. Tiếp tục triển khai các phase tiếp theo trong roadmap OMP Desktop Parity (Phase 18).
- **Refs:**
  - `plans/reports/fix-260903-1930-headerbar-overflow-protection.md`
  - `scripts/verify-headerbar-layout.mjs`
  - `src/components/HeaderBar.tsx`

## 2026-09-03 — Fix SettingsModal React Rules of Hooks Violation

- **State:** Đã sửa lỗi crash `Rendered more hooks than during the previous render` trong `SettingsModal.tsx`:
  - `src/components/Modals/SettingsModal.tsx`:
    - Di chuyển hook `useState<string | null>(null)` của `loggingOutProviderId` từ dòng 747 (nằm sau early return `if (!isOpen) return null;` ở dòng 515) lên cùng nhóm khai báo state của Providers ở đầu component (trước early return).
    - Khắc phục triệt để vi phạm Rules of Hooks khiến React crash khi mở SettingsModal (`isOpen` chuyển từ `false` sang `true`).
  - Verification: Cả 2 lệnh typecheck (`npx tsc --noEmit` & `npx tsc -p tsconfig.node.json --noEmit`) và toàn bộ các test suite liên quan (`test:settings`, `test:modal-ux`, `test:auth-login`, `test:provider-config`, `test:roles-config`, `test:engine-config-ui`) pass 100%.
- **In-flight:** Không có.
- **Next:**
- **Refs:**
  - `plans/reports/fix-260903-1200-settings-modal-rules-of-hooks.md`
  - `src/components/Modals/SettingsModal.tsx`

## 2026-09-03 — Fix SSH Hosts Light Mode Inverted Text Colors

- **State:** Đã sửa lỗi hiển thị chữ trắng/mờ tịt trong Light Mode ở tab SSH Hosts (`SshTab.tsx`):
  - `src/components/Modals/ops/SshTab.tsx`:
    - Thay thế toàn bộ các class CSS không hợp lệ (`text-text`, `text-text-muted`, `bg-panel-hover`, `border-panel-border`) bằng hệ thống màu chuẩn thống nhất của dự án (`text-slate-900 dark:text-zinc-100`, `text-slate-500 dark:text-zinc-400`, `bg-surface`, `bg-surface-highlight`, `border-border`).
    - Khắc phục triệt để tình trạng chữ tiêu đề, mô tả, nút làm mới, tab filter inactive, ô tìm kiếm, empty state và form Add/Delete bị trắng xoá/mờ tịt trên nền sáng khi người dùng ở Light Mode.
  - `scripts/verify-ssh-hosts.mjs`: Thêm test assertion kiểm tra ngăn chặn tái diễn các class lỗi thời (`!text-text-muted`, `!text-text`, `dark:text-zinc-100`).
  - Verification: Cả 2 typechecks (`npx tsc --noEmit` & `npx tsc -p tsconfig.node.json --noEmit`) và `test:ssh-hosts` pass 100%.
- **In-flight:** Không có.
- **Next:**
  - Bàn giao cho người dùng.
- **Refs:**
  - `src/components/Modals/ops/SshTab.tsx`
  - `scripts/verify-ssh-hosts.mjs`

## 2026-09-03 — Move Storage GC Action Buttons to Dedicated Row

- **State:** Cải thiện UI tab Storage & GC trong OpsModal:
  - `src/components/Modals/ops/StorageTab.tsx`:
    - Tách dòng text thông báo/hướng dẫn (`ops.storage.gc.requirePreview`, `ops.storage.gc.optionsChanged`, `ops.storage.gc.previewBadge`) và 2 action buttons (`Xem trước (Dry-run)`, `Áp dụng dọn dẹp`) thành 2 hàng riêng biệt.
    - Dòng thông báo hiển thị full-width ở trên kèm `shrink-0` cho icon, không còn bị chèn ép co cụm thành nhiều dòng.
    - Hai nút thao tác nằm ở hàng dưới căn phải (`justify-end`), thoáng đãng, dễ thao tác và chuẩn UI form layout.
    - Cải tiến Image Backends Section Header với layout `flex flex-col sm:flex-row sm:items-center justify-between gap-3`, chia phần thông tin mô tả và nút bấm cân đối. Bổ sung `shrink-0 whitespace-nowrap` cho nút "Kiểm tra trạng thái" và các nút Doctor, Probe, Purge, ngăn chặn hoàn toàn hiện tượng rớt chữ "thái" xuống dòng thứ hai.
  - Verification: Cả 2 typechecks (`npx tsc --noEmit` & `npx tsc -p tsconfig.node.json --noEmit`), `test:image-backends`, `test:ops-manager`, `test:i18n` pass 100%.
- **In-flight:** Không có.
- **Next:**
  - Bàn giao cho người dùng.
- **Refs:**
  - `src/components/Modals/ops/StorageTab.tsx`

## 2026-09-03 — Fix UI Layout Overflow in OpsCenter Plugins & Tools Tab

- **State:** Đã sửa lỗi vỡ layout form cài đặt/liên kết plugin và co bẹp icon trong OpsModal tab Plugins & Tools:
  - `src/components/Modals/ops/ExtensionsTab.tsx`:
    - Tách layout form "Cài đặt plugin từ npm / registry" thành 2 hàng rõ ràng: Hàng 1 input full width `w-full min-w-0` giúp nhập tên package dài/scoped thoải mái; Hàng 2 căn lề hai bên với dropdown chọn scope bên trái và nút `+ Cài đặt` bên phải; Hàng 3 chứa 2 checkbox `--force` và `--dry-run`.
    - Khắc phục triệt để lỗi nút `+ Cài đặt` bị tràn ra ngoài card bên trái đè lên card bên phải khi modal ở kích thước `max-w-3xl` trên màn hình `lg:`.
    - Thêm `min-w-0` cho input và nút ở form "Liên kết plugin phát triển cục bộ", form thêm marketplace source.
    - Thêm `shrink-0` cho các icons (`Store`, `Download`, `Wrench`, `Package`, `Link`) và `truncate`/`min-w-0` cho card headers để tránh hiện tượng co bẹp icon.
  - `scripts/verify-extension-manager-expansion.mjs`: Bổ sung regression check đảm bảo `ExtensionsTab.tsx` luôn giữ các thuộc tính chống tràn (`w-full min-w-0` và `truncate`).
  - Verification: Cả 2 typechecks (`npx tsc --noEmit` & `npx tsc -p tsconfig.node.json --noEmit`), `test:extension-manager`, `test:extension-manager-expansion`, `test:i18n`, `test:ops-manager` pass 100%.
- **In-flight:** Không có.
- **Next:**
  - Sẵn sàng bàn giao cho người dùng.
- **Refs:**
  - `src/components/Modals/ops/ExtensionsTab.tsx`
  - `scripts/verify-extension-manager-expansion.mjs`

## 2026-09-03 — Hardening, Process Lifecycle & i18n Polish

- **State:** Củng cố độ ổn định, bảo mật và dọn dẹp i18n trên toàn bộ dự án:
  - Trích xuất `validateExternalUrl` vào `electron/external-url.ts` tái sử dụng, kiểm tra whitelist protocol và định dạng URL an toàn.
  - Validate chặt chẽ port (1-65535) và hostname cho `omp:usage-invalidate`, ngăn chặn cờ CLI độc hại trong `electron/ssh-hosts.ts` (`/^[A-Za-z0-9_][\w.-]*$/`).
  - Sửa logic kiểm tra tiến trình con còn sống trong `electron/ops-manager.ts` (`exitCode === null && signalCode === null`).
  - Xử lý debounce/dedup thông báo hủy tác vụ trong `StreamingTaskRunner`, kiểm tra `isRunning` trong `CommitAssistantManager` và kiểm tra `isCancelled` cho RPC auth login.
  - Bổ sung giới hạn dòng buffer log (`MAX_LOG_BUFFER_LINES`) và lịch sử usage (`MAX_HISTORY_ROWS`), hủy timer trace chống rò rỉ bộ nhớ.
  - Thay thế các chuỗi giao diện còn sót sang key `t()` và đồng bộ locale module-level trong `src/i18n/I18nProvider.tsx` cho các hàm gọi `tm()`.
  - Cập nhật test suites trong `scripts/verify-*.mjs`, đảm bảo 100% tests và cả 2 typechecks Node/Renderer đều pass sạch.
- **In-flight:** Không có.
- **Next:**
  - Tiếp tục phát triển các tính năng mới theo yêu cầu.
- **Refs:**
  - `electron/external-url.ts`
  - `scripts/verify-i18n.mjs`


## 2026-09-03 — Phase 19: i18n Migrate Electron & Verify

- **State:** Đã hoàn thành toàn bộ Phase 19 (i18n Migrate Electron & Verify) — phase cuối cùng của roadmap OMP Parity Gap + i18n:
  - Di chuyển toàn bộ chuỗi thông báo lỗi, notification, dialog title, UI toast và message trả về renderer trong `electron/` sang `tm()` theo locale động hiện tại:
    - `electron/main.ts`: 17 chuỗi (auth, export, reveal, image attachments, maintenance, commit, cleanse, relay dialogs/errors).
    - `electron/omp-bridge.ts`: 15 chuỗi (lifecycle, handshake timeout, protocol negotiation, auth login RPC, approval mode & profile restart errors, host uri open).
    - `electron/host-tools.ts`: 50 chuỗi (builtin tools description, parameters, return messages, host uri routing & schema errors).
    - `electron/extension-manager.ts`: 24 chuỗi (plugin install, uninstall, link, doctor, features, toggle, config, marketplace, bundled agents).
    - `electron/session-import.ts`: 29 chuỗi (scan, parse, convert, source not found error).
    - `electron/usage-stats.ts`: 22 chuỗi (JSON extraction errors, CLI usage/stats/history/clients execution errors).
    - `electron/engine-maintenance.ts`: 23 chuỗi (update check, tiny-models, maintenance task busy/running/failed messages).
    - `electron/ops-manager.ts`: 14 chuỗi (daemon control, log follow, worktrees list/clear errors).
    - `electron/auth-login.ts`: 11 chuỗi (provider fetch, auth-broker process spawn, browser open, login failure).
    - `electron/engine-config.ts`: 10 chuỗi (config list, set, reset, path fetch errors).
    - `electron/collab-share.ts`: 9 chuỗi (share session, join session, URL extraction errors).
    - `electron/image-backends.ts`: 8 chuỗi (image status, pull, purge execution errors).
    - `electron/grievances.ts`: 6 chuỗi (list, clean, push validation and execution errors).
    - `electron/commit-assistant.ts`: 5 chuỗi (workspace validation, dirty check, git commit/push task running/cancelled messages).
    - `electron/browser-relay.ts`: 3 chuỗi (relay install instructions, start daemon errors).
    - `electron/cleanse-runner.ts`: 3 chuỗi (cleanse task busy, running, error messages).
    - `electron/storage-gc.ts`: 3 chuỗi (gc run, lock conflict, parse errors).
    - `electron/tts-say.ts`: 3 chuỗi (empty text, write file, speak failed messages).
    - `electron/launch-args.ts`: 2 chuỗi (profile/tools sanitization and build args).
    - `electron/ssh-hosts.ts`: 2 chuỗi (ssh list, parse errors).
  - Quét sạch toàn bộ ký tự tiếng Việt hardcode và comment trong cả `src/` và `electron/`: kết quả 0 ký tự tiếng Việt ngoài `shared/i18n/`.
  - Nâng cấp `scripts/verify-i18n.mjs` thêm Test 7 (quét `electron/` zero Vietnamese characters) và Test 8 (dynamic locale switching trong Main Process qua `setCurrentLocale` và `tm()` đổi tức thì mà không cần restart).
  - Cập nhật tài liệu: `AGENTS.md` (hướng dẫn dùng `t()` và `tm()`, quy tắc thêm key mới), `README.md` (mục 4: tính năng đa ngôn ngữ và cách chuyển đổi trong Settings).
  - Verification: `test:i18n` (3112 passed, 0 failed), cả 2 typechecks `npx tsc --noEmit` & `npx tsc -p tsconfig.node.json --noEmit` 0 lỗi, `npm run build` thành công xuất xưởng `.app`.
- **In-flight:** Không có. Roadmap OMP Parity Gap + i18n hoàn thành 19/19 phases.
- **Next:**
  - Đánh dấu hoàn thành Phase 19 và toàn bộ roadmap trong `plans/260902-2057-omp-parity-gap-i18n/plan.md`.
  - Tạo technical journal entry `/ak:journal`.
- **Refs:**
  - `plans/260902-2057-omp-parity-gap-i18n/plan.md`
  - `plans/260902-2057-omp-parity-gap-i18n/phase-19-i18n-migrate-electron-verify.md`
  - `scripts/verify-i18n.mjs`

## 2026-09-03 — Phase 18: i18n Migrate Renderer

- **State:** Đã hoàn thành toàn bộ Phase 18 (i18n Migrate Renderer) của roadmap OMP Parity Gap:
  - Quét sạch toàn bộ chuỗi tiếng Việt hard-code và comment tiếng Việt trong toàn bộ cây thư mục `src/` (60 files bao gồm tất cả Modals, AgentPanel, Sidebar, HeaderBar, Canvas, Common, Notifications, Hooks, Utils và Mock).
  - Đồng bộ hoá từ điển `shared/i18n/vi.ts` và `shared/i18n/en.ts` với 100% key parity (2590 assertions parity pass, 0 key thừa/thiếu).
  - Toàn bộ text hiển thị, placeholder, aria-label, title tooltip, toast, mô tả lệnh `commandMenu.ts` và demo data `mock/demoData.ts` chuyển qua `t()` hoặc `tm()`.
  - Nâng cấp `scripts/verify-i18n.mjs` thêm Test 6: quét toàn bộ `src/**/*.ts` và `src/**/*.tsx`, xác nhận 0 file chứa ký tự tiếng Việt ngoài `shared/i18n`.
  - Verification: `test:i18n` (2590 passed, 0 failed), `test:renderer-chat` (18/18 passed), `test:renderer-tool-diff` (39/39 passed), `test:renderer-ui-request` (55/55 passed), `test:renderer-sessions` (51/51 passed), `test:subagent-transcript` (39/39 passed), `test:todos-panel` (63/63 passed), `test:engine-config-ui` (167/167 passed), cả 2 typechecks `npx tsc --noEmit` & `npx tsc -p tsconfig.node.json --noEmit` 0 lỗi.
- **In-flight:** Không có. Sẵn sàng cho Phase 19: i18n Migrate Electron & Verify.
- **Next:**
  1. Triển khai Phase 19: i18n Migrate Electron & Verify (`plans/260902-2057-omp-parity-gap-i18n/phase-19-i18n-migrate-electron-verify.md`).
- **Refs:**
  - `plans/260902-2057-omp-parity-gap-i18n/plan.md`
  - `plans/260902-2057-omp-parity-gap-i18n/phase-18-i18n-migrate-renderer.md`
  - `scripts/verify-i18n.mjs`

## 2026-09-03 — Phase 17: Command Output ANSI & TTS

- **State:** Đã hoàn thành toàn bộ Phase 17 (Command Output ANSI & TTS) của roadmap OMP Parity Gap:
  - `shared/text/strip-ansi.ts`: Module thuần dùng chung giữa renderer và electron, trang bị regex chuẩn loại bỏ ANSI CSI (SGR color codes, cursor moves, clear line/screen), OSC (window title, hyperlinks, ST terminator), 2-character escape sequences, đồng thời bảo toàn nguyên vẹn xuống dòng (`\n`, `\r\n`), khoảng trắng, ký tự unicode, tiếng Việt và thanh tiến trình block (`█░`).
  - `src/utils/cleanseArgs.ts`: Cập nhật tái sử dụng `stripAnsi` từ `shared/text/strip-ansi.ts` nhằm đảm bảo tính nhất quán và DRY.
  - `electron/tts-say.ts`: Lớp `SayManager` quản lý vòng đời Text-to-Speech:
    - Ghi file tạm an toàn tại `app.getPath('temp')` (với fallback `os.tmpdir()` cho test scripts).
    - Khởi chạy lệnh `omp say --file <tmp>` với các tuỳ chọn `--voice` và `--model`.
    - Bắt lỗi thiếu model TTS local (`could not synthesize with local TTS model`, `Run omp setup speech`), đánh dấu cờ `missingModel: true`.
    - Tự động huỷ tiến trình cũ khi có yêu cầu mới hoặc dừng thủ công qua `stop()`, dọn dẹp file tạm, bỏ qua sự kiện close/error từ các tiến trình cũ đã bị thay thế (superseded).
    - Tự động dọn dẹp và giải phóng tài nguyên trong `dispose()`.
  - `electron/main.ts`: Khởi tạo `sayManager`, tích hợp vào `disposeAll()`, đăng ký IPC handlers `omp:say-start` và `omp:say-stop`, emit event `omp:say-status` về renderer.
  - `electron/preload.ts`: Expose các phương thức `startSay`, `stopSay`, và `onSayStatus` trên `window.electronAPI`.
  - `electron/types.ts` & `src/types/index.ts`: Bổ sung `SayOptions`, `SayStatusEvent`, mở rộng `OmpNotification` với thuộc tính tuỳ chọn `action?: { label: string; onClick: () => void }`, cập nhật interface `ElectronAPI`.
  - `src/hooks/useOmpRpc.ts`:
    - Áp dụng `stripAnsi` cho nội dung `onOmpCommandOutput` trước khi render tin nhắn system trong `ChatMessage`.
    - Cập nhật `pushNotification` hỗ trợ đối tượng `action`.
    - Lắng nghe sự kiện `onSayStatus`, cung cấp state `isSpeaking` và các callbacks `startSay`, `stopSay`.
  - `src/components/Canvas/TerminalView.tsx`: Áp dụng `stripAnsi` khi nhận stream `onBashOutput`, khi hoàn thành lệnh, khi hiển thị khối pre output và khi copy nội dung lệnh.
  - `src/components/AgentPanel/ChatHistory.tsx`: Áp dụng `stripAnsi` trong `SystemMessageCard` cho cả chế độ thu gọn và xem đầy đủ.
  - `src/components/Notifications/ToastStack.tsx`: Hiển thị nút bấm hành động `notif.action` (ví dụ: mở Ops Center).
  - `src/components/HeaderBar.tsx`: Bổ sung nút loa (TTS) cạnh nút sao chép phản hồi cuối cùng:
    - Nhận diện trạng thái phát âm thanh (`Volume2` khi sẵn sàng, `Square` animate-pulse khi đang phát).
    - Nhấp nút sẽ gọi `getLastAssistantText()` và phát âm thanh qua `omp say`, hoặc dừng ngay lập tức nếu đang phát.
  - `src/App.tsx`: Kết nối state `isSpeaking`, `startSay`, `stopSay` với HeaderBar, xử lý thông báo khi text rỗng hoặc khi thiếu model TTS kèm nút mở trực tiếp tab Engine của `OpsModal`.
  - `src/components/Modals/OpsModal.tsx`: Hỗ trợ prop `initialTab` cho phép mở trực tiếp tab chỉ định.
  - `shared/i18n/{vi,en}.ts`: Bổ sung 8 translation keys cho `tts.*` ở cả 2 ngôn ngữ (1145 keys, parity 100%).
  - `scripts/verify-ansi-tts.mjs`: Test suite toàn diện 19/19 checks pass (stripAnsi CSI/OSC/unicode/context, SayManager lifecycle/temp-file/missing-model/stop, Preload/Main IPC contracts, Types, i18n parity, hook/component integration).
  - `package.json`: Bổ sung script `"test:ansi-tts"` và đưa vào chuỗi `"test"`.
  - Verification: `test:ansi-tts` pass 19/19, `test:terminal` pass 6/6, `test:slash-commands` pass 44/44, `test:i18n` pass 1145/1145, `test:cleanse-runner` pass 6/6, `npx tsc --noEmit` & `npx tsc -p tsconfig.node.json --noEmit` 0 lỗi.
- **In-flight:** Không có.
- **Next:**
  1. Triển khai Phase 18: Session Graph & Branch Visualizer hoặc tiếp tục theo roadmap.
- **Refs:**
  - `plans/260902-2057-omp-parity-gap-i18n/phase-17-command-output-ansi-tts.md`
  - `plans/260902-2057-omp-parity-gap-i18n/plan.md`
  - `scripts/verify-ansi-tts.mjs`

## 2026-09-03 — Phase 16: Browser Relay Service

- **State:** Đã hoàn thành toàn bộ Phase 16 (Browser Relay Service) của roadmap OMP Parity Gap:
  - `electron/browser-relay.ts`: Triển khai các hàm tiện ích và quản lý dịch vụ Browser Relay:
    - `buildBrowserRelayInstallArgs`: Tạo đối số `['browser-relay', 'install']`, hỗ trợ cờ `--dir`.
    - `buildBrowserRelayStartArgs`: Tạo đối số `['browser-relay', 'serve']`, hỗ trợ `--port`, `--token`, `--no-group`, `--verbose`.
    - `getDefaultExtensionDir`: Xác định đường dẫn thư mục extension chuẩn `~/.omp/browser-relay/extension`.
    - `parseInstallInstructions`: Bóc tách khối hướng dẫn Chrome setup từ output dòng lệnh.
    - `checkDaemonRelayStatus`: Kiểm tra daemon global `omp.browser.relay` qua `omp ps list --json --all`.
    - `RelayServer`: Quản lý tiến trình relay server do app spawn, hỗ trợ cơ chế chờ readiness line `listening on ...` trước khi báo thành công, reset trạng thái giữa các lần chạy, giới hạn buffer log tối đa 200 dòng, timeout dừng tiến trình SIGTERM/SIGKILL theo dõi qua `exitCode`.
    - `BrowserRelayManager`: Điều phối `RelayServer`, `StreamingTaskRunner` cho tác vụ cài extension (`omp:browser-relay-output`), xử lý dừng đồng bộ cả app server lẫn daemon global `omp.browser.relay` qua `opsManager`, tự động giải phóng trong `dispose()`.
  - `electron/main.ts`: Khởi tạo `browserRelayManager`, tích hợp vào `disposeAll()`, mở rộng `shell:open-external` cho giao thức `chrome:`, mở rộng `fs:reveal-in-finder` hỗ trợ mở rộng đường dẫn `~/`, truyền active profile vào `startRelay`, đăng ký các IPC handlers `omp:browser-relay-install`, `omp:browser-relay-start`, `omp:browser-relay-stop`, `omp:browser-relay-status`.
  - `electron/preload.ts`: Expose `installBrowserRelay`, `startBrowserRelay`, `stopBrowserRelay`, `getBrowserRelayStatus`, và event listener `onBrowserRelayOutput`.
  - `electron/types.ts` & `src/types/index.ts`: Bổ sung các interfaces `BrowserRelayInstallOptions`, `BrowserRelayStartOptions`, `BrowserRelayStatus`, `BrowserRelayInstallResult`, và cập nhật contract `ElectronAPI`.
  - `src/hooks/useOmpRpc.ts`: Bổ sung các callbacks `installBrowserRelay`, `startBrowserRelay`, `stopBrowserRelay`, `getBrowserRelayStatus`.
  - `src/components/Modals/ops/ProcessesTab.tsx`: Tích hợp Browser Relay Service Card trong tab Processes:
    - Trạng thái hoạt động kèm badge live (Đang chạy / Đã dừng, nguồn từ App hoặc Global Daemon, port / URL / PID).
    - Nút "Cài extension" kích hoạt task streaming hiển thị output realtime.
    - Nút "Mở thư mục" hiển thị extension trong Finder.
    - Nút "Mở chrome://extensions" sao chép đường dẫn vào clipboard và kích hoạt trình duyệt.
    - Ô nhập Port (mặc định 9224) và Token tùy chọn cho chế độ khởi động thủ công.
    - Nút chuyển đổi Khởi động thủ công / Dừng relay server.
    - Khung hướng dẫn cài đặt Chrome kèm nút sao chép đường dẫn.
  - `shared/i18n/{vi,en}.ts`: Bổ sung 24 keys i18n cho Browser Relay ở cả tiếng Việt và tiếng Anh (1129 keys, parity 100%).
  - `scripts/verify-browser-relay.mjs`: Test suite 8/8 checks pass (buildBrowserRelayInstallArgs, buildBrowserRelayStartArgs, getDefaultExtensionDir, parseInstallInstructions, RelayServer lifecycle với mock executable, BrowserRelayManager dispose, IPC contract check, i18n key existence & parity).
  - `package.json`: Bổ sung script `"test:browser-relay"` và đưa vào chuỗi `"test"`.
  - Verification: `test:browser-relay` pass 8/8, `test:i18n` pass 1129/1129, `test:preload` pass, `test:ops-manager` pass 10/10, `test:ops-manager-follow` pass 5/5, `test:cleanse-runner` pass 6/6, `npx tsc --noEmit` & `npx tsc -p tsconfig.node.json --noEmit` 0 lỗi.
- **In-flight:** Không có.
- **Next:**
  1. Triển khai Phase 17: Command Output ANSI & TTS.
- **Refs:**
  - `plans/260902-2057-omp-parity-gap-i18n/phase-16-browser-relay-service.md`
  - `plans/260902-2057-omp-parity-gap-i18n/plan.md`
  - `scripts/verify-browser-relay.mjs`

## 2026-09-03 — Phase 15: Cleanse Runner

- **State:** Đã hoàn thành toàn bộ Phase 15 (Cleanse Runner) của roadmap OMP Parity Gap:
  - `src/utils/cleanseArgs.ts`: Module thuần quản lý `buildCleanseArgs(opts)` (hỗ trợ tham số request, `-n` số agents, `-m` model, `-t` tests, `--all`, tự động bật `--all` khi request rỗng để tránh interactive TTY picker), và `stripAnsi` loại bỏ mã màu ANSI khỏi stream.
  - `electron/streaming-task-runner.ts`: Bổ sung tùy chọn `stripAnsi?: boolean` trong `StartTaskOptions` giúp tự động lọc bỏ ANSI escape codes ở cả stdout và stderr khi emit event.
  - `electron/cleanse-runner.ts`: Cung cấp `CleanseRunnerManager` sử dụng `StreamingTaskRunner('omp:cleanse-output')` với slot lock 1 tác vụ tại 1 thời điểm, hỗ trợ `runCleanse`, `cancelCleanse`, `isRunning`, `currentTaskId`, `dispose`.
  - `electron/main.ts`: Khởi tạo và quản lý vòng đời `cleanseRunnerManager`, đăng ký IPC handlers `omp:cleanse-run` (tự động fallback `cwd` về workspace của omp bridge nếu không truyền) và `omp:cleanse-cancel`.
  - `electron/preload.ts`: Expose `runCleanse`, `cancelCleanse`, `onCleanseOutput` trên `window.electronAPI`.
  - `electron/types.ts` & `src/types/index.ts`: Bổ sung interface `CleanseRunOptions` và khai báo các phương thức Cleanse Runner trên `window.electronAPI`.
  - `src/hooks/useOmpRpc.ts`: Bổ sung callbacks `runCleanse`, `cancelCleanse`.
  - `src/components/Modals/ops/EngineTab.tsx`: Tích hợp section Cleanse Runner:
    - Input `request` (tìm và sửa chẩn đoán theo từ khóa), input số subagents `-n` (1-16, mặc định 2), input `model` (`-m`), toggles `tests` (`-t`) và `all` (`--all`, bắt buộc khi request rỗng).
    - Cảnh báo xung đột khi OMP engine đang streaming hội thoại.
    - Cảnh báo Cleanse sửa trực tiếp mã nguồn trong workspace kèm nút "Tạo commit trước" (kết nối mở `CommitModal` của Phase 14).
    - Log console streaming (terminal style) tự cuộn, hiển thị trạng thái `running`/`done`/`error`, lọc ANSI, nút xoá log, và nút Huỷ tác vụ.
  - `src/components/Modals/OpsModal.tsx` & `src/App.tsx`: Truyền `onOpenCommitModal` và trạng thái `isEngineRunning={status === 'streaming'}` xuống `EngineTab`.
  - `shared/i18n/{vi,en}.ts`: Bổ sung đầy đủ 16 khóa i18n cho Cleanse Runner ở cả `vi` và `en` (1065 keys, parity 100%).
  - `scripts/verify-cleanse-runner.mjs`: Test suite 6/6 checks pass (buildCleanseArgs mọi tổ hợp cờ, stripAnsi, CleanseRunnerManager lifecycle & cancellation, IPC contracts, UI/Hook integration, i18n parity).
  - `package.json`: Thêm script `"test:cleanse-runner"` và gắn vào chuỗi `"test"`.
  - Verification: `test:cleanse-runner` pass 6/6, `test:commit-assistant` pass 12/12, `test:preload` pass, `test:engine-maintenance` pass 6/6, live probe `omp cleanse --all -n 2` sửa thành công lỗi TS trong repo thử nghiệm, `npx tsc --noEmit` & `npx tsc -p tsconfig.node.json --noEmit` 0 lỗi.
- **In-flight:** Không có.
- **Next:**
  1. Triển khai Phase 16: Browser Relay Service.
- **Refs:**
  - `plans/260902-2057-omp-parity-gap-i18n/phase-15-cleanse-runner.md`
  - `plans/260902-2057-omp-parity-gap-i18n/plan.md`
  - `scripts/verify-cleanse-runner.mjs`

## 2026-09-03 — Phase 14: Commit Assistant

- **State:** Đã hoàn thành toàn bộ Phase 14 (Commit Assistant) của roadmap OMP Parity Gap:
  - `electron/streaming-task-runner.ts`: Tách `StreamingTaskRunner` độc lập từ `EngineMaintenanceManager` hỗ trợ đa instance song song, quản lý tiến trình CLI streaming (stdout, stderr, status), hủy an toàn với SIGTERM và fallback SIGKILL, bảo vệ trạng thái tránh late events từ task cũ.
  - `electron/engine-maintenance.ts`: Refactor `EngineMaintenanceManager` tái sử dụng `StreamingTaskRunner('omp:maintenance-output')`, giữ nguyên hoàn toàn public API và IPC channels hiện có (100% pass `test:engine-maintenance`).
  - `src/utils/commitMessage.ts`: Module thuần phục vụ renderer & electron gồm `buildCommitArgs` (cấu hình cờ `--dry-run`, `--push`, `-c`, `-m`, `--no-changelog`, `--legacy`), `stripAnsi` loại bỏ ANSI escape codes, và `parseCommitMessage` trích xuất thông điệp commit từ các định dạng output khác nhau của `omp commit`.
  - `electron/commit-assistant.ts`: Cung cấp `isGitDirty` kiểm tra trạng thái git porcelain kèm giới hạn buffer và cap danh sách files an toàn, `CommitAssistantManager` điều phối runner cho cả `omp commit --dry-run` và custom `git commit -m` (kèm tự động stage nếu cần và chuỗi `git push`), hỗ trợ hủy tiến trình staging đang chờ.
  - `electron/main.ts`, `electron/preload.ts`, `electron/types.ts`, `src/types/index.ts`: Bổ sung các IPC channels `omp:commit-run`, `omp:commit-cancel`, `omp:commit-status`, event `omp:commit-output`, và các phương thức `runCommit`, `cancelCommit`, `getCommitStatus`, `onCommitOutput` trên `window.electronAPI`.
  - `src/hooks/useOmpRpc.ts`: Bổ sung callbacks `runCommitAssistant`, `cancelCommitAssistant`, `checkCommitStatus`.
  - `src/components/Modals/CommitModal.tsx`: Modal trợ lý commit hoàn chỉnh:
    - Kiểm tra nhánh Git và số tệp thay đổi, vô hiệu hóa nút khi working tree sạch hoặc không phải git repo.
    - Thêm ngữ cảnh context (`-c`), chọn model từ `availableModels` (`-m`), toggles `push`, `noChangelog`, `legacy`.
    - Nút Tạo thông điệp (dry-run) sinh message và preview có thể trực tiếp chỉnh sửa; nhận biết trạng thái đã sửa vs đề xuất từ AI.
    - Nút Commit và Commit & Push với luồng trạng thái đồng bộ, log stream thu gọn có giới hạn 500 dòng an toàn.
    - Hủy bỏ tác vụ đang chạy giữa chừng không để lại tiến trình treo.
  - `src/components/HeaderBar.tsx` & `src/App.tsx`: Thêm nút Commit (icon `GitCommit`) cạnh nút Ops, kết nối mở `CommitModal`.
  - `shared/i18n/{vi,en}.ts`: Bổ sung đồng bộ 31 khóa i18n cho Commit Assistant (1049 keys, parity 100%).
  - `scripts/verify-commit-assistant.mjs`: Test suite 12/12 checks pass (buildCommitArgs, stripAnsi, parseCommitMessage fixtures, isGitDirty, multi-instance StreamingTaskRunner, cancellation, contracts và i18n sync).
  - `package.json`: Thêm script `"test:commit-assistant"` và gắn vào chuỗi `"test"`.
  - Verification: `test:commit-assistant` (12/12 passed), `test:engine-maintenance` (6/6 passed), `test:i18n` (1049/1049 passed), live end-to-end smoke test passed, cả `npx tsc --noEmit` và `npx tsc -p tsconfig.node.json --noEmit` 0 lỗi.
- **In-flight:** Không có.
- **Next:**
  1. Triển khai Phase 15: External Agents & Skills Manager.
- **Refs:**
  - `plans/260902-2057-omp-parity-gap-i18n/phase-14-commit-assistant.md`
  - `plans/260902-2057-omp-parity-gap-i18n/plan.md`
  - `scripts/verify-commit-assistant.mjs`

## 2026-09-03 — Phase 13: Grievances

- **State:** Đã hoàn thành toàn bộ Phase 13 (Grievances - Auto-QA Tool Issues) của roadmap OMP Parity Gap:
  - `electron/grievances.ts`: Cung cấp hàm `validateCleanOptions(options)` kiểm tra chặt chẽ tính loại trừ lẫn nhau của `id`, `tool`, `all`; hàm `buildGrievancesArgs(action, opts)` hỗ trợ tham số top-level `--profile`, cờ `--limit` (giới hạn cap 200 dòng), `--tool`, `--id`, `--all`, `--json`; `parseGrievancesListJson(stdout)` phân tích output an toàn; `listGrievances`, `cleanGrievances` và `pushGrievances` gọi CLI bất đồng bộ, tự động đọc endpoint `dev.autoqaPush.endpoint` (hoặc fallback mặc định).
  - `electron/main.ts`: Đăng ký IPC handlers `omp:grievances-list`, `omp:grievances-clean`, `omp:grievances-push` giải quyết profile và workspace directory.
  - `electron/preload.ts`, `electron/types.ts`, `src/types/index.ts`: Bổ sung các phương thức `listGrievances`, `cleanGrievances`, `pushGrievances` vào `window.electronAPI` và các interface `GrievanceItem`, `GrievancesListOptions`, `GrievancesListResponse`, `GrievancesCleanOptions`, `GrievancesCleanResponse`, `GrievancesPushResponse`.
  - `src/hooks/useOmpRpc.ts`: Cung cấp các callbacks `listGrievances`, `cleanGrievances`, `pushGrievances`.
  - `src/components/Modals/ops/GrievancesTab.tsx`: Component `React.memo` tab Grievances trong OpsModal:
    - Bảng danh sách sự cố (cột ID, Tool badge, Model & Version, Report kèm tính năng xem thêm/thu gọn (expand/collapse) cho nội dung dài).
    - Bộ lọc danh sách theo tool (dropdown) và thanh tìm kiếm realtime.
    - Các tác vụ: Làm mới (Refresh spinner), Xóa 1 sự cố với modal xác nhận, Xóa theo tool với modal xác nhận, Xóa toàn bộ với modal xác nhận.
    - Nút Gửi báo cáo (Push) kèm modal xác nhận cảnh báo an toàn thông tin và hiển thị rõ ràng endpoint tiếp nhận dữ liệu.
    - Cap 200 dòng, thông báo phản hồi feedback banner và xử lý trạng thái rỗng.
  - `src/components/Modals/OpsModal.tsx` & `src/App.tsx`: Tích hợp tab `'grievances'` (icon `Wrench`), i18n label `t('ops.tab.grievances')`, kết nối các handlers.
  - `shared/i18n/{vi,en}.ts`: Thêm đầy đủ các khóa i18n cho Grievances (985 keys, parity 100%).
  - `scripts/verify-grievances.mjs`: Test suite 7/7 tests pass (validateCleanOptions, buildGrievancesArgs, parseGrievancesListJson fixture, live CLI list & clean, contract pinning, i18n sync).
  - `package.json`: Thêm script `"test:grievances"` và gắn vào chuỗi `"test"`.
  - Verification: `test:grievances` (7/7 passed), `test:i18n` (985/985 passed), `test:ssh-hosts` (9/9 passed), `test:image-backends` (15/15 passed), `test:storage-gc` (8/8 passed), `npx tsc --noEmit` và `npx tsc -p tsconfig.node.json --noEmit` 0 lỗi.
- **In-flight:** Không có.
- **Next:**
  1. Triển khai Phase 14: Commit Assistant (`plans/260902-2057-omp-parity-gap-i18n/phase-14-commit-assistant.md`).
- **Refs:**
  - `plans/260902-2057-omp-parity-gap-i18n/phase-13-grievances.md`
  - `plans/260902-2057-omp-parity-gap-i18n/plan.md`
  - `scripts/verify-grievances.mjs`

## 2026-09-03 — Phase 12: SSH Hosts

- **State:** Đã hoàn thành toàn bộ Phase 12 (SSH Hosts) của roadmap OMP Parity Gap:
  - `electron/ssh-hosts.ts`: Cung cấp hàm `validateHostName(name)` (`^[\w.-]+$`), `buildSshArgs(action, opts)` hỗ trợ tham số top-level `--profile`, cờ `--host`, `--user`, `--port`, `--key` (mở rộng `~` qua `expandHomeDir`), `--desc`, `--compat`, `--scope` và `--json`; các hàm `listSshHosts(binary, cwd, profile)`, `addSshHost(binary, cwd, input, profile)` (kiểm tra tồn tại của file key trước khi chạy, validate port 1-65535, host, scope), và `removeSshHost(binary, cwd, name, scope, profile)`.
  - `electron/main.ts`: IPC handlers `omp:ssh-list`, `omp:ssh-add`, `omp:ssh-remove` phân giải profile và thư mục workspace của bridge/settings.
  - `electron/preload.ts`, `electron/types.ts`, `src/types/index.ts`: Bổ sung methods `listSshHosts`, `addSshHost`, `removeSshHost` vào `window.electronAPI` và các interface `SshHostConfig`, `SshHostAddInput`, `SshHostsListData`, `SshHostsListResponse`, `SshHostMutationResponse`.
  - `src/hooks/useOmpRpc.ts`: Bổ sung callbacks `listSshHosts`, `addSshHost`, `removeSshHost`.
  - `src/components/Modals/ops/SshTab.tsx`: Component `React.memo` tab SSH trong OpsModal:
    - Danh sách hosts phân loại theo scope (Project vs User) với bộ lọc tab (Tất cả, Dự án, Người dùng) kèm đếm số lượng.
    - Thanh tìm kiếm realtime theo tên host, IP/domain, username, key, mô tả.
    - Thẻ Host trực quan với badge scope, target `user@host:port`, đường dẫn key, badge `Compat`, mô tả, nút sao chép lệnh SSH (`ssh [-p port] [-i key] [user@]host`) có phản hồi trực quan và nút xóa có modal xác nhận.
    - Modal Thêm Host với validation realtime, chọn tệp khóa qua file dialog `selectFile`, scope selector, lưu host có loading spinner.
    - Trạng thái rỗng (empty state) và xử lý lỗi / thông báo feedback banner.
  - `src/components/Modals/OpsModal.tsx` & `src/App.tsx`: Tích hợp tab `'ssh'` (icon `Server`), nhãn i18n `t('ops.tab.ssh')`, kết nối các callbacks SSH.
  - `shared/i18n/{vi,en}.ts`: Thêm đầy đủ 50 khóa i18n mới cho SSH Hosts (899 keys parity 100%).
  - `scripts/verify-ssh-hosts.mjs`: Test suite 9/9 tests pass (name validation, args building with flags/profile/key expansion, input validation errors, live roundtrip add/list/duplicate-error/remove với binary thật `omp` trong temp dir, contract check xuyên suốt các layer và i18n sync).
  - `package.json`: Thêm script `"test:ssh-hosts"` và gắn vào `"test"`.
  - Verification: `test:ssh-hosts` (9/9 passed), `test:image-backends` (15/15 passed), `test:storage-gc` (8/8 passed), `test:i18n` (899/899 passed), cả `npx tsc --noEmit` và `npx tsc -p tsconfig.node.json --noEmit` 0 lỗi.
- **In-flight:** Không có.
- **Next:**
  1. Triển khai Phase 13: Grievances (`plans/260902-2057-omp-parity-gap-i18n/phase-13-grievances.md`).
- **Refs:**
  - `plans/260902-2057-omp-parity-gap-i18n/phase-12-ssh-hosts.md`
  - `plans/260902-2057-omp-parity-gap-i18n/plan.md`
  - `scripts/verify-ssh-hosts.mjs`

## 2026-09-03 — Phase 11: Image Backends

- **State:** Đã hoàn thành toàn bộ Phase 11 (Image Backends) của roadmap OMP Parity Gap:
  - `electron/image-backends.ts`: Cung cấp hàm `buildImagesArgs(action, opts)` hỗ trợ tham số top-level `--profile`, cờ `--dir`, `--timeout`, `--all`, `--apply` và `runImages(binaryPath, action, opts)` sử dụng `child_process.spawn` kết hợp `extractJsonSubstring` để trích xuất ngay lập tức payload JSON hoàn chỉnh khi engine in xong và ngắt tiến trình kịp thời (tránh bị treo 20s do daemon probe upstream), đồng thời hỗ trợ hard timeout 20s an toàn.
  - `electron/main.ts`: Handler `omp:images-run` kiểm tra trạng thái engine stream/thinking (`ompBridge.isStreaming()`) để chặn lệnh `purge --apply` phá hủy khi engine đang bận; phân giải đúng profile và thư mục workspace của bridge/settings.
  - `electron/preload.ts`, `electron/types.ts`, `src/types/index.ts`: Bổ sung method `runImages` vào `window.electronAPI` và các interface `ImageBackendsAction`, `ImageBackendsOptions`, `ImageBackendsResponse`, `ImageStatusData`, `ImageDoctorData`, `ImageProbeData`, `ImagePurgeData`, `ImageRunResultData`.
  - `src/hooks/useOmpRpc.ts`: Bổ sung `runImages` callback.
  - `src/components/Modals/ops/StorageTab.tsx`: Tích hợp hoàn chỉnh Section "Ảnh & Image Backends (`omp images`)" trong tab Lưu trữ gồm 3 thẻ trạng thái (Trạng thái & 4 Backends, Provider Files phân bổ theo OpenAI/Anthropic/Google, Storage Savings), nhóm Chẩn đoán & Thăm dò (Doctor checks với severity icon, Probe với tùy chọn timeout), Dọn dẹp Cache ảnh (Purge Dry-run, Apply với modal xác nhận số lượng/dung lượng, phát hiện đổi tùy chọn sau xem trước và hiển thị danh sách lỗi cục bộ nếu có). Sử dụng ref guard ngăn chặn re-render vòng lặp khi tự động tải trạng thái.
  - `shared/i18n/{vi,en}.ts`: Thêm đầy đủ 45 khóa i18n cho Image Backends (793 keys parity 100%).
  - `scripts/verify-image-backends.mjs`: Test suite 15/15 tests pass (unit test `buildImagesArgs` bao gồm profile prefixing, mock hanging script thoát nhanh <5s, mock doctor/probe/purge dry-run & apply, error handling, contract check xuyên suốt các layer và live commands với binary thật `omp`).
  - `package.json`: Thêm script `"test:image-backends"` và gắn vào `"test"`.
  - Verification: `test:image-backends` (15/15 passed), `test:storage-gc` (8/8 passed), `test:i18n` (793/793 passed), cả `npx tsc --noEmit` và `npx tsc -p tsconfig.node.json --noEmit` 0 lỗi.
- **In-flight:** Không có.
- **Next:**
  1. Triển khai Phase 12: Worktree Management (`plans/260902-2057-omp-parity-gap-i18n/phase-12-worktree-management.md`).
- **Refs:**
  - `plans/260902-2057-omp-parity-gap-i18n/phase-11-image-backends.md`
  - `plans/260902-2057-omp-parity-gap-i18n/plan.md`
  - `scripts/verify-image-backends.mjs`

## 2026-09-03 — Phase 10: Storage GC

- **State:** Đã hoàn thành toàn bộ Phase 10 (Storage GC) của roadmap OMP Parity Gap:
  - `electron/storage-gc.ts`: Cung cấp hàm `buildGcArgs(opts)` chuẩn hóa cờ dòng lệnh CLI (`--blobs`, `--archive`, `--wal`, `--cold-archive-after-days`, `--retain-newest-global`, `--retain-newest-per-cwd`, `--agent-dir`), `runGc(binaryPath, opts)` thực thi async với timeout 60s, bắt lỗi khóa `gc.lock` và parse kết quả JSON.
  - `electron/main.ts`: Handler `omp:gc-run` kiểm tra trạng thái engine stream/thinking (`ompBridge.isStreaming()`) để chặn lệnh `apply` phá hủy khi engine đang bận; phân giải đúng profile được chọn từ settings/bridge.
  - `electron/omp-bridge.ts`: Bổ sung helper `getStatus()` và `isStreaming()`.
  - `electron/preload.ts`, `electron/types.ts`, `src/types/index.ts`: Bổ sung method `runGc` vào `window.electronAPI` và các interface `StorageGcOptions`, `StorageGcReport`, `StorageGcResponse`, `StorageGcBlobsResult`, `StorageGcArchiveResult`, `StorageGcWalResult`.
  - `src/hooks/useOmpRpc.ts`: Bổ sung `runGc` callback.
  - `src/components/Modals/ops/StorageTab.tsx`: Tab Lưu trữ mới trong OpsModal với form tùy chọn, nút "Xem trước (Dry-run)" và "Áp dụng thay đổi", modal xác nhận chi tiết số blob sẽ xóa và session sẽ archive, thẻ tóm tắt phân tách theo Blobs, Archive và WAL, huy hiệu trạng thái partial failure/warning và theo dõi spinner theo từng nút hành động.
  - `src/components/Modals/OpsModal.tsx` & `src/App.tsx`: Tích hợp tab `'storage'` (Lưu trữ) với icon `Database`, truyền trạng thái `isStreaming` để khóa hành động dọn dẹp khi engine đang hoạt động.
  - `shared/i18n/{vi,en}.ts`: Thêm đầy đủ các khóa i18n cho Storage Tab (703 keys parity 100%).
  - `scripts/verify-storage-gc.mjs`: Test suite 8/8 tests pass (unit test `buildGcArgs`, mock output fixture, lock conflict, contract pinning trên các layer, live dry-run với binary thật `omp`).
  - `package.json`: Thêm script `"test:storage-gc"` và gắn vào `"test"`.
  - Typecheck: cả `npx tsc --noEmit` và `npx tsc -p tsconfig.node.json --noEmit` 0 lỗi.
- **In-flight:** Không có.
- **Next:**
  1. Triển khai Phase 11: Image Backends (`plans/260902-2057-omp-parity-gap-i18n/phase-11-image-backends.md`).
- **Refs:**
  - `plans/260902-2057-omp-parity-gap-i18n/phase-10-storage-gc.md`
  - `plans/260902-2057-omp-parity-gap-i18n/plan.md`

## 2026-09-03 — Phase 9: Auth via RPC Login

- **State:** Đã hoàn thành toàn bộ Phase 9 của roadmap OMP Parity Gap:
  - **Live Probe Findings:**
    - `get_login_providers`: Lệnh RPC chuẩn `omp --mode rpc` trả về danh sách đầy đủ 70 providers với `{ id, name, available, authenticated }`.
    - `login`: Lệnh RPC `{ type: 'login', providerId }`. Khi chạy OAuth browser flow (e.g. Anthropic), engine phát `extension_ui_request` (`open_url`, `notify`, `input`), và client phản hồi mã ủy quyền qua `extension_ui_response`.
    - Khi gặp provider yêu cầu terminal interactive prompts (e.g. `github-copilot`), engine báo lỗi không hỗ trợ trong RPC mode -> Hybrid fallback tự động chuyển sang `AuthLoginManager` CLI spawn.
    - `logout`: RPC không có lệnh logout native -> thực hiện qua CLI `omp auth-broker logout <provider>` an toàn, không block, cập nhật trực tiếp auth store.
  - `electron/omp-rpc-types.ts`: Định nghĩa `GetLoginProvidersCommand`, `LoginCommand`, `GetLoginProvidersResponseData`, `LoginResponseData`, mở rộng `OmpCommandFrame` và `ExtensionUiRequestEvent`.
  - `electron/omp-bridge.ts`: Bổ sung `getLoginProviders()`, `startAuthLogin()`, `cancelAuthLogin()`, `submitAuthLoginInput()`, `setOpenUrlHandler()`, `setInteractiveFallback()`, `isRunning()`, xử lý `extension_ui_request` `open_url` và `input` trong login flow.
  - `electron/main.ts`: Handler `omp:login-providers` ưu tiên bridge khi `isRunning()`, fallback CLI `fetchLoginProviders` + `fetchAuthenticatedProviders` khi offline; handler `omp:auth-logout` chạy `auth-broker logout <providerId>`; handler `omp:auth-login-start/cancel/input` kết nối qua RPC với fallback CLI.
  - `electron/preload.ts`, `electron/types.ts`, `src/types/index.ts`: Bổ sung `logoutAuthProvider` vào `window.electronAPI` và mở rộng `LoginProviderItem` với `available` và `authenticated`.
  - `src/components/Modals/SettingsModal.tsx`:
    - Providers tab hiển thị badge `✓ Đã đăng nhập` dựa trên `p.authenticated || authedProviders.includes(p.id)`.
    - Thêm nút "Đăng xuất" cho provider đã xác thực có trạng thái loading spinner.
    - Thêm cảnh báo khi engine chưa chạy và vô hiệu hóa nút Đăng nhập kèm gợi ý mở workspace.
    - Tự động làm mới danh sách providers khi login/logout thành công.
  - `shared/i18n/{vi,en}.ts`: Thêm 8 cặp khóa i18n mới cho providers login/logout/offline (603 keys parity).
  - `scripts/verify-auth-rpc-live.mjs`: Test suite live kiểm tra handshake, `get_login_providers`, `login` error validation, interactive-prompt detection, optional `OMP_PROBE_PROVIDER` browser flow, CLI logout (17/17 passed; 18/18 khi set probe).
  - `scripts/verify-auth-login.mjs`: Thêm test suite cho OmpBridge Auth & Login offline/state guards (24/24 passed).
  - `package.json`: Thêm script `test:auth-rpc-live`.
  - Verification: `test:auth-rpc-live` (17/17 passed), `test:auth-login` (24/24 passed), `test:bridge` (55/55 passed), `test:i18n` (603/603 passed), cả 2 typechecks (`npx tsc --noEmit` & `npx tsc -p tsconfig.node.json --noEmit`) 0 lỗi.
- **In-flight:** Không có.
- **Next:**
  1. Triển khai Phase 10: Storage GC (`plans/260902-2057-omp-parity-gap-i18n/phase-10-storage-gc.md`).
- **Refs:**
  - `plans/260902-2057-omp-parity-gap-i18n/plan.md`
  - `plans/260902-2057-omp-parity-gap-i18n/phase-09-auth-rpc-login.md`
  - `scripts/verify-auth-rpc-live.mjs`
  - `scripts/verify-auth-login.mjs`

## 2026-09-03 — Phase 8: Usage History & Stats Dashboard

- **State:** Đã hoàn thành toàn bộ Phase 8 của roadmap OMP Parity Gap:
  - `electron/stats-dashboard.ts`: Tạo mới `StatsDashboardManager` quản lý tiến trình web server `omp stats -p <port> [--host <host>]`:
    - Kiểm tra tính khả dụng của cổng TCP trước khi spawn để tránh xung đột với tiến trình khác.
    - Giám sát ready đa tầng: phân tích output stdout/stderr tìm `Dashboard available at:` và polling endpoint HTTP GET cục bộ.
    - Dọn dẹp tiến trình an toàn với chu trình SIGTERM -> SIGKILL có timeout và gắn vào `disposeAll()` trong `electron/main.ts`.
  - `electron/usage-stats.ts`: Mở rộng parser và fetchers:
    - `fetchUsageHistory(binary, { days, provider })`: Lấy lịch sử hạn mức qua `omp usage --history --days <N> --json` kèm bộ nhớ cache in-memory TTL 60s.
    - `fetchUsageClients(binary, { days })`: Lấy tiêu thụ token theo client qua `omp usage clients --days <N> --json` kèm cache in-memory.
    - `invalidateUsage(binary, { provider })`: Xóa cache hạn mức phía engine qua `omp usage invalidate` và tự động làm rỗng cache in-memory.
    - `fetchGlobalUsage`: Bổ sung hỗ trợ các cờ `--provider <id>` và `--redact`.
  - `electron/settings-store.ts`: Bổ sung cấu hình `statsDashboardPort` (port 1024-65535, mặc định 3457), hỗ trợ sanitize khi lưu và load.
  - `electron/main.ts` & `electron/preload.ts`: Thêm các IPC handlers và bridge methods: `omp:usage-history`, `omp:usage-clients`, `omp:usage-invalidate`, `omp:stats-dashboard-start`, `omp:stats-dashboard-stop`, `omp:stats-dashboard-status`, `shell:open-external` (kiểm tra an toàn chỉ cho phép protocol `http:` và `https:`).
  - `electron/types.ts` & `src/types/index.ts`: Bổ sung đầy đủ types cho Usage History, Clients, Stats Dashboard và cập nhật `ElectronAPI`.
  - `src/hooks/useOmpRpc.ts`: Expose các wrapper methods phục vụ `SessionStatsPanel`.
  - `src/components/HeaderBar/SessionStatsPanel.tsx`: Nâng cấp giao diện:
    - Tab Usage Limits: Thêm sub-tab (Live Limits, Usage History, Client Usage), bộ lọc Provider, chọn khoảng ngày (1/7/30), toggle Redact (mặc định bật bảo vệ thông tin), nút Invalidate Cache có loading spinner.
    - Vẽ biểu đồ sparkline SVG xu hướng sử dụng theo từng nhóm `(provider, limitId)` khi có đủ dữ liệu.
    - Tab Global Stats: Bổ sung card điều khiển Dashboard (Mở dashboard, Dừng, xem trạng thái cổng) và nút "Trace phiên này" (`/trace`) tự động kích hoạt dashboard và bắt URL trace.
  - `shared/i18n/{vi,en}.ts`: Bổ sung 38 khóa i18n mới cho Usage History, Clients, Stats Dashboard và Settings (587 keys parity).
  - `scripts/verify-usage-history-dashboard.mjs`: Test suite 73 checks kiểm tra parse fixture, stub CLI, cache invalidation, dashboard lifecycle, URL security validation, IPC contracts và live CLI checks.
  - `package.json`: Thêm script `test:usage-history-dashboard` vào chuỗi `npm test`.
  - Verification: `test:usage-history-dashboard` (73/73 passed), `test:usage-stats` (45/45 passed), `test:i18n` (587/587 passed), cả 2 typechecks (`npx tsc --noEmit` & `npx tsc -p tsconfig.node.json --noEmit`) 0 lỗi.
- **In-flight:** Không có. Sẵn sàng cho Phase 9: Auth via RPC Login.
- **Next:**
  1. Triển khai Phase 9: Auth via RPC Login (`plans/260902-2057-omp-parity-gap-i18n/phase-09-auth-rpc-login.md`).
- **Refs:**
  - `plans/260902-2057-omp-parity-gap-i18n/plan.md`
  - `plans/260902-2057-omp-parity-gap-i18n/phase-08-usage-history-stats-dashboard.md`
  - `scripts/verify-usage-history-dashboard.mjs`

## 2026-09-03 — Phase 7: Update Channel & Models Refresh

- **State:** Đã hoàn thành toàn bộ Phase 7 của roadmap OMP Parity Gap:
  - `src/components/Modals/ops/EngineTab.tsx`: Tách toàn bộ tab Engine từ `OpsModal.tsx` thành component `React.memo` riêng biệt:
    - Quản lý kênh cập nhật nhị phân OMP CLI (`update.channel`: Stable / Canary), đọc qua `getEngineConfig`, hiển thị badge động và nút chuyển đổi giữa Canary/Stable có confirm dialog an toàn.
    - Tự động kiểm tra và dừng tiến trình OMP engine trước khi tiến hành cập nhật nhị phân để chống xung đột file.
    - Các tác vụ bảo trì nhanh: Cập nhật cưỡng bức (`update --force`), Cập nhật toàn bộ plugins (`update --plugins`).
    - Quản lý các thành phần mở rộng hệ thống (`setup <component>`) và tải Tiny Local Models (`tiny-models download`).
    - Khung xem live execution logs realtime, nút Huỷ tác vụ và banner thông báo khởi động lại engine.
  - `src/components/Modals/settings/ModelsCatalogSection.tsx`: Tạo mới component quản lý tra cứu catalog models (`omp models find <query> --json`) và làm mới catalog upstream (`omp models refresh`):
    - Ô tìm kiếm debounce/submit tức thời, hiển thị kết quả phân trang an toàn (cap 50), hiển thị đầy đủ thông tin model: provider, ID, selector, name, reasoning badge, context window, max tokens, và biểu phí chi phí input/output.
    - Nút sao chép selector model nhanh vào clipboard với phản hồi trực quan.
    - Nút "Làm mới Catalog" (`models refresh`), tự động kích hoạt callback `refreshModels()` để cập nhật danh mục models khả dụng ngay lập tức mà không cần restart app.
  - `src/components/Modals/SettingsModal.tsx`: Tích hợp `<ModelsCatalogSection onRefreshModels={onRefreshModels} />` vào tab Providers.
  - `src/components/Modals/OpsModal.tsx`: Tích hợp `<EngineTab onRestartEngine={onRestartEngine} />` và dọn dẹp logic inline cũ.
  - `src/App.tsx`: Truyền prop `onRefreshModels={refreshModels}` từ `useOmpRpc` vào `SettingsModal`.
  - `shared/i18n/vi.ts` & `shared/i18n/en.ts`: Bổ sung đồng bộ các khóa i18n cho EngineTab và ModelsCatalogSection (509 keys parity).
  - `scripts/verify-update-models.mjs`: Test suite 7 checks kiểm tra `parseFindModelsJson` (chuẩn hóa fields, selector fallback, banner noise, direct array, empty input), `findModels` validation, ma trận tham số tác vụ bảo trì Phase 7, Preload/Main IPC contract, và tích hợp UI/i18n.
  - `package.json`: Thêm script `test:update-models` vào chuỗi `npm test`.
  - Verification: `test:update-models` (7/7 passed), `test:engine-maintenance` (6/6 passed), `test:i18n` (509/509 passed), `test:preload` (pass), cả 2 typechecks (`npx tsc --noEmit` & `npx tsc -p tsconfig.node.json --noEmit`) 0 lỗi.
- **In-flight:** Không có. Sẵn sàng cho Phase 8: Usage History & Stats Dashboard.
- **Next:**
  1. Triển khai Phase 8: Usage History & Stats Dashboard (`plans/260902-2057-omp-parity-gap-i18n/phase-08-usage-history-stats-dashboard.md`).
- **Refs:**
  - `plans/260902-2057-omp-parity-gap-i18n/plan.md`
  - `plans/260902-2057-omp-parity-gap-i18n/phase-07-update-channel-models-refresh.md`
  - `scripts/verify-update-models.mjs`

## 2026-09-03 — Phase 6: Process Manager Expansion

- **State:** Đã hoàn thành toàn bộ Phase 6 của roadmap OMP Parity Gap:
  - `electron/ops-manager.ts`: Mở rộng `OpsManager` với phương thức `info` (`omp ps info <name> --json [--global <service>]`) trả về `OmpDaemonDetail` kèm `OmpDaemonSpec`, và class `ProcessLogFollower` quản lý tiến trình stream log daemon realtime (`omp ps logs <name> --follow [--lines] [--head] [--grep] [--global]`), hỗ trợ tự động hủy tiến trình cũ khi start tiến trình mới, idle timeout 10 phút, và phương thức `dispose()`.
  - `electron/main.ts`: Tạo hàm dọn dẹp tập trung `disposeAll()` kết hợp `authLoginManager.dispose()`, `engineMaintenanceManager.dispose()`, `opsManager.dispose()`, `ompBridge.stopProcess()`, gắn vào cả `mainWindow.on('closed')` và `app.on('before-quit')`. Bổ sung 3 IPC handlers: `omp:ps-info`, `omp:ps-logs-follow-start` (gửi log lines qua `webContents.send('omp:ps-log-line')`), `omp:ps-logs-follow-stop`.
  - `electron/preload.ts`: Expose các phương thức context bridge: `getProcessInfo`, `startProcessLogFollow`, `stopProcessLogFollow`, `onPsLogLine`.
  - `electron/types.ts` & `src/types/index.ts`: Bổ sung các kiểu `OmpDaemonSpec`, `OmpDaemonDetail`, và cập nhật `ElectronAPI`.
  - `src/components/Modals/ops/ProcessesTab.tsx`: Tách toàn bộ tab Processes từ `OpsModal.tsx` thành component `React.memo` riêng biệt:
    - Danh sách daemons phân loại theo scope (Project & Global), huy hiệu trạng thái động (`running`, `exited`, v.v.), các nút hành động (Info, Logs, Stop, Restart, Kill).
    - Drawer chi tiết Daemon hiển thị cấu hình khởi chạy (Spec: application, args, cwd, pty, ready condition, restart policy, persist, detached) và trạng thái runtime (id, createdAt, startedAt, readyAt, exitedAt, exitCode, restartCount, outputBytes).
    - Trình xem Logs realtime với indicator streaming, thanh điều khiển toolbar: toggle Follow (`--follow`), chọn số dòng (`--lines` 100/500/1000), toggle Head (`--head`), lọc regex (`--grep`), nút xóa màn hình và tự động cuộn xuống cuối, giới hạn bộ đệm an toàn 2000 dòng (`MAX_LOG_BUFFER_LINES`).
  - `src/components/Modals/OpsModal.tsx`: Tích hợp `<ProcessesTab />` và dọn dẹp logic inline cũ.
  - `shared/i18n/vi.ts` & `shared/i18n/en.ts`: Bổ sung đồng bộ 38 khóa i18n cho ProcessesTab và Process Manager Expansion.
  - `scripts/verify-ops-manager-follow.mjs`: Test suite 5 checks kiểm tra `ProcessLogFollower` stream lines, tự động ngắt follower cũ, vòng đời `OpsManager` follow, validation và kiểm tra hợp đồng IPC/Preload.
  - `scripts/verify-ops-manager.mjs`: Cập nhật thêm kiểm tra `info()`, error handling và hợp đồng IPC mới.
  - `package.json`: Thêm script `test:ops-manager-follow` vào chuỗi `npm test`.
  - Verification: `test:ops-manager` (10/10 passed), `test:ops-manager-follow` (5/5 passed), `test:i18n` (409/409 passed), `test:host-tools` (18/18 passed), `npm test` toàn bộ ~47 test suites pass 100%, cả 2 typechecks (`npx tsc --noEmit` & `npx tsc -p tsconfig.node.json --noEmit`) 0 lỗi.
- **In-flight:** Không có. Sẵn sàng cho Phase tiếp theo.
- **Next:**
- **Refs:**
  - `plans/260902-2057-omp-parity-gap-i18n/plan.md`
  - `plans/260902-2057-omp-parity-gap-i18n/phase-06-process-manager-expansion.md`
  - `scripts/verify-ops-manager-follow.mjs`

## 2026-09-03 — Phase 5: Plugin Manager Expansion

- **State:** Đã hoàn thành toàn bộ Phase 5 của roadmap OMP Parity Gap:
  - `electron/extension-manager.ts`: Mở rộng `ExtensionManager` với các phương thức: `doctor` (`--fix`, `--local`), `features` (`--local`), `toggleFeature` (`--enable`/`--disable`), `setPluginConfig` (`--set k=v`), `getPluginConfig`, `togglePlugin` (`enable`/`disable`), `upgrade` (`--dry-run`, `--local`), `discover` (parse `Available Plugins` hoặc JSON, fallback khi rỗng), `marketplace` (`list`, `add`, `remove`), cùng helper `parseJsonOrEmpty` loại bỏ ANSI codes và parse an toàn.
  - `electron/main.ts` & `electron/preload.ts`: Đăng ký và expose 9 IPC handlers mới (`omp:plugin-doctor`, `omp:plugin-features`, `omp:plugin-feature-toggle`, `omp:plugin-config-set`, `omp:plugin-config-get`, `omp:plugin-toggle`, `omp:plugin-upgrade`, `omp:plugin-discover`, `omp:plugin-marketplace`), cập nhật `omp:plugin-list`, `omp:plugin-install`, `omp:plugin-uninstall` với các cờ `local` và `dryRun`.
  - `electron/types.ts` & `src/types/index.ts`: Bổ sung `OmpPluginDoctorItem`, `OmpPluginFeatureItem`, `OmpMarketplaceItem`, `OmpDiscoverPluginItem`, cập nhật `OmpPluginInfo` và `ElectronAPI`.
  - `src/components/Modals/ops/ExtensionsTab.tsx`: Tách và mở rộng toàn bộ tab Extensions từ `OpsModal.tsx` thành component `React.memo` riêng biệt: Doctor card kèm nút Kiểm tra & Sửa lỗi tự động (`--fix`), toolbar với toggle `--local` và Upgrade All, form Cài đặt/Liên kết có checkbox `--dry-run`/`--force`, danh sách plugin có nút Bật/Tắt, Features modal, Config modal, Upgrade button, Uninstall với preview dry-run, Marketplace manager (thêm/xóa nguồn) và Discover list kèm nút Install.
  - `src/components/Modals/OpsModal.tsx`: Tích hợp gọn gàng `<ExtensionsTab onRestartEngine={onRestartEngine} setNeedRestart={setNeedRestart} />` và loại bỏ logic inline cũ.
  - `shared/i18n/vi.ts` & `shared/i18n/en.ts`: Bổ sung đồng bộ 37 khóa i18n cho ExtensionsTab và Plugin Manager Expansion.
  - `scripts/verify-extension-manager-expansion.mjs`: Test suite 7 checks kiểm tra `parseJsonOrEmpty`, validation input, live `doctor` run, text parsing discover/marketplace, IPC/Preload contract, types và UI integration.
  - `package.json`: Thêm script `test:extension-manager-expansion` vào chuỗi `npm test`.
  - Verification: `test:extension-manager` (5/5 passed), `test:extension-manager-expansion` (7/7 passed), toàn bộ test suite (`npm test`, ~46 suites) pass 100%, cả 2 typechecks (`npx tsc --noEmit` & `npx tsc -p tsconfig.node.json --noEmit`) 0 lỗi.
- **In-flight:** Không có. Sẵn sàng cho Phase tiếp theo.
- **Next:**
- **Refs:**
  - `plans/260902-2057-omp-parity-gap-i18n/plan.md`
  - `plans/260902-2057-omp-parity-gap-i18n/phase-05-plugin-manager-expansion.md`
  - `scripts/verify-extension-manager-expansion.mjs`

---
## 2026-09-03 — Phase 4: Launch Options

- **State:** Đã hoàn thành toàn bộ Phase 4 của roadmap OMP Parity Gap:
  - `electron/launch-args.ts`: Module chứa kiểu `OmpLaunchOptions`, hàm `expandHomeDir` (mở rộng `~`), `sanitizeLaunchOptions` (chuẩn hóa dữ liệu mảng chuỗi, boolean, string), và `buildLaunchArgs` (xây dựng danh sách tham số argv cho 18 cờ khởi động: `--add-dir`, `--tools`/`--no-tools`, `--no-lsp`, `--no-pty`, `--skills`/`--no-skills`, `--no-rules`, `-e`/`--hook`/`--no-extensions`, `--advisor`, `--prewalk`/`--prewalk-into`, `--plan-yolo`/`--plan-yolo-into`, `--max-time`, `--service-tier`, `--system-prompt`/`--append-system-prompt`, `--config`, `--models`, `--hide-thinking`, `--no-title`).
  - `electron/settings-store.ts`: Bổ sung trường `launchOptions` vào `AppSettings` kèm sanitization và persistence.
  - `electron/omp-bridge.ts`: Kết nối `buildLaunchArgs(settings.launchOptions)` vào `startProcess` (chèn trước `extraArgs`).
  - `electron/main.ts` & `electron/preload.ts`: Thêm IPC handler `fs:select-file` và expose qua context bridge `window.electronAPI.selectFile`.
  - `electron/types.ts` & `src/types/index.ts`: Bổ sung `OmpLaunchOptions`, cập nhật `AppSettings` và `ElectronAPI`.
  - `src/components/Modals/settings/LaunchOptionsSection.tsx`: UI section hoàn chỉnh trong tab Engine quản lý thêm/xóa thư mục bổ sung, config overlays, extensions, hooks, chip list công cụ/kỹ năng/models, nhóm toggle và text inputs, banner dirty cảnh báo cần khởi động lại engine kèm nút restart và reset.
  - `src/components/Modals/SettingsModal.tsx`: Nhúng `LaunchOptionsSection` vào tab Engine.
  - `shared/i18n/vi.ts` & `shared/i18n/en.ts`: Bổ sung đồng bộ 38 khóa i18n cho Launch Options.
  - `scripts/verify-launch-args.mjs`: Test suite 45 assertions kiểm tra `expandHomeDir`, `sanitizeLaunchOptions`, ma trận `buildLaunchArgs`, `SettingsStore` persistence và `OmpBridge` spawn args ordering.
  - `package.json`: Thêm script `test:launch-args` vào `test` chain.
  - Verification: `test:launch-args` (45/45 passed), `test:settings` (48/48 passed), `test:bridge` (55/55 passed), `test:engine-control` (49/49 passed), `test:i18n` (247/247 passed), `npm test` toàn bộ test suites (~45 suites) pass 100%, cả 2 typechecks (`npx tsc --noEmit` & `npx tsc -p tsconfig.node.json --noEmit`) 0 lỗi.
- **In-flight:** Không có. Sẵn sàng cho Phase 5: Markdown / Code Block / Thinking.
- **Next:**
  1. Triển khai Phase 5: Markdown / Code Block / Thinking (`plans/260902-2057-omp-parity-gap-i18n/phase-05-markdown-code-block-thinking.md`).
- **Refs:**
  - `plans/260902-2057-omp-parity-gap-i18n/plan.md`
  - `plans/260902-2057-omp-parity-gap-i18n/phase-04-launch-options.md`
  - `scripts/verify-launch-args.mjs`

---
## 2026-09-02 — Phase 3: Engine Config Editor UI

- **State:** Đã hoàn thành toàn bộ Phase 3 của roadmap OMP Parity Gap:
  - `src/utils/engineConfig.ts`: Module pure utils với `groupByPrefix`, `filterEntries` (tìm kiếm key/mô tả không dấu, case-insensitive), `coerceInput` (kiểm tra type boolean, number, enum, string, array, record, validate cú pháp JSON), `formatConfigValue`, danh sách 18 `PINNED_CONFIG_KEYS`, 7 `SESSION_OVERRIDE_KEYS` (kèm tooltip giải thích setting ứng dụng tương ứng), và giới hạn `MAX_RENDER_CONFIG_ROWS = 200`.
  - `src/components/Modals/settings/EngineConfigEditor.tsx`: Tab component quản lý chỉnh sửa 482 key cấu hình engine, hỗ trợ tìm kiếm nhanh, nút làm mới (forceRefresh), đường dẫn file config, nhóm "Thường dùng" (Ghim) mở sẵn, các nhóm prefix collapsible có đếm số key, badge "Phiên đang ghi đè", các loại input theo type (toggle boolean, select enum với options fallback text, number, string, textarea JSON cho array/record), lưu optimistic theo từng dòng (Enter/blur), nút reset khôi phục mặc định engine, trạng thái dirty/saving/error chi tiết, race condition guard cho async loads.
  - `src/components/Modals/SettingsModal.tsx`: Tích hợp tab `'engine-config'` vào thanh điều hướng tab cùng icon `FileCode` và nhãn i18n `t('settings.tab.engineConfig')`, kết nối các props callback `getEngineConfig`, `setEngineConfigValue`, `resetEngineConfigValue`, `getEngineConfigPath`.
  - `src/App.tsx`: Destructure các callback từ `useOmpRpc()` và truyền đầy đủ vào `<SettingsModal />`.
  - `shared/i18n/vi.ts` & `shared/i18n/en.ts`: Bổ sung đồng bộ 29 khóa i18n mới cho Engine Config Editor.
  - `scripts/verify-engine-config-ui.mjs`: Test suite 167 assertions kiểm tra pure utils, search, grouping, coercion, JSON validation, pinned keys, session overrides, static contract wiring, và i18n parity.
  - `package.json`: Thêm script `test:engine-config-ui` vào `test` chain.
  - Verification: `test:engine-config-ui` (167/167 passed), `test:engine-config` (35/35 passed), `test:i18n` (155/155 passed), `test:modal-ux` (44/44 passed), và cả 2 typechecks (`npx tsc --noEmit` & `npx tsc -p tsconfig.node.json --noEmit`) 0 lỗi.
- **In-flight:** Không có. Sẵn sàng cho Phase 4: Launch Options.
- **Next:**
  1. Triển khai Phase 4: Launch Options (`plans/260902-2057-omp-parity-gap-i18n/phase-04-launch-options.md`).
- **Refs:**
  - `plans/260902-2057-omp-parity-gap-i18n/plan.md`
  - `plans/260902-2057-omp-parity-gap-i18n/phase-03-engine-config-editor-ui.md`
  - `scripts/verify-engine-config-ui.mjs`

---
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
