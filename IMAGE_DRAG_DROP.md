# Kế hoạch Triển khai Kéo & Thả (Drag & Drop) và Dán (Ctrl+V / Cmd+V) Ảnh vào Ô Chat

## Context
Người dùng cần khả năng đính kèm hình ảnh trực tiếp vào ô chat (`PromptComposer`) thông qua 2 thao tác phổ biến:
1. **Kéo & thả (Drag & Drop)** file ảnh từ Finder/Explorer/Workspace vào vùng nhập liệu hoặc khu vực chat.
2. **Dán từ clipboard (Ctrl+V / Cmd+V)** khi copy ảnh hoặc chụp màn hình (screenshot clipboard).

Hệ thống sẽ lưu trữ ảnh tạm thời/trong workspace nếu cần (đối với ảnh từ clipboard hoặc ngoài workspace), tạo preview thumbnail trực quan trong danh sách attachment của composer, gắn token `@<path-to-image>` vào prompt gửi tới OMP engine, và hỗ trợ xem trước ảnh đính kèm trong lịch sử chat (`ChatHistory`).

---

## Approach

### Giai đoạn 1: Mở rộng Electron IPC & Lưu trữ file đính kèm (`electron/`)
1. **Thêm IPC handler `fs:save-image-attachment` trong `electron/main.ts`**:
   - Khi nhận buffer ảnh từ clipboard hoặc web drag:
     - Xác định thư mục lưu trữ: nếu workspace đang mở, tạo thư mục con `.omp/attachments/` trong workspace (dùng `fs.mkdir(dir, { recursive: true })`); nếu chưa mở workspace, lưu vào `path.join(app.getPath('temp'), 'omp-attachments')`.
     - Tạo tên file duy nhất theo timestamp: `img_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${ext}`.
     - Ghi buffer bằng `fs.writeFile(targetPath, Buffer.from(buffer))`.
     - Trả về `{ success: true, filePath: targetPath, relativePath: relativeToWorkspace || targetPath }`.
2. **Cập nhật contracts trong `electron/types.ts` & `src/types/index.ts` & `electron/preload.ts`**:
   - Khai báo kiểu dữ liệu cho `saveImageAttachment`:
     ```ts
     saveImageAttachment: (
       buffer: Uint8Array | ArrayBuffer,
       extension: string,
       originalName?: string
     ) => Promise<{ success: boolean; filePath: string; relativePath?: string; error?: string }>;
     ```
   - Expose hàm `saveImageAttachment` trong `window.electronAPI`.

### Giai đoạn 2: Xây dựng Module tiện ích xử lý ảnh (`src/utils/imageAttachment.ts`)
1. **Tạo file `src/utils/imageAttachment.ts`**:
   - `isImageFile(filenameOrPath: string): boolean`: Kiểm tra đuôi file (`.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.svg`, `.bmp`, `.ico`, `.avif`).
   - `getImageExtension(mimeType: string, filename?: string): string`: Trích xuất extension phù hợp từ MIME type (vd `image/png` -> `png`) hoặc từ tên file.
   - `extractImageFromClipboard(items: DataTransferItemList | FileList): Promise<{ buffer: ArrayBuffer; extension: string; name: string; blob: Blob } | null>`: Lọc và đọc blob ảnh từ clipboard.
   - `extractFilesFromDrop(dataTransfer: DataTransfer): Promise<Array<{ file?: File; path?: string; isImage: boolean }>>`: Lọc các file kéo thả.
   - `computeRelativePath(fullPath: string, workspacePath?: string): string`: Tính đường dẫn tương đối so với workspace nếu nằm trong workspace.

### Giai đoạn 3: Tích hợp Drag & Drop và Paste Clipboard vào `PromptComposer.tsx`
1. **Xử lý sự kiện Paste (`handlePaste`) trên Textarea / Composer**:
   - Bắt sự kiện `onPaste` trên `<textarea>`.
   - Kiểm tra `e.clipboardData.items`:
     - Nếu có item dạng `image/*`:
       - Gọi `e.preventDefault()` để không paste text rác hoặc bị nuốt sự kiện.
       - Đọc file blob thông qua `item.getAsFile()`.
       - Đọc `ArrayBuffer` từ blob.
       - Gọi `window.electronAPI?.saveImageAttachment(buffer, ext)` (nếu không có Electron, fallback tạo `URL.createObjectURL(blob)` làm demo preview).
       - Thêm đường dẫn file (`relativePath` hoặc `filePath`) vào `attachedFiles`.
       - Lưu preview URL vào state `imagePreviews: Record<string, string>` để hiển thị thumbnail ngay lập tức.
2. **Xử lý sự kiện Drag & Drop (`onDragOver`, `onDragEnter`, `onDragLeave`, `onDrop`)**:
   - Quản lý state `isDraggingOver: boolean`.
   - Bắt sự kiện kéo thả trên vùng composer (và có thể toàn bộ khu vực `AgentPanel`):
     - `onDragOver`: `e.preventDefault()`, set `e.dataTransfer.dropEffect = 'copy'`.
     - `onDragEnter`: set `isDraggingOver = true`.
     - `onDragLeave`: nếu rời khỏi container thì set `isDraggingOver = false`.
     - `onDrop`: `e.preventDefault()`, set `isDraggingOver = false`.
   - Trong `onDrop`:
     - Lặp qua `e.dataTransfer.files`:
       - Nếu file có thuộc tính `.path` (Electron native drag từ Finder/Explorer):
         - Nếu là file trong workspace, tính relative path.
         - Nếu ngoài workspace hoặc là ảnh từ clipboard/web: lưu vào `.omp/attachments` qua IPC handler.
         - Thêm vào `attachedFiles`.
       - Tạo thumbnail preview URL lưu vào `imagePreviews`.
3. **Hiển thị giao diện Attachment Pills & Drag Overlay**:
   - Khi `isDraggingOver = true`: Hiển thị lớp phủ viền nét đứt (dashed blue border) với icon upload và nhãn `"Thả ảnh hoặc file vào đây để đính kèm"`.
   - Cải tiến danh sách `attachedFiles` pills:
     - Đối với file ảnh (`isImageFile(file)`):
       - Hiển thị card thumbnail nhỏ (36x36px) có ảnh preview thu nhỏ, tên file cắt gọn và nút X để gỡ bỏ.
       - Nhấp vào thumbnail để mở modal xem ảnh phóng to (Image Lightbox Modal).
     - Đối với file mã nguồn / text thường: Giữ nguyên chip `@file` kèm icon `FileCode`/`AtSign`.
4. **Dọn dẹp tài nguyên (Resource Cleanup)**:
   - Khi gửi tin nhắn (`handleSend`) hoặc gỡ bỏ attachment: revoke các `blob:` Object URL đã tạo để tránh rò rỉ bộ nhớ (memory leaks).

### Giai đoạn 4: Cập nhật Lịch sử Chat (`ChatHistory.tsx`)
1. **Hiển thị hình ảnh đính kèm trong tin nhắn**:
   - Khi tin nhắn có role `fileMention` hoặc user message có file ảnh đính kèm:
     - Nếu file có đuôi ảnh (`isImageFile(file.path)`):
       - Hiển thị khung preview ảnh trực tiếp trong khung Attached Context hoặc bên dưới bong bóng chat.
       - Hỗ trợ click để xem phóng to trong modal preview ảnh.

---

## Critical Files & Anchors
- `src/utils/imageAttachment.ts` — Logic thuần túy nhận diện ảnh, MIME type, trích xuất clipboard/drag-drop.
- `src/components/AgentPanel/PromptComposer.tsx` — Xử lý `onPaste`, `onDrop`, `onDragOver`, hiển thị attachment thumbnail và drag overlay.
- `electron/main.ts` & `electron/preload.ts` — IPC handler `fs:save-image-attachment` lưu ảnh vào `.omp/attachments/` hoặc temp dir.
- `src/types/index.ts` & `electron/types.ts` — Định nghĩa interface IPC cho `saveImageAttachment`.
- `src/components/AgentPanel/ChatHistory.tsx` — Render thumbnail cho ảnh trong `fileMention` và tin nhắn user.
- `scripts/verify-composer-image-attachment.mjs` — Test suite tự động cho toàn bộ logic xử lý ảnh.

---

## Verification
1. **Unit & Logic Tests**:
   - Tạo file test `scripts/verify-composer-image-attachment.mjs`:
     - Kiểm tra `isImageFile` với các định dạng ảnh (`png`, `jpg`, `jpeg`, `webp`, `svg`, `gif`, `bmp`, `ico`, `avif`) và các đuôi file code (`ts`, `json`, `md`).
     - Kiểm tra `getImageExtension` cho các MIME types và fallback extensions.
     - Kiểm tra `buildMessageWithFileMentions` với ảnh đính kèm và file text hỗn hợp.
     - Kiểm tra khả năng lưu ảnh qua IPC giả lập `fs:save-image-attachment`.
   - Chạy lệnh: `node --experimental-strip-types scripts/verify-composer-image-attachment.mjs`.
2. **Typecheck & Full Suite Verification**:
   - Chạy `npx tsc --noEmit` và `npx tsc -p tsconfig.node.json --noEmit`.
   - Chạy `npm run test` để đảm bảo không có regression trên toàn bộ test suite.
3. **Tương tác UI (Behavioral checks)**:
   - Paste ảnh chụp màn hình từ clipboard vào ô input -> Hiện thumbnail ảnh trong composer.
   - Kéo thả file ảnh từ thư mục vào composer -> Hiện overlay drag-over -> Thả ra hiển thị ảnh đính kèm.
   - Nhấn Send -> Tin nhắn được gửi với token `@.omp/attachments/...` và hiển thị preview trong chat.

---

## Assumptions & Contingencies
- **Vị trí lưu trữ**: Ảnh clipboard được lưu vào thư mục `.omp/attachments/` trong thư mục workspace hiện tại để OMP Agent có thể truy cập trực tiếp qua đường dẫn tương đối. Nếu chưa mở workspace, lưu vào thư mục temp của hệ điều hành.
- **Dung lượng ảnh**: Tự động hỗ trợ các định dạng ảnh phổ biến (PNG, JPEG, WebP, GIF, SVG).
