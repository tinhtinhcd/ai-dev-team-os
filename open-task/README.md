# Open Task

Thêm file `.md` vào thư mục này để tự động tạo issue trên Linear.

## Format file .md

- **Dòng đầu**: Tiêu đề (có thể dùng `# Title` hoặc plain text)
- **Phần còn lại**: Mô tả chi tiết (body)

Ví dụ:

```markdown
# Fix login timeout

Người dùng báo lỗi timeout khi đăng nhập sau 30s.
Cần tăng timeout và thêm retry logic.
```

Hoặc:

```markdown
Add dark mode toggle

Thêm nút chuyển dark/light mode trong header.
```

## Luồng xử lý

1. Khi push file `.md` mới vào `open-task/`, GitHub Action sẽ chạy
2. Script đọc nội dung → tạo issue Linear (title + description)
3. File được chuyển sang `open-task-processed/` để tránh tạo trùng
4. Retry an toàn: nếu issue đã tồn tại (cùng title), chỉ di chuyển file

## Cấu hình

Cần set GitHub Secrets: `LINEAR_API_KEY`, `LINEAR_TEAM_ID`
