# OMP Agent — macOS Desktop IDE for oh-my-pi

[Tiếng Việt](README.md) | **English**

A dedicated, native macOS desktop IDE for **oh-my-pi (OMP)** (`can1357/oh-my-pi`) with a design language inspired by **Antigravity** & **Codex**.

---

## ✨ Key Features

* 🎨 **Antigravity & Codex Obsidian UI**: Modern dark theme with deep graphite tones, refined frosted glass borders, and glow effects during agent reasoning.
* ⚡ **Native OMP RPC Bridge**: Direct bidirectional communication with the `omp --mode rpc` background daemon over JSON-Lines stdio protocol.
* 📝 **Monaco Visual Diff Viewer**: Side-by-side and inline code diff visualization with one-click hunk acceptance (`⌘ + Enter`) or rejection.
* 🧠 **Reasoning Stepper (Thinking Process)**: Real-time visual tracking of agent reasoning, AST analysis, LSP symbol lookups, and execution planning.
* ⚙️ **Tool Execution Cards**: Interactive cards tracking tool calls in real time (`read_file`, `tree_sitter_ast_query`, `hash_anchored_patch`, `run_command`, etc.).
* 🚀 **Omnibar (`⌘ + K`)**: Floating command palette for instant navigation, quick prompts, and slash commands (`/plan`, `/diff`, `/test`).
* 🛡️ **Security & Permission Modal**: Secure approval workflows before executing potentially destructive shell commands or file operations.
* 📦 **Commit Assistant**: Canvas tab for Git inspection, intelligent conventional commit message generation, model overrides, and instant commit & push.
* 🖥️ **Ops Manager & Background Daemons**: Live inspection of running daemons (`omp ps`), real-time logs, worktrees, SSH hosts, and plugin extensions.
* 🌐 **Bilingual Interface**: Seamless runtime switching between Vietnamese (default) and English across both Renderer and Electron Main processes.

---

## 🚀 Installation & Getting Started

### 1. Prerequisites
* **macOS** (Apple Silicon arm64 or Intel x64)
* **Node.js** >= 18 and **npm** (or `bun`)
* **oh-my-pi** CLI installed:
  ```bash
  # Via Bun (Recommended)
  bun install -g @oh-my-pi/pi-coding-agent
  # Or via Homebrew
  brew install can1357/tap/omp
  # Or via curl
  curl -fsSL https://omp.sh/install | sh
  ```

### 2. Running in Development Mode

Clone the repository and start the development server:

```bash
cd OMP-Agent

# Install dependencies
npm install

# Start Vite Dev Server & Electron Mac App
npm run dev
```

### 3. Packaging macOS Installer (.dmg / .app)

```bash
npm run dist:mac                     # arm64 build signed with Developer ID + notarized + stapled
npm run dist:mac -- --universal      # Universal binary (arm64 + x64 in a single bundle)
npm run dist:mac -- --skip-notarize  # Skip notarization for local machine testing
```

Output: `release/OMP Agent-<version>-<arch>.dmg` (drag-and-drop installer into `/Applications`) and `release/mac-<arch>/OMP Agent.app`.

Signing and notarization requirements:
* Xcode Command Line Tools (`xcrun`, `stapler`, `notarytool`).
* "Developer ID Application" identity in Keychain (auto-detected by electron-builder).
* Keychain profile `ktstack-notary` configured for `notarytool` (customizable via `NOTARY_PROFILE` environment variable):
  ```bash
  xcrun notarytool store-credentials ktstack-notary --apple-id you@example.com --team-id <TEAM_ID> --password <APP_SPECIFIC_PASSWORD>
  ```

Build scripts reside in `scripts/release/`: `build-mac.sh` (typecheck → vite build → electron-builder → sign/notarize → DMG), `notarize.sh`, and `build-dmg.sh`.

### 4. Switching Languages (i18n)

The application supports English and Vietnamese out of the box.
To toggle language:
1. Open **Settings** (gear icon in the top-right header or via Omnibar `⌘ + K`).
2. Navigate to **Appearance & Language** (Giao diện & Ngôn ngữ).
3. Select **English** or **Tiếng Việt**. The change takes effect immediately across all UI surfaces and Electron main process dialogues without restarting.

---

## 📁 Project Structure

```
OMP-Agent/
├── electron/
│   ├── main.ts              # Electron Window lifecycle, traffic lights & IPC routing
│   ├── preload.ts           # Secure ContextBridge API between main and renderer
│   ├── omp-bridge.ts        # Child process manager for `omp --mode rpc`
│   ├── commit-assistant.ts  # Commit assistant manager & streaming task runner
│   ├── ops-manager.ts       # Process monitoring, worktrees & daemon control
│   ├── settings-store.ts    # Persistent settings storage
│   └── types.ts             # IPC and engine protocol definitions
├── src/
│   ├── components/
│   │   ├── HeaderBar.tsx    # Titlebar, status badges, model selector, approval toggle
│   │   ├── Sidebar/         # Project file tree, session threads, and subagents
│   │   ├── Canvas/          # Diff viewer, code editor, commit view, terminal
│   │   ├── AgentPanel/      # Reasoning cards, tool cards, chat history, composer
│   │   └── Modals/          # Omnibar ⌘K, ops modal, settings modal, permissions
│   ├── hooks/
│   │   ├── useOmpRpc.ts     # Engine state management & RPC stream hook
│   │   └── useWorkspace.ts  # Workspace file system & directory tree hook
│   ├── shared/
│   │   └── i18n/            # Synchronized vi & en dictionaries with interpolation
│   ├── styles/globals.css   # Dark theme tokens, typography, and glow styling
│   ├── App.tsx              # Main IDE container & tab manager
│   └── main.tsx
├── scripts/                 # Standalone Node.js verification test suites
├── package.json
└── vite.config.ts
```

---

## 🧪 Verification & Testing

```bash
# Typecheck renderer & Electron main process
npx tsc --noEmit
npx tsc -p tsconfig.node.json --noEmit

# Run full test suite
npm run test

# Run individual verification suites
npm run test:commit-assistant
npm run test:headerbar-layout
npm run test:i18n
```

---

## 📄 License

MIT © OMP Agent Team
