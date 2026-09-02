import type { EngineConfigEntry } from '../types/index.ts';
import type { I18nKey } from '../../shared/i18n/index.ts';

// Danh sách các cấu hình thường dùng được ghim lên nhóm đầu tiên
export const PINNED_CONFIG_KEYS = [
  'tools.approvalMode',
  'defaultThinkingLevel',
  'steeringMode',
  'followUpMode',
  'interruptMode',
  'autoResume',
  'update.channel',
  'startup.checkUpdate',
  'compaction.enabled',
  'compaction.thresholdPercent',
  'retry.enabled',
  'retry.maxRetries',
  'lsp.enabled',
  'todo.enabled',
  'skills.enabled',
  'memories.enabled',
  'browser.enabled',
  'git.enabled',
] as const;

export type PinnedConfigKey = (typeof PINNED_CONFIG_KEYS)[number];

export interface SessionOverrideInfo {
  appSetting: string;
  descriptionKey: I18nKey;
  defaultDesc: string;
}

// Các key cấu hình engine bị ghi đè bởi trạng thái phiên hoặc cài đặt ứng dụng
export const SESSION_OVERRIDE_KEYS: Record<string, SessionOverrideInfo> = {
  'tools.approvalMode': {
    appSetting: 'approvalMode',
    descriptionKey: 'engineConfig.override.approvalMode',
    defaultDesc: 'Ghi đè bởi chế độ phê duyệt (Approval Mode) trong phiên làm việc',
  },
  steeringMode: {
    appSetting: 'steeringMode (RPC)',
    descriptionKey: 'engineConfig.override.steeringMode',
    defaultDesc: 'Ghi đè bởi chế độ điều hướng (Steering Mode) qua RPC phiên',
  },
  followUpMode: {
    appSetting: 'followUpMode (RPC)',
    descriptionKey: 'engineConfig.override.followUpMode',
    defaultDesc: 'Ghi đè bởi chế độ hàng đợi tiếp theo qua RPC phiên',
  },
  interruptMode: {
    appSetting: 'interruptMode (RPC)',
    descriptionKey: 'engineConfig.override.interruptMode',
    defaultDesc: 'Ghi đè bởi chế độ ngắt qua RPC phiên',
  },
  defaultThinkingLevel: {
    appSetting: 'thinkingLevel',
    descriptionKey: 'engineConfig.override.thinkingLevel',
    defaultDesc: 'Ghi đè bởi mức độ suy nghĩ (Thinking Level) trong phiên làm việc',
  },
  modelRoles: {
    appSetting: 'modelRoles (config.yml)',
    descriptionKey: 'engineConfig.override.modelRoles',
    defaultDesc: 'Ghi đè bởi trình chỉnh sửa Model Roles trong tab Providers',
  },
  autoResume: {
    appSetting: 'autoResume',
    descriptionKey: 'engineConfig.override.autoResume',
    defaultDesc: 'OMP Desktop tự động quản lý vòng đời và khôi phục phiên',
  },
};

// Giới hạn tối đa số dòng cấu hình render đồng thời để đảm bảo hiệu năng
export const MAX_RENDER_CONFIG_ROWS = 200;

// Xóa dấu tiếng Việt và chuẩn hóa chữ thường phục vụ tìm kiếm
export function removeAccents(str: string): string {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase();
}

// Lọc danh sách cấu hình theo từ khóa (tên key hoặc mô tả không dấu)
export function filterEntries(entries: EngineConfigEntry[], query: string): EngineConfigEntry[] {
  if (!query || !query.trim()) {
    return entries;
  }
  const cleanQuery = removeAccents(query.trim());
  return entries.filter((entry) => {
    const keyMatch = removeAccents(entry.key).includes(cleanQuery);
    const descMatch = entry.description ? removeAccents(entry.description).includes(cleanQuery) : false;
    return keyMatch || descMatch;
  });
}

// Nhóm các cấu hình theo prefix đầu tiên trước dấu chấm
export function groupByPrefix(entries: EngineConfigEntry[]): Record<string, EngineConfigEntry[]> {
  const groups: Record<string, EngineConfigEntry[]> = {};

  for (const entry of entries) {
    const dotIndex = entry.key.indexOf('.');
    const prefix = dotIndex > 0 ? entry.key.slice(0, dotIndex) : 'general';
    if (!groups[prefix]) {
      groups[prefix] = [];
    }
    groups[prefix].push(entry);
  }

  // Sắp xếp các entry trong từng nhóm theo thứ tự bảng chữ cái
  for (const prefix of Object.keys(groups)) {
    groups[prefix].sort((a, b) => a.key.localeCompare(b.key));
  }

  return groups;
}

export interface CoerceResult {
  value: unknown;
  stringified: string;
  error?: I18nKey;
}

// Chuyển đổi và kiểm tra tính hợp lệ của giá trị nhập trước khi gửi sang engine
export function coerceInput(type: string, raw: unknown): CoerceResult {
  const t = (type || 'string').toLowerCase();

  if (t === 'boolean') {
    if (typeof raw === 'boolean') {
      return { value: raw, stringified: String(raw) };
    }
    if (typeof raw === 'string') {
      const lower = raw.trim().toLowerCase();
      if (lower === 'true' || lower === '1') {
        return { value: true, stringified: 'true' };
      }
      if (lower === 'false' || lower === '0') {
        return { value: false, stringified: 'false' };
      }
    }
    return {
      value: raw,
      stringified: String(raw ?? ''),
      error: 'engineConfig.error.invalidBoolean',
    };
  }

  if (t === 'number') {
    if (typeof raw === 'number' && !isNaN(raw)) {
      return { value: raw, stringified: String(raw) };
    }
    if (typeof raw === 'string') {
      const trimmed = raw.trim();
      if (trimmed === '') {
        return {
          value: raw,
          stringified: raw,
          error: 'engineConfig.error.invalidNumber',
        };
      }
      const num = Number(trimmed);
      if (!isNaN(num)) {
        return { value: num, stringified: String(num) };
      }
    }
    return {
      value: raw,
      stringified: String(raw ?? ''),
      error: 'engineConfig.error.invalidNumber',
    };
  }

  if (t === 'array' || t === 'record') {
    if (typeof raw === 'string') {
      const trimmed = raw.trim();
      if (trimmed === '') {
        const emptyVal = t === 'array' ? [] : {};
        return { value: emptyVal, stringified: JSON.stringify(emptyVal) };
      }
      try {
        const parsed = JSON.parse(trimmed);
        if (t === 'array' && !Array.isArray(parsed)) {
          return {
            value: parsed,
            stringified: trimmed,
            error: 'engineConfig.error.expectedArray',
          };
        }
        if (t === 'record' && (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))) {
          return {
            value: parsed,
            stringified: trimmed,
            error: 'engineConfig.error.expectedObject',
          };
        }
        return { value: parsed, stringified: trimmed };
      } catch {
        return {
          value: raw,
          stringified: raw,
          error: 'engineConfig.error.invalidJson',
        };
      }
    }

    if (typeof raw === 'object' && raw !== null) {
      if (t === 'array' && !Array.isArray(raw)) {
        return {
          value: raw,
          stringified: JSON.stringify(raw),
          error: 'engineConfig.error.expectedArray',
        };
      }
      if (t === 'record' && Array.isArray(raw)) {
        return {
          value: raw,
          stringified: JSON.stringify(raw),
          error: 'engineConfig.error.expectedObject',
        };
      }
      return { value: raw, stringified: JSON.stringify(raw) };
    }

    return {
      value: raw,
      stringified: String(raw ?? ''),
      error: 'engineConfig.error.invalidJson',
    };
  }

  // Mặc định string hoặc enum
  const strVal = raw === undefined || raw === null ? '' : typeof raw === 'object' ? JSON.stringify(raw) : String(raw);
  return { value: strVal, stringified: strVal };
}

// Định dạng giá trị config hiển thị lên giao diện
export function formatConfigValue(value: unknown): string {
  if (value === undefined || value === null) {
    return '';
  }
  if (typeof value === 'boolean' || typeof value === 'number') {
    return String(value);
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'object') {
    return JSON.stringify(value, null, 2);
  }
  return String(value);
}
