import { WorkspaceFile, FileDiffItem, ChatMessage, ArtifactDocument } from '../types';

export const DEMO_WORKSPACE_FILES: WorkspaceFile[] = [
  {
    name: 'src',
    path: '/project/src',
    relativePath: 'src',
    isDirectory: true,
    children: [
      {
        name: 'auth',
        path: '/project/src/auth',
        relativePath: 'src/auth',
        isDirectory: true,
        children: [
          {
            name: 'service.ts',
            path: '/project/src/auth/service.ts',
            relativePath: 'src/auth/service.ts',
            isDirectory: false,
            gitStatus: 'modified',
          },
          {
            name: 'jwt.ts',
            path: '/project/src/auth/jwt.ts',
            relativePath: 'src/auth/jwt.ts',
            isDirectory: false,
          },
        ],
      },
      {
        name: 'index.ts',
        path: '/project/src/index.ts',
        relativePath: 'src/index.ts',
        isDirectory: false,
      },
      {
        name: 'config.ts',
        path: '/project/src/config.ts',
        relativePath: 'src/config.ts',
        isDirectory: false,
      },
    ],
  },
  {
    name: 'tests',
    path: '/project/tests',
    relativePath: 'tests',
    isDirectory: true,
    children: [
      {
        name: 'auth.test.ts',
        path: '/project/tests/auth.test.ts',
        relativePath: 'tests/auth.test.ts',
        isDirectory: false,
      },
    ],
  },
  {
    name: 'package.json',
    path: '/project/package.json',
    relativePath: 'package.json',
    isDirectory: false,
  },
  {
    name: 'tsconfig.json',
    path: '/project/tsconfig.json',
    relativePath: 'tsconfig.json',
    isDirectory: false,
  },
];

export const DEMO_INITIAL_DIFF: FileDiffItem = {
  id: 'diff-demo-1',
  filePath: '/project/src/auth/service.ts',
  relativePath: 'src/auth/service.ts',
  originalContent: `import jwt from 'jsonwebtoken';

export class AuthService {
  private secret: string;

  constructor() {
    this.secret = process.env.JWT_SECRET || 'default_secret';
  }

  async validateUser(token: string) {
    // TODO: implement validation
    return null;
  }

  async revokeSession(userId: string) {
    console.log('Revoking session for', userId);
  }
}
`,
  modifiedContent: `import jwt from 'jsonwebtoken';

export class AuthService {
  private secret: string;
  private readonly tokenExpirySeconds = 3600;

  constructor() {
    this.secret = process.env.JWT_SECRET || 'default_secret';
  }

  /**
   * Validates JWT token with signature verification and expiry check
   * Powered by OMP AST parser & LSP symbol analysis
   */
  async validateUser(token: string) {
    if (!token) {
      throw new Error('Authentication token is required');
    }
    
    try {
      const payload = jwt.verify(token, this.secret) as { id: string; role: string; exp: number };
      return {
        isValid: true,
        user: { id: payload.id, role: payload.role }
      };
    } catch (err: any) {
      return { isValid: false, error: err.message };
    }
  }

  async revokeSession(userId: string) {
    console.log('Revoking session for', userId);
    // Invalidate Redis token cache
    await redisClient.del(\`session:\${userId}\`);
  }
}
`,
  status: 'pending',
  additions: 21,
  deletions: 3,
};

export const DEMO_MESSAGES: ChatMessage[] = [
  {
    id: 'msg-1',
    role: 'user',
    content: 'Hãy hoàn thiện hàm `validateUser` trong file `src/auth/service.ts` với JWT verification và xử lý ngoại lệ an toàn.',
    timestamp: Date.now() - 1000 * 60 * 3,
  },
  {
    id: 'msg-2',
    role: 'assistant',
    content: 'Tôi đã phân tích AST của file `src/auth/service.ts` bằng Tree-sitter và bổ sung logic xác thực JWT an toàn kèm kiểm tra payload expiration.\n\nBạn có thể kiểm tra **Visual Diff** tại khung Canvas bên trái và nhấn **Accept Changes** (⌘↵) để ghi đè code.',
    timestamp: Date.now() - 1000 * 60 * 2,
    thinking: {
      id: 'think-1',
      thought: '1. Khởi động AST query cho file `src/auth/service.ts`.\n2. Phát hiện method `validateUser` chưa có implementation.\n3. Đọc type definition của `jsonwebtoken` qua LSP.\n4. Tạo patch code hash-anchored không làm vỡ các method khác.',
      timestamp: Date.now() - 1000 * 60 * 2.5,
      completed: true,
    },
    toolCalls: [
      {
        id: 'tc-1',
        name: 'tree_sitter_ast_query',
        params: { file: 'src/auth/service.ts', nodeType: 'method_definition' },
        status: 'completed',
        result: { matched: ['validateUser', 'revokeSession'] },
        startTime: Date.now() - 1000 * 60 * 2.4,
        endTime: Date.now() - 1000 * 60 * 2.3,
      },
      {
        id: 'tc-2',
        name: 'hash_anchored_patch',
        params: { file: 'src/auth/service.ts', additions: 21, deletions: 3 },
        status: 'completed',
        result: { status: 'success', patchHash: 'a9f02e4d' },
        startTime: Date.now() - 1000 * 60 * 2.2,
        endTime: Date.now() - 1000 * 60 * 2.1,
      },
    ],
  },
];

export const DEMO_ARTIFACTS: ArtifactDocument[] = [
  {
    id: 'art-html-1',
    title: 'AuthDashboard_Widget.html',
    type: 'html',
    description: 'Interactive UI Component generated by OMP Agent',
    language: 'html',
    content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    body { font-family: 'Inter', sans-serif; }
    .fade-in { animation: fadeIn 0.3s ease-in-out; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
  </style>
</head>
<body class="bg-slate-50 p-6 text-slate-800 antialiased flex flex-col items-center justify-center min-h-screen">
  <div class="w-full max-w-lg bg-white rounded-2xl border border-slate-200/80 shadow-xl overflow-hidden fade-in">
    <!-- Header -->
    <div class="bg-gradient-to-r from-purple-600 to-indigo-600 p-6 text-white">
      <div class="flex items-center justify-between">
        <div>
          <span class="text-xs uppercase tracking-wider font-semibold bg-white/20 px-2 py-0.5 rounded-full text-purple-100">Live Component</span>
          <h2 class="text-xl font-bold mt-1">OMP Agent Auth Panel</h2>
          <p class="text-xs text-purple-100 mt-0.5">Real-time session monitoring & JWT diagnostics</p>
        </div>
        <div class="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-xl backdrop-blur-sm">
          ⚡
        </div>
      </div>
    </div>

    <!-- Stats Grid -->
    <div class="grid grid-cols-3 gap-3 p-5 border-b border-slate-100 bg-slate-50/50">
      <div class="p-3 bg-white rounded-xl border border-slate-200/60 shadow-xs">
        <div class="text-[11px] text-slate-500 font-medium">Active Users</div>
        <div class="text-lg font-bold text-slate-900 mt-0.5" id="userCount">1,428</div>
        <div class="text-[10px] text-emerald-600 font-semibold mt-0.5">↑ +12% today</div>
      </div>
      <div class="p-3 bg-white rounded-xl border border-slate-200/60 shadow-xs">
        <div class="text-[11px] text-slate-500 font-medium">Token Expiry</div>
        <div class="text-lg font-bold text-purple-600 mt-0.5">3,600s</div>
        <div class="text-[10px] text-slate-400 mt-0.5">Standard TTL</div>
      </div>
      <div class="p-3 bg-white rounded-xl border border-slate-200/60 shadow-xs">
        <div class="text-[11px] text-slate-500 font-medium">LSP Health</div>
        <div class="text-lg font-bold text-emerald-600 mt-0.5">100%</div>
        <div class="text-[10px] text-emerald-600 font-semibold mt-0.5">0 AST errors</div>
      </div>
    </div>

    <!-- Interactive Section -->
    <div class="p-5 space-y-4">
      <div>
        <label class="block text-xs font-semibold text-slate-700 mb-1">Test JWT Token Verification</label>
        <div class="flex gap-2">
          <input type="text" id="tokenInput" value="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." class="flex-1 px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 font-mono text-slate-600 bg-slate-50">
          <button onclick="testToken()" class="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-all active:scale-95">
            Verify
          </button>
        </div>
      </div>

      <div id="resultBox" class="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span class="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
          <span class="font-medium">Status: Signature valid (HMAC-SHA256)</span>
        </div>
        <span class="text-[10px] font-mono bg-emerald-100 px-1.5 py-0.5 rounded text-emerald-700">OK</span>
      </div>

      <div class="flex justify-between items-center pt-2">
        <button onclick="triggerPing()" class="text-xs text-purple-600 hover:text-purple-700 font-medium flex items-center gap-1">
          🔄 Refresh Session Pool
        </button>
        <span class="text-[11px] text-slate-400">Generated by oh-my-pi</span>
      </div>
    </div>
  </div>

  <script>
    function testToken() {
      const box = document.getElementById('resultBox');
      box.className = 'p-3 bg-purple-50 border border-purple-200 rounded-xl text-xs text-purple-800 flex items-center justify-between fade-in';
      box.innerHTML = '<span>Checking token via OMP AST validator...</span><span class="animate-spin">⚙️</span>';
      setTimeout(() => {
        box.className = 'p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center justify-between fade-in';
        box.innerHTML = '<div class="flex items-center gap-2"><span class="w-2 h-2 rounded-full bg-emerald-500"></span><span class="font-medium">Token Verified: User ID #9482 (Admin)</span></div><span class="text-[10px] font-mono bg-emerald-100 px-1.5 py-0.5 rounded text-emerald-700">200 OK</span>';
      }, 500);
    }

    function triggerPing() {
      const count = document.getElementById('userCount');
      const val = parseInt(count.innerText.replace(',', '')) + Math.floor(Math.random() * 5) + 1;
      count.innerText = val.toLocaleString();
    }
  </script>
</body>
</html>`
  },
  {
    id: 'art-md-1',
    title: 'Architecture_Plan.md',
    type: 'plan',
    description: 'System design and OMP RPC Protocol integration document',
    language: 'markdown',
    content: `# OMP Agent Architecture Overview

This project uses **oh-my-pi** (OMP) as a headless RPC engine wired directly into this native macOS UI.

## Core Architectural Pillars
- **Tree-sitter AST Patching**: Code changes are syntactically validated before generation.
- **LSP Integration**: Real-time symbol diagnostics and error detection.
- **Visual Diff Review**: Instant Side-by-Side acceptance flow with \`⌘ + Enter\`.
- **Live Artifacts Rendering**: Dynamic HTML/Web interactive previews in a sandboxed runtime.
`
  },
  {
    id: 'art-svg-1',
    title: 'OMP_DataFlow.svg',
    type: 'svg',
    description: 'Vector diagram showing bidirectional JSON-RPC flow',
    language: 'svg',
    content: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 700 240" width="100%" height="100%">
  <defs>
    <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#9333ea;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#4f46e5;stop-opacity:1" />
    </linearGradient>
    <linearGradient id="grad2" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#059669;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#0284c7;stop-opacity:1" />
    </linearGradient>
    <filter id="shadow" x="-5%" y="-5%" width="110%" height="115%">
      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#000" flood-opacity="0.08" />
    </filter>
  </defs>

  <!-- Background Canvas -->
  <rect width="100%" height="100%" fill="#f8fafc" rx="16" />

  <!-- Node 1: macOS UI -->
  <g filter="url(#shadow)">
    <rect x="30" y="50" width="180" height="140" rx="12" fill="#ffffff" stroke="#e2e8f0" stroke-width="2" />
    <rect x="30" y="50" width="180" height="36" rx="12" fill="url(#grad1)" />
    <text x="120" y="73" fill="#ffffff" font-family="-apple-system, sans-serif" font-size="13" font-weight="bold" text-anchor="middle">macOS UI Layer</text>
    <text x="120" y="115" fill="#334155" font-family="-apple-system, sans-serif" font-size="11" text-anchor="middle">• Monaco Diff View</text>
    <text x="120" y="138" fill="#334155" font-family="-apple-system, sans-serif" font-size="11" text-anchor="middle">• Live Web Preview</text>
    <text x="120" y="161" fill="#334155" font-family="-apple-system, sans-serif" font-size="11" text-anchor="middle">• Chat & Omnibar ⌘K</text>
  </g>

  <!-- Arrow 1 (Bridge) -->
  <path d="M 220 100 L 260 100" stroke="#9333ea" stroke-width="3" stroke-dasharray="4" marker-end="url(#arrow)" />
  <path d="M 260 140 L 220 140" stroke="#059669" stroke-width="3" stroke-dasharray="4" />
  <text x="240" y="90" fill="#7e22ce" font-family="monospace" font-size="9" font-weight="bold" text-anchor="middle">STDIN</text>
  <text x="240" y="158" fill="#047857" font-family="monospace" font-size="9" font-weight="bold" text-anchor="middle">STDOUT</text>

  <!-- Node 2: Electron IPC Bridge -->
  <g filter="url(#shadow)">
    <rect x="270" y="50" width="160" height="140" rx="12" fill="#ffffff" stroke="#e2e8f0" stroke-width="2" />
    <rect x="270" y="50" width="160" height="36" rx="12" fill="#334155" />
    <text x="350" y="73" fill="#ffffff" font-family="-apple-system, sans-serif" font-size="13" font-weight="bold" text-anchor="middle">IPC Bridge</text>
    <text x="350" y="115" fill="#334155" font-family="-apple-system, sans-serif" font-size="11" text-anchor="middle">• JSON-Lines Stream</text>
    <text x="350" y="138" fill="#334155" font-family="-apple-system, sans-serif" font-size="11" text-anchor="middle">• Process Manager</text>
    <text x="350" y="161" fill="#334155" font-family="-apple-system, sans-serif" font-size="11" text-anchor="middle">• Permission Guard</text>
  </g>

  <!-- Arrow 2 -->
  <path d="M 440 100 L 480 100" stroke="#9333ea" stroke-width="3" />
  <path d="M 480 140 L 440 140" stroke="#059669" stroke-width="3" />

  <!-- Node 3: oh-my-pi Core -->
  <g filter="url(#shadow)">
    <rect x="490" y="50" width="180" height="140" rx="12" fill="#ffffff" stroke="#e2e8f0" stroke-width="2" />
    <rect x="490" y="50" width="180" height="36" rx="12" fill="url(#grad2)" />
    <text x="580" y="73" fill="#ffffff" font-family="-apple-system, sans-serif" font-size="13" font-weight="bold" text-anchor="middle">oh-my-pi Core</text>
    <text x="580" y="115" fill="#334155" font-family="-apple-system, sans-serif" font-size="11" text-anchor="middle">• Tree-sitter AST</text>
    <text x="580" y="138" fill="#334155" font-family="-apple-system, sans-serif" font-size="11" text-anchor="middle">• LSP Diagnostics</text>
    <text x="580" y="161" fill="#334155" font-family="-apple-system, sans-serif" font-size="11" text-anchor="middle">• Hash Patching</text>
  </g>
</svg>`
  }
];

export const DEMO_ARTIFACT: ArtifactDocument = DEMO_ARTIFACTS[0];
