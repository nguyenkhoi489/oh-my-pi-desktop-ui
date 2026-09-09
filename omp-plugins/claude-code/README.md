# OMP Claude Code Advisor Plugin

Plugin OMP đăng ký provider `claude-code`, bọc CLI `claude -p` thành endpoint OpenAI-compatible để role advisor của OMP chạy bằng Claude Code đã login trên máy cá nhân.

> **Lưu ý**: Plugin này chỉ dành cho mục đích sử dụng cá nhân trên máy local đã cài đặt và đăng nhập Claude Code (`claude login`). Không phân phối ra bên ngoài.

## Cài đặt & Kích hoạt

```bash
# Link plugin vào OMP
omp plugin link omp-plugins/claude-code

# Kiểm tra trạng thái plugin
omp plugin list
omp plugin doctor

# Kiểm tra danh mục model
omp models claude-code
```

## Cấu hình Model Role

Trong file cấu hình `~/.omp/agent/config.yml` hoặc giao diện OMP-Agent:

```yaml
modelRoles:
  advisor: claude-code/fable:high   # hoặc claude-code/opus, claude-code/sonnet
```

## Lệnh điều khiển

- `/claude-code status`: Xem port HTTP, model, số session, số lần spawn, số timeout, lỗi gần nhất.
- `/claude-code effort <low|medium|high|xhigh|max|off>`: Đổi mức reasoning effort mặc định (lưu tại `~/.omp/agent/claude-code.json`).

## Gỡ bỏ

```bash
omp plugin uninstall omp-claude-code-provider
```
