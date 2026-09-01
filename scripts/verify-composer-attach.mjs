/**
 * Verification Suite: Composer File Attach & fileMention Frame Translation (Phase 5)
 *
 * Requirements:
 * 1. buildMessageWithFileMentions:
 *    - Text without attachments -> untouched.
 *    - Text with attachments not in text -> appends `@<relative-path>` tokens.
 *    - Text with `@<relative-path>` already present in text -> preserves position, no duplicate append.
 *    - Deduplicates file attachments.
 *    - Handles mixed mentions (some inline, some in attachedFiles array).
 *    - Handles empty text with attachments.
 * 2. flattenWorkspaceFiles:
 *    - Recursively traverses tree and returns only non-directory files.
 * 3. OmpBridge fileMention Inbound Frame Translation (stream events):
 *    - Direct frame `{ role: 'fileMention', files: [...] }` (probe payload).
 *    - Typed frame `{ type: 'fileMention', files: [...] }`.
 *    - message_end frame `{ type: 'message_end', message: { role: 'fileMention', files: [...] } }`.
 *    - Computes lineCount when content is given without lineCount.
 * 4. OmpBridge translateHistoryMessages:
 *    - Translates raw fileMention message from session history into ChatMessage attachment shape.
 *    - Preserves order and structure alongside user, assistant, and toolResult messages.
 */

import { OmpBridge } from '../electron/omp-bridge.ts';
import {
  buildMessageWithFileMentions,
  flattenWorkspaceFiles,
} from '../src/utils/fileMention.ts';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`  ❌ FAILED: ${message}`);
    failed++;
    throw new Error(message);
  } else {
    console.log(`  ✓ PASSED: ${message}`);
    passed++;
  }
}

console.log('=== Starting Composer File Attach Verification Suite (Phase 5) ===\n');

// ----------------------------------------------------
// Test 1: buildMessageWithFileMentions logic
// ----------------------------------------------------
console.log('[Test 1] buildMessageWithFileMentions message token formatting');
{
  // 1.1 Text without attach -> untouched
  const res1 = buildMessageWithFileMentions('Hello world', []);
  assert(res1 === 'Hello world', 'Text without attachments is untouched');

  // 1.2 Text with attachments -> append token with @
  const res2 = buildMessageWithFileMentions('Analyze this module', ['src/auth/service.ts']);
  assert(
    res2 === 'Analyze this module @src/auth/service.ts',
    'Unmentioned file attachment is appended with @ prefix'
  );

  // 1.3 Text with @path already typed inline -> keeps inline, does not duplicate at end
  const res3 = buildMessageWithFileMentions('Please refactor @src/auth/service.ts carefully', [
    'src/auth/service.ts',
  ]);
  assert(
    res3 === 'Please refactor @src/auth/service.ts carefully',
    'Inline @token is not duplicated at the end of prompt'
  );

  // 1.4 Deduplicate duplicate attachments in list
  const res4 = buildMessageWithFileMentions('Check code', [
    'src/index.ts',
    'src/index.ts',
    'src/utils.ts',
    'src/utils.ts',
  ]);
  assert(
    res4 === 'Check code @src/index.ts @src/utils.ts',
    'Duplicate attachments in array are deduplicated'
  );

  // 1.5 Mixed mentions: one in text, one attached via picker
  const res5 = buildMessageWithFileMentions('Compare @src/old.ts with new version', [
    'src/old.ts',
    'src/new.ts',
  ]);
  assert(
    res5 === 'Compare @src/old.ts with new version @src/new.ts',
    'Mixed inline and attached files appends only unmentioned files'
  );

  // 1.6 Empty prompt with attachments
  const res6 = buildMessageWithFileMentions('', ['src/main.ts', 'src/types.ts']);
  assert(
    res6 === '@src/main.ts @src/types.ts',
    'Empty prompt with attachments produces space-separated @tokens'
  );
}

// ----------------------------------------------------
// Test 2: flattenWorkspaceFiles tree traversal
// ----------------------------------------------------
console.log('\n[Test 2] flattenWorkspaceFiles tree flattening');
{
  const mockTree = [
    {
      name: 'src',
      path: '/proj/src',
      relativePath: 'src',
      isDirectory: true,
      children: [
        {
          name: 'auth',
          path: '/proj/src/auth',
          relativePath: 'src/auth',
          isDirectory: true,
          children: [
            {
              name: 'service.ts',
              path: '/proj/src/auth/service.ts',
              relativePath: 'src/auth/service.ts',
              isDirectory: false,
            },
          ],
        },
        {
          name: 'index.ts',
          path: '/proj/src/index.ts',
          relativePath: 'src/index.ts',
          isDirectory: false,
        },
      ],
    },
    {
      name: 'package.json',
      path: '/proj/package.json',
      relativePath: 'package.json',
      isDirectory: false,
    },
  ];

  const flattened = flattenWorkspaceFiles(mockTree);
  assert(flattened.length === 3, 'Flattened array has exactly 3 non-directory files');
  assert(
    flattened.map((f) => f.relativePath).join(',') ===
      'src/auth/service.ts,src/index.ts,package.json',
    'All file relative paths preserved correctly in flattened hierarchy'
  );
}

// ----------------------------------------------------
// Test 3: OmpBridge fileMention Inbound Frame Translation
// ----------------------------------------------------
console.log('\n[Test 3] OmpBridge fileMention inbound frame handling');
{
  const receivedMessages = [];
  const mockWindow = {
    isDestroyed: () => false,
    webContents: {
      send: (channel, data) => {
        if (channel === 'omp:message-complete') {
          receivedMessages.push(data);
        }
      },
    },
  };

  const bridge = new OmpBridge(mockWindow);

  // 3.1 Live probe frame payload `{ role: "fileMention", files: [...] }`
  const probeFrame = {
    role: 'fileMention',
    files: [
      {
        path: 'src/auth/service.ts',
        content: '[src/auth/service.ts#F7CE]\n1:export const auth = true;',
        lineCount: 42,
      },
    ],
    timestamp: 1700000000000,
  };

  bridge.dispatchInboundFrame(probeFrame);
  assert(receivedMessages.length === 1, 'Inbound role:fileMention dispatches message-complete');
  const msg1 = receivedMessages[0];
  assert(msg1.role === 'fileMention', 'Dispatched message has role: fileMention');
  assert(msg1.files.length === 1, 'Dispatched message has 1 file attachment');
  assert(msg1.files[0].path === 'src/auth/service.ts', 'File path matches frame payload');
  assert(msg1.files[0].name === 'service.ts', 'File name extracted correctly');
  assert(msg1.files[0].lineCount === 42, 'Line count matches frame payload');

  // 3.2 Direct frame with `{ type: "fileMention", files: [...] }`
  const typedFrame = {
    type: 'fileMention',
    files: [
      {
        path: 'src/index.ts',
        name: 'index.ts',
        lineCount: 15,
      },
    ],
    timestamp: 1700000001000,
  };
  bridge.dispatchInboundFrame(typedFrame);
  assert(receivedMessages.length === 2, 'Inbound type:fileMention dispatches message-complete');
  const msg2 = receivedMessages[1];
  assert(msg2.role === 'fileMention', 'Dispatched message has role: fileMention');
  assert(msg2.files[0].path === 'src/index.ts', 'File path matches typed frame payload');

  // 3.3 message_end frame carrying message: { role: 'fileMention', files: [...] }
  const messageEndFrame = {
    type: 'message_end',
    message: {
      role: 'fileMention',
      files: [
        {
          path: 'src/config.json',
          content: '{\n  "version": 1,\n  "enabled": true\n}',
        },
      ],
      completedAt: 1700000002000,
    },
  };
  bridge.dispatchInboundFrame(messageEndFrame);
  assert(receivedMessages.length === 3, 'Inbound message_end with fileMention dispatches message-complete');
  const msg3 = receivedMessages[2];
  assert(msg3.role === 'fileMention', 'Message end translates to role: fileMention');
  assert(msg3.files[0].path === 'src/config.json', 'File path matches message_end payload');
  assert(msg3.files[0].lineCount === 4, 'Line count automatically calculated from content lines when omitted');
}

// ----------------------------------------------------
// Test 4: OmpBridge translateHistoryMessages with fileMention
// ----------------------------------------------------
console.log('\n[Test 4] OmpBridge translateHistoryMessages with fileMention history');
{
  const mockWindow = {
    isDestroyed: () => false,
    webContents: { send: () => {} },
  };
  const bridge = new OmpBridge(mockWindow);

  const rawHistory = [
    {
      role: 'user',
      content: [{ type: 'text', text: 'Explain this service @src/auth/service.ts' }],
      timestamp: 1700000010000,
    },
    {
      role: 'fileMention',
      files: [
        {
          path: 'src/auth/service.ts',
          content: 'export class AuthService {}',
          lineCount: 25,
        },
      ],
      timestamp: 1700000010500,
    },
    {
      role: 'assistant',
      content: [{ type: 'text', text: 'This service handles user auth tokens.' }],
      completedAt: 1700000012000,
    },
  ];

  const translated = bridge.translateHistoryMessages(rawHistory);
  assert(translated.length === 3, 'Translated history contains all 3 messages');
  assert(translated[0].role === 'user', 'First message is user');
  assert(
    translated[0].content === 'Explain this service @src/auth/service.ts',
    'User message content preserved'
  );

  assert(translated[1].role === 'fileMention', 'Second message is fileMention');
  assert(translated[1].files.length === 1, 'fileMention message has 1 file attachment');
  assert(translated[1].files[0].path === 'src/auth/service.ts', 'File path matches history');
  assert(translated[1].files[0].name === 'service.ts', 'File name parsed');
  assert(translated[1].files[0].lineCount === 25, 'Line count matches history');

  assert(translated[2].role === 'assistant', 'Third message is assistant');
  assert(
    translated[2].content === 'This service handles user auth tokens.',
    'Assistant message content preserved'
  );
}

console.log(`\n🎉 All ${passed} Composer File Attach tests passed successfully!`);
