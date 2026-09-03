export const IMAGE_EXTENSIONS = new Set<string>([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'svg',
  'bmp',
  'ico',
  'avif',
]);

const MIME_EXTENSION_MAP: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/bmp': 'bmp',
  'image/x-ms-bmp': 'bmp',
  'image/x-icon': 'ico',
  'image/vnd.microsoft.icon': 'ico',
  'image/avif': 'avif',
};

// Check if file path or name is a valid image format
export function isImageFile(filenameOrPath: string): boolean {
  if (!filenameOrPath || typeof filenameOrPath !== 'string') return false;
  const cleanPath = filenameOrPath.split('?')[0].split('#')[0].trim();
  const lastDot = cleanPath.lastIndexOf('.');
  if (lastDot === -1 || lastDot === cleanPath.length - 1) return false;
  const ext = cleanPath.slice(lastDot + 1).toLowerCase();
  return IMAGE_EXTENSIONS.has(ext);
}

// Extract image extension from MIME type or file name
export function getImageExtension(mimeType: string, filename?: string): string {
  if (filename) {
    const cleanName = filename.split('?')[0].split('#')[0].trim();
    const lastDot = cleanName.lastIndexOf('.');
    if (lastDot !== -1 && lastDot < cleanName.length - 1) {
      const ext = cleanName.slice(lastDot + 1).toLowerCase();
      if (IMAGE_EXTENSIONS.has(ext)) {
        return ext === 'jpeg' ? 'jpg' : ext;
      }
    }
  }

  if (mimeType) {
    const cleanMime = mimeType.toLowerCase().split(';')[0].trim();
    if (MIME_EXTENSION_MAP[cleanMime]) {
      return MIME_EXTENSION_MAP[cleanMime];
    }
    if (cleanMime.startsWith('image/')) {
      const subtype = cleanMime.slice(6);
      if (IMAGE_EXTENSIONS.has(subtype)) {
        return subtype === 'jpeg' ? 'jpg' : subtype;
      }
    }
  }

  return 'png';
}

export interface ExtractedImageAttachment {
  buffer: Uint8Array;
  extension: string;
  name: string;
  blob: Blob;
}

// Extract image buffer and blob from clipboard paste event
export async function extractImageFromClipboard(
  clipboardData: DataTransfer | null | undefined
): Promise<ExtractedImageAttachment | null> {
  if (!clipboardData) return null;

  const items = clipboardData.items;
  if (items && items.length > 0) {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          const arrayBuffer = await file.arrayBuffer();
          const ext = getImageExtension(item.type, file.name);
          return {
            buffer: new Uint8Array(arrayBuffer),
            extension: ext,
            name: file.name || `image_${Date.now()}.${ext}`,
            blob: file,
          };
        }
      }
    }
  }

  const files = clipboardData.files;
  if (files && files.length > 0) {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.type.startsWith('image/') || isImageFile(file.name)) {
        const arrayBuffer = await file.arrayBuffer();
        const ext = getImageExtension(file.type, file.name);
        return {
          buffer: new Uint8Array(arrayBuffer),
          extension: ext,
          name: file.name || `image_${Date.now()}.${ext}`,
          blob: file,
        };
      }
    }
  }

  return null;
}

export interface ExtractedDropFile {
  file: File;
  isImage: boolean;
  path?: string;
}

// Extract files from drag and drop event
// resolvePath: get real path of File (Electron >= 32 removed File.path)
export function extractFilesFromDrop(
  dataTransfer: DataTransfer | null | undefined,
  resolvePath?: (file: File) => string | undefined
): ExtractedDropFile[] {
  if (!dataTransfer || !dataTransfer.files) return [];
  const result: ExtractedDropFile[] = [];

  for (let i = 0; i < dataTransfer.files.length; i++) {
    const file = dataTransfer.files[i];
    const isImage = isImageFile(file.name) || file.type.startsWith('image/');
    const filePath = resolvePath?.(file) || (file as any).path || undefined;
    result.push({
      file,
      isImage,
      path: filePath,
    });
  }

  return result;
}

// Convert absolute path to relative path in workspace
export function computeRelativePath(fullPath: string, workspacePath?: string): string {
  if (!fullPath) return '';
  if (!workspacePath) return fullPath;

  const normalizedFull = fullPath.replace(/\\/g, '/');
  const normalizedWs = workspacePath.replace(/\\/g, '/').replace(/\/$/, '');

  if (normalizedFull.startsWith(normalizedWs + '/')) {
    return normalizedFull.slice(normalizedWs.length + 1);
  }
  if (normalizedFull === normalizedWs) {
    return '.';
  }

  return fullPath;
}

// Format image size for display
export function formatImageDimensions(width: number, height: number): string {
  return `${width} × ${height}px`;
}
