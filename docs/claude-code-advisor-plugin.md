# Claude Code Advisor Plugin for OMP

Plugin OMP đăng ký provider `claude-code`, bọc tiến trình `claude -p` thành HTTP endpoint OpenAI-compatible để role `advisor` của OMP có thể chạy trực tiếp qua Claude Code đã đăng nhập trên máy cá nhân, không cần cấu hình API key hay OAuth Anthropic trong OMP.

## Kiến trúc

```text
OMP Advisor Runtime
       │ (POST /v1/chat/completions, stream: true, Bearer token)
       ▼
Bun.serve HTTP Shim (127.0.0.1:47120) [trong Extension OMP]
       │
       ├─ SessionMap: hash conversation prefix, duy trì session-id / resume
       ├─ Transform messages & system prompt
       │
       ▼
Tiến trình con: `claude -p --model <model> --output-format stream-json ...`
       │ (stdout json / stream-json: structured_output { severity, note })
       ▼
HTTP Shim map kết quả:
  - severity != "none": SSE chunk / JSON `tool_calls: advise({ severity, note })`
  - severity == "none": SSE chunk / JSON `content: ""` với `finish_reason: "stop"`
  - Quota/Rate limit: HTTP 429 (OMP watchdog pause advisor)
  - Timeout: HTTP 200 severity "none" (tránh OMP halt advisor sau 3 chu kỳ)
```

## Danh mục Model hỗ trợ

Plugin ưu tiên tự động phát hiện binary Claude Code mới nhất tại `~/.local/bin/claude` (version ≥ 2.1.251) trước các phiên bản cũ hơn của Homebrew, hỗ trợ đầy đủ 4 model:
- `claude-code/fable`: **Fable 5.1** với context 1M tokens, hỗ trợ thinking effort (`low, medium, high, max`) — model mạnh nhất và được cấu hình mặc định cho `advisor`.
- `claude-code/opus`: **Opus 5** với context 1M tokens, hỗ trợ thinking effort (`low, medium, high, max`).
- `claude-code/sonnet`: **Sonnet** với context 200k tokens, cân bằng giữa tốc độ và quota.
- `claude-code/haiku`: **Haiku** với context 200k tokens, phản hồi nhanh nhất.
## Cài đặt & Kích hoạt

1. Đảm bảo Claude Code đã đăng nhập:
   ```bash
   claude --version
   ```

2. Link plugin vào OMP:
   ```bash
   omp plugin link omp-plugins/claude-code
   omp plugin doctor
   omp models claude-code
   ```

3. Cấu hình role `advisor` trong `~/.omp/agent/config.yml` hoặc Roles UI của OMP-Agent:
   ```yaml
   modelRoles:
     advisor: claude-code/fable:high
   ```

4. Kiểm tra trạng thái hoạt động:
   - Trong OMP gõ `/advisor status`: báo model `claude-code/opus`, state active.
   - Trong OMP gõ `/claude-code status`: xem port, số session đang quản lý, số lần spawn, số timeout.

## Lệnh điều khiển

- `/claude-code status`: Hiển thị chi tiết runtime (port, model, active sessions, spawn count, timeout count, last error).
- `/claude-code effort <low|medium|high|xhigh|max|off>`: Cập nhật mức suy luận mặc định lưu tại `~/.omp/agent/claude-code.json`.

## Chính sách & Giới hạn v1

- **Chính sách**: Chỉ sử dụng cho mục đích cá nhân trên máy đã đăng nhập Claude Code. Không phân phối.
- **Tools**: Advisor sử dụng các công cụ đọc (`Read`, `Grep`, `Glob`) của Claude Code trực tiếp trên workspace; các tool đọc gửi qua OMP bị bỏ qua ở v1.
- **Quota**: Hết quota Claude Code sẽ trả mã lỗi HTTP 429, OMP sẽ tạm dừng advisor tới khi người dùng gõ `/advisor` để rebuild.
- **Gỡ bỏ**: `omp plugin uninstall omp-claude-code-provider`.
