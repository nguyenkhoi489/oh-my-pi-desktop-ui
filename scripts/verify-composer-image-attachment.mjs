/**
 * Verification Suite: Composer Image Drag & Drop, Clipboard Paste and Attachments (Phase 4)
 *
 * Requirements:
 * 1. isImageFile:
 *    - Recognizes all supported image extensions (png, jpg, jpeg, gif, webp, svg, bmp, ico, avif).
 *    - Handles case insensitivity, paths with directories, URLs with query/hash.
 *    - Rejects non-image files (ts, js, css, md, json, pdf, zip, etc.) and empty/invalid values.
 * 2. getImageExtension:
 *    - Maps standard and parameterized image MIME types to clean extensions.
 *    - Prioritizes valid file name extension if provided.
 *    - Falls back to 'png' for unknown image formats.
 * 3. buildMessageWithFileMentions:
 *    - Appends image attachment tokens with @ prefix.
 *    - Preserves inline @image tokens without duplicate appending.
 *    - Handles mixed code and image attachments correctly.
 * 4. extractImageFromClipboard & extractFilesFromDrop:
 *    - Extracts image buffer, extension, and blob from mock clipboard DataTransfer.
 *    - Categorizes dropped files into code vs image attachments.
 * 5. IPC fs:save-image-attachment simulation:
 *    - Asynchronously creates .omp/attachments directory.
 *    - Writes binary buffer and returns valid filePath and relativePath.
 * 6. computeRelativePath & formatImageDimensions:
 *    - Computes clean relative paths within workspace.
 *    - Formats dimension strings for UI tooltips.
 */

import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import {
  isImageFile,
  getImageExtension,
  extractImageFromClipboard,
  extractFilesFromDrop,
  computeRelativePath,
  formatImageDimensions,
  IMAGE_EXTENSIONS,
} from '../src/utils/imageAttachment.ts';
import { buildMessageWithFileMentions } from '../src/utils/fileMention.ts';

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

console.log('=== Starting Composer Image Attachment Verification Suite (Phase 4) ===\n');

// ----------------------------------------------------
// Test 1: isImageFile classification
// ----------------------------------------------------
console.log('[Test 1] isImageFile classification across extensions');
{
  const validImages = [
    'screenshot.png',
    'photo.JPG',
    'banner.jpeg',
    'animation.GIF',
    'logo.webp',
    'vector.svg',
    'bitmap.BMP',
    'favicon.ico',
    'modern.avif',
    'src/assets/images/header.PNG',
    '.omp/attachments/img_1725000000_abcd.jpg',
    'https://example.com/images/test.webp?w=500#anchor',
  ];

  for (const img of validImages) {
    assert(isImageFile(img) === true, `Valid image correctly identified: ${img}`);
  }

  const nonImages = [
    'index.ts',
    'App.tsx',
    'main.js',
    'style.css',
    'document.pdf',
    'archive.zip',
    'data.json',
    'README.md',
    'Dockerfile',
    'no_extension',
    '.gitignore',
    '',
    null,
    undefined,
  ];

  for (const nonImg of nonImages) {
    assert(isImageFile(nonImg) === false, `Non-image correctly rejected: ${nonImg}`);
  }
}

// ----------------------------------------------------
// Test 2: getImageExtension mapping
// ----------------------------------------------------
console.log('\n[Test 2] getImageExtension MIME and filename extraction');
{
  assert(getImageExtension('image/png') === 'png', 'image/png maps to png');
  assert(getImageExtension('image/jpeg') === 'jpg', 'image/jpeg maps to jpg');
  assert(getImageExtension('image/jpg') === 'jpg', 'image/jpg maps to jpg');
  assert(getImageExtension('image/gif') === 'gif', 'image/gif maps to gif');
  assert(getImageExtension('image/webp') === 'webp', 'image/webp maps to webp');
  assert(getImageExtension('image/svg+xml') === 'svg', 'image/svg+xml maps to svg');
  assert(getImageExtension('image/bmp') === 'bmp', 'image/bmp maps to bmp');
  assert(getImageExtension('image/x-icon') === 'ico', 'image/x-icon maps to ico');
  assert(getImageExtension('image/avif') === 'avif', 'image/avif maps to avif');

  // Parameterized MIME types
  assert(
    getImageExtension('image/png; charset=utf-8') === 'png',
    'Parameterized image/png resolves to png'
  );
  assert(
    getImageExtension('IMAGE/JPEG; boundary=something') === 'jpg',
    'Uppercase parameterized image/jpeg resolves to jpg'
  );

  // Filename extension priority
  assert(
    getImageExtension('application/octet-stream', 'custom_chart.webp') === 'webp',
    'Valid filename extension overrides generic mime type'
  );
  assert(
    getImageExtension('', 'screenshot.png') === 'png',
    'Filename extension extracted when mime type is empty'
  );

  // Unknown fallback
  assert(
    getImageExtension('application/pdf') === 'png',
    'Unknown mime type falls back to png'
  );
  assert(getImageExtension('') === 'png', 'Empty mime type falls back to png');
}

// ----------------------------------------------------
// Test 3: buildMessageWithFileMentions with Image attachments
// ----------------------------------------------------
console.log('\n[Test 3] buildMessageWithFileMentions with image attachment tokens');
{
  // 3.1 Prompt with image attachment
  const res1 = buildMessageWithFileMentions('Giải thích ảnh thiết kế này', [
    '.omp/attachments/design.png',
  ]);
  assert(
    res1 === 'Giải thích ảnh thiết kế này @.omp/attachments/design.png',
    'Image attachment is appended as @token'
  );

  // 3.2 Prompt with inline image mention
  const res2 = buildMessageWithFileMentions(
    'So sánh @.omp/attachments/v1.png với phiên bản mới',
    ['.omp/attachments/v1.png']
  );
  assert(
    res2 === 'So sánh @.omp/attachments/v1.png với phiên bản mới',
    'Inline @image token is not duplicated at the end'
  );

  // 3.3 Mixed code files and image attachments
  const res3 = buildMessageWithFileMentions('Tối ưu hóa UI theo thiết kế', [
    'src/components/Header.tsx',
    '.omp/attachments/mockup.png',
  ]);
  assert(
    res3 === 'Tối ưu hóa UI theo thiết kế @src/components/Header.tsx @.omp/attachments/mockup.png',
    'Mixed code and image attachments formatted correctly'
  );
}

// ----------------------------------------------------
// Test 4: extractImageFromClipboard & extractFilesFromDrop mocks
// ----------------------------------------------------
console.log('\n[Test 4] extractImageFromClipboard and extractFilesFromDrop');
{
  // Mock File and Blob for Node environment
  class MockBlob {
    constructor(data, type = 'image/png') {
      this.data = data;
      this.type = type;
      this.size = data.length;
    }
    async arrayBuffer() {
      return new Uint8Array(this.data).buffer;
    }
  }

  class MockFile extends MockBlob {
    constructor(data, name, type = 'image/png', path) {
      super(data, type);
      this.name = name;
      this.path = path;
    }
  }

  // 4.1 Test clipboard items
  const mockClipboardData = {
    items: [
      {
        type: 'image/png',
        getAsFile: () => new MockFile([1, 2, 3, 4], 'paste.png', 'image/png'),
      },
    ],
    files: [],
  };

  const extracted = await extractImageFromClipboard(mockClipboardData);
  assert(extracted !== null, 'Clipboard image extracted successfully');
  assert(extracted.extension === 'png', 'Extracted extension is png');
  assert(extracted.buffer.length === 4, 'Extracted buffer length matches data');
  assert(extracted.name === 'paste.png', 'Extracted name is preserved');

  // 4.2 Test clipboard empty
  const emptyExtracted = await extractImageFromClipboard({ items: [], files: [] });
  assert(emptyExtracted === null, 'Empty clipboard returns null');

  // 4.3 Test extractFilesFromDrop
  const mockDropData = {
    files: [
      new MockFile([10, 20], 'photo.jpg', 'image/jpeg', '/workspace/photo.jpg'),
      new MockFile([30, 40], 'index.ts', 'text/typescript', '/workspace/src/index.ts'),
    ],
  };

  const dropResults = extractFilesFromDrop(mockDropData);
  assert(dropResults.length === 2, 'Dropped files extracted with length 2');
  assert(dropResults[0].isImage === true, 'First dropped file is identified as image');
  assert(dropResults[0].path === '/workspace/photo.jpg', 'First file path captured');
  assert(dropResults[1].isImage === false, 'Second dropped file is identified as code');

  // 4.4 Electron >= 32 đã bỏ File.path: resolver (webUtils.getPathForFile) phải được ưu tiên
  const mockDropNoPath = {
    files: [new MockFile([50, 60], 'screenshot.png', 'image/png', undefined)],
  };
  const resolvedResults = extractFilesFromDrop(
    mockDropNoPath,
    (file) => (file.name === 'screenshot.png' ? '/real/path/screenshot.png' : undefined)
  );
  assert(
    resolvedResults[0].path === '/real/path/screenshot.png',
    'resolvePath resolver supplies real path when File.path is absent'
  );

  const unresolvedResults = extractFilesFromDrop(mockDropNoPath, () => undefined);
  assert(
    unresolvedResults[0].path === undefined,
    'Path stays undefined when resolver returns nothing and File.path is absent'
  );

  // 4.5 File trong workspace phải được nhận diện qua computeRelativePath để attach trực tiếp
  const wsRel = computeRelativePath('/ws/project/assets/logo.png', '/ws/project');
  assert(wsRel === 'assets/logo.png', 'Workspace image resolves to relative path (attach directly)');
  const outsideRel = computeRelativePath('/elsewhere/pic.png', '/ws/project');
  assert(outsideRel === '/elsewhere/pic.png', 'Outside-workspace image keeps absolute path (needs IPC copy)');
}

// ----------------------------------------------------
// Test 5: Simulated IPC fs:save-image-attachment handler logic
// ----------------------------------------------------
console.log('\n[Test 5] Simulated fs:save-image-attachment logic');
{
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'omp-image-test-'));
  const wsPath = path.join(tempDir, 'workspace');
  await fs.mkdir(wsPath, { recursive: true });

  // Simulate IPC handler logic
  async function simulateSaveImageAttachment(buffer, extension, originalName) {
    const targetDir = path.join(wsPath, '.omp', 'attachments');
    await fs.mkdir(targetDir, { recursive: true });

    const ext = (extension || 'png').replace(/^\./, '').toLowerCase();
    const safeBase = originalName
      ? path.basename(originalName, path.extname(originalName)).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 32)
      : '';
    const prefix = safeBase ? `${safeBase}_` : 'img_';
    const fileName = `${prefix}${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${ext}`;
    const targetPath = path.join(targetDir, fileName);

    const data =
      buffer instanceof Uint8Array
        ? Buffer.from(buffer.buffer, buffer.byteOffset, buffer.byteLength)
        : Buffer.from(buffer);
    await fs.writeFile(targetPath, data);
    const relativePath = path.relative(wsPath, targetPath);

    return { success: true, filePath: targetPath, relativePath };
  }

  const sampleBuffer = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const result = await simulateSaveImageAttachment(sampleBuffer, 'png', 'clipboard_screenshot');

  assert(result.success === true, 'IPC handler returned success: true');
  assert(
    result.relativePath.startsWith(path.join('.omp', 'attachments')),
    'relativePath resides in .omp/attachments'
  );

  const fileExists = await fs.stat(result.filePath).then(() => true).catch(() => false);
  assert(fileExists === true, 'Saved attachment file exists on disk');

  const diskBytes = await fs.readFile(result.filePath);
  assert(
    diskBytes.length === sampleBuffer.length && diskBytes[0] === 137,
    'Disk content matches saved binary buffer'
  );

  // Clean up test workspace
  await fs.rm(tempDir, { recursive: true, force: true });
  assert(true, 'Test directory cleaned up cleanly');
}

// ----------------------------------------------------
// Test 6: computeRelativePath & formatImageDimensions
// ----------------------------------------------------
console.log('\n[Test 6] computeRelativePath & formatImageDimensions');
{
  assert(
    computeRelativePath('/Users/omp/project/src/app.ts', '/Users/omp/project') === 'src/app.ts',
    'Absolute workspace path converted to relative'
  );
  assert(
    computeRelativePath('.omp/attachments/img.png', '/Users/omp/project') === '.omp/attachments/img.png',
    'Already relative path preserved'
  );
  assert(
    formatImageDimensions(1920, 1080) === '1920 × 1080px',
    'Dimensions formatted correctly'
  );
}

console.log(`\n====================================================`);
console.log(`Image Attachment Verification: ${passed} passed, ${failed} failed.`);
console.log(`====================================================\n`);

if (failed > 0) {
  process.exit(1);
}
