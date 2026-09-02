# OMP Agent — macOS Desktop IDE for oh-my-pi

Giao diện Desktop chuyên nghiệp dành cho **oh-my-pi (OMP)** (`can1357/oh-my-pi`) với ngôn ngữ thiết kế lấy cảm hứng từ **Antigravity** & **Codex**.

![Antigravity Dark Theme](https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/assets/banner.png)

---

## Tính năng nổi bật

* 🎨 **Antigravity & Codex Dark UI**: Tông đen than chì Obsidian, viền mờ tinh tế, hiệu ứng phát sáng mờ khi Agent suy nghĩ.
* ⚡ **Native OMP RPC Bridge**: Kết nối trực tiếp với daemon `omp --mode rpc` qua giao thức JSON-Lines hai chiều trên `stdio`.
* 📝 **Monaco Visual Diff Viewer**: So sánh thay đổi mã nguồn trước/sau dạng Side-by-Side hoặc Inline, hỗ trợ chấp nhận nhanh (`⌘ + Enter`) hoặc từ chối từng bản vá.
* 🧠 **Reasoning Stepper (Thinking Process)**: Theo dõi trực quan quá trình Agent phân tích AST, đọc symbol LSP và lên kế hoạch sửa đổi.
* ⚙️ **Tool Execution Cards**: Thẻ hiển thị trạng thái từng công cụ (`read_file`, `tree_sitter_ast_query`, `hash_anchored_patch`, `run_command`).
* 🚀 **Omnibar (`⌘ + K`)**: Thanh lệnh nổi trung tâm kiểu Raycast/Composer để ra lệnh nhanh hoặc chọn slash commands (`/plan`, `/diff`, `/test`).
* 🛡️ **Permission Modal**: Hộp thoại bảo mật xin phép người dùng trước khi thực thi các câu lệnh shell nguy hiểm.

---

## Cài đặt & Chạy ứng dụng

### 1. Yêu cầu môi trường
* **macOS** (Apple Silicon hoặc Intel)
* **Node.js** >= 18 và **npm** (hoặc `bun`)
* Đã cài đặt **oh-my-pi**:
  ```bash
  # Cài qua Bun (Khuyên dùng)
  bun install -g @oh-my-pi/pi-coding-agent
  # Hoặc qua Homebrew
  brew install can1357/tap/omp
  # Hoặc qua curl
  curl -fsSL https://omp.sh/install | sh
  ```

### 2. Khởi chạy chế độ Development

Mở terminal tại thư mục dự án `~/Data/MacAPP/OMP-Agent`:

```bash
cd ~/Data/MacAPP/OMP-Agent

# Cài đặt dependencies
npm install

# Khởi chạy Vite Dev Server & Electron Mac App
npm run dev
```

### 3. Build gói cài đặt macOS (.dmg / .app)

```bash
npm run dist:mac                     # arm64, ký Developer ID + notarize + staple
npm run dist:mac -- --universal      # arm64 + x64 trong một bundle
npm run dist:mac -- --skip-notarize  # bỏ notarize (chỉ chạy sạch trên máy build)
```

Kết quả: `release/OMP Agent-<version>-<arch>.dmg` (kéo app vào `/Applications`) và `release/mac-<arch>/OMP Agent.app`.

Yêu cầu để ký và notarize:
* Xcode Command Line Tools (`xcrun`, `stapler`, `notarytool`).
* Identity "Developer ID Application" trong Keychain; electron-builder tự chọn.
* Keychain profile `ktstack-notary` cho `notarytool` (đổi bằng biến `NOTARY_PROFILE`), tạo một lần:
  ```bash
  xcrun notarytool store-credentials ktstack-notary --apple-id you@example.com --team-id 44452PW7V3 --password APP-SPECIFIC-PW
  ```

Pipeline nằm trong `scripts/release/`: `build-mac.sh` (typecheck → vite build → electron-builder → ký/notarize → DMG), `notarize.sh`, `build-dmg.sh`.
`npm run build` chỉ tạo `.app` (ký nếu có identity, không notarize, không DMG) để thử nhanh.

---

## Cấu trúc thư mục

```
~/Data/MacAPP/OMP-Agent/
├── electron/
│   ├── main.ts              # macOS Window lifecycle, traffic lights & IPC
│   ├── preload.ts           # ContextBridge an toàn giữa main và renderer
│   ├── omp-bridge.ts        # Quản lý child process `omp --mode rpc`
│   └── types.ts             # RPC event types & definitions
├── src/
│   ├── components/
│   │   ├── HeaderBar.tsx    # macOS Titlebar, Status Pill, Model Picker, ⌘K
│   │   ├── Sidebar/         # Cây thư mục dự án & Sessions
│   │   ├── Canvas/          # Diff Viewer, Code Editor, Artifacts, Terminal
│   │   ├── AgentPanel/      # Thinking Card, Tool Cards, Chat History, Composer
│   │   └── Modals/          # Omnibar ⌘K & Permission Dialog
│   ├── hooks/
│   │   ├── useOmpRpc.ts     # Hook điều phối stream sự kiện OMP RPC
│   │   └── useWorkspace.ts  # Hook quản lý filesystem & folder
│   ├── mock/demoData.ts     # Dữ liệu demo mẫu trực quan
│   ├── styles/globals.css   # Deep Dark Theme & Glow styling
│   ├── App.tsx              # Main Layout
│   └── main.tsx
├── package.json
└── vite.config.ts
```
