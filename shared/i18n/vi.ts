export const vi = {
  // Settings - Navigation & Tabs
  'settings.title': 'Cài đặt',
  'settings.desc': 'Tùy chỉnh giao diện, engine và quản lý LLM Providers',
  'settings.close': 'Đóng (ESC)',
  'settings.tab.general': 'Giao diện',
  'settings.tab.engine': 'Engine & Khởi động',
  'settings.tab.providers': 'Providers & Custom LLM',
  // Settings - General Tab
  'settings.theme.title': 'Chủ đề giao diện (Theme)',
  'settings.theme.light': 'Giao diện Sáng (Light)',
  'settings.theme.light.desc': 'Tone trắng thanh lịch, tương phản cao',
  'settings.theme.dark': 'Giao diện Tối (Dark)',
  'settings.theme.dark.desc': 'Tone đen xám dịu mắt, phong cách Codex',

  // Settings - Language
  'settings.language.title': 'Ngôn ngữ hiển thị (Language)',
  'settings.language.desc': 'Chọn ngôn ngữ giao diện cho OMP Desktop và thông báo hệ thống',
  'settings.language.vi': 'Tiếng Việt (Vietnamese)',
  'settings.language.vi.desc': 'Giao diện mặc định Tiếng Việt',
  'settings.language.en': 'English (Tiếng Anh)',
  'settings.language.en.desc': 'English interface for OMP Desktop',

  // Common UI actions & states
  'common.save': 'Lưu',
  'common.cancel': 'Hủy',
  'common.close': 'Đóng',
  'common.delete': 'Xóa',
  'common.edit': 'Chỉnh sửa',
  'common.retry': 'Thử lại',
  'common.loading': 'Đang tải...',
  'common.success': 'Thành công',
  'common.error': 'Lỗi',
  'common.error.generic': 'Đã xảy ra lỗi không xác định',
  'common.error.timeout': 'Thao tác quá thời gian chờ ({timeout}s)',
  'common.error.network': 'Không thể kết nối máy chủ ({host})',
  'common.confirm': 'Xác nhận',
  'common.search': 'Tìm kiếm...',
  'common.copy': 'Sao chép',
  'common.copied': 'Đã sao chép',
} as const;

export type I18nKey = keyof typeof vi;
