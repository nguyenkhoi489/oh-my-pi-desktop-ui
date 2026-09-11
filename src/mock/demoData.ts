import type { WorkspaceFile, FileDiffItem, ChatMessage, OmpUiRequest } from '../types/index.ts';
import { tm } from '../../shared/i18n/index.ts';

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
    content: tm('mock.promptDemo'),
    timestamp: Date.now() - 1000 * 60 * 3,
  },
  {
    id: 'msg-2',
    role: 'assistant',
    content: tm('mock.replyDemo'),
    timestamp: Date.now() - 1000 * 60 * 2,
    thinking: {
      id: 'think-1',
      thought: tm('mock.thoughtDemo'),
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


export const DEMO_TOOL_APPROVAL_REQUEST: OmpUiRequest = {
  id: 'ui-demo-approval',
  method: 'select',
  title: tm('mock.bashTitle'),
  message: tm('mock.bashMessage'),
  options: ['Approve', 'Deny'],
  isToolApproval: true,
  timeout: 30000,
};

export const DEMO_GENERIC_SELECT_REQUEST: OmpUiRequest = {
  id: 'ui-demo-select',
  method: 'select',
  title: tm('mock.mergeTitle'),
  message: tm('mock.mergeMessage'),
  options: ['Create a merge commit', 'Squash and merge', 'Rebase and merge'],
  optionDetails: [
    { label: tm('mock.mergeOption1Label'), description: tm('mock.mergeOption1Desc') },
    { label: tm('mock.mergeOption2Label'), description: tm('mock.mergeOption2Desc') },
    { label: tm('mock.mergeOption3Label'), description: tm('mock.mergeOption3Desc') },
  ],
  isToolApproval: false,
};
