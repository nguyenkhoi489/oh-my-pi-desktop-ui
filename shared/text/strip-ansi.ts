// Biểu thức chính quy loại bỏ ANSI CSI, OSC, SGR và các escape sequences khác
// Bao gồm:
// 1. CSI: \x1b\[ ... [@-~] (màu sắc SGR, di chuyển con trỏ, xoá màn hình)
// 2. OSC: \x1b\] ... (\x07|\x1b\\) (tiêu đề cửa sổ, liên kết)
// 3. 2-character escape sequences: \x1b[@-Z\\-_]
// 4. Single character shifts: \x1b[NO][ -/]*[@-~]
const ANSI_REGEX = new RegExp(
  [
    '\\u001B\\][^\u0007\\u001B]*(?:\\u0007|\\u001B\\\\)',
    '[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:(?:;[-a-zA-Z\\d\\/#&.:=?%@~_\\s]+)*|[a-zA-Z\\d\\s]+(?:;[-a-zA-Z\\d\\/#&.:=?%@~_\\s]+)*)?\\u0007)|(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-ntqry=><~]))',
    '\\u001B[@-Z\\\\-_]',
  ].join('|'),
  'g'
);
/**
 * Loại bỏ tất cả các mã ANSI escape sequences khỏi chuỗi văn bản, giữ nguyên ký tự xuống dòng và unicode.
 */
export function stripAnsi(text: string): string {
  if (!text) return '';
  return text.replace(ANSI_REGEX, '');
}
