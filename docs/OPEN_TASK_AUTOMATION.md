# Open Task → Linear Automation

Automation tạo issue Linear khi có file `.md` mới trong `open-task/`.

## Dùng gì (What)

| Thành phần | Công nghệ |
|------------|-----------|
| **Trigger** | GitHub Actions (push vào `open-task/**/*.md`) |
| **Script** | Node.js (`scripts/process-open-task.js`) |
| **API** | Linear GraphQL API |
| **Tránh trùng** | 1) Search issue cùng title trước khi tạo; 2) Di chuyển file sang `open-task-processed/` sau khi xử lý |

## Làm như thế nào (How)

1. **Developer** thêm file `.md` vào `open-task/`, push lên `main`/`master`
2. **GitHub Action** chạy (trigger: `paths: open-task/**/*.md`)
3. **Script**:
   - Đọc từng file `.md` (bỏ qua README.md)
   - Parse: dòng đầu = title, còn lại = description
   - Gọi Linear API: search issue cùng title → nếu có thì skip (idempotency)
   - Nếu chưa có: tạo issue mới
   - Di chuyển file sang `open-task-processed/`
4. **Action** commit + push thay đổi (file đã chuyển)

## Cấu hình

### GitHub Secrets

| Secret | Mô tả |
|--------|-------|
| `LINEAR_API_KEY` | API key từ [Linear Settings → API](https://linear.app/settings/api) |
| `LINEAR_TEAM_ID` | Team ID (từ URL team hoặc GraphQL `teams` query) |

### Chạy local (test)

```bash
LINEAR_API_KEY=lin_api_xxx LINEAR_TEAM_ID=xxx npm run process:open-task
```

## Format file .md

```markdown
# Tiêu đề issue

Mô tả chi tiết...
```

Hoặc plain text dòng đầu:

```markdown
Tiêu đề issue

Mô tả chi tiết...
```

## Kiểm chứng E2E

**Lưu ý:** Workflow chạy trên `main`/`master`. Merge branch này trước khi test.

1. **Thêm file mới** → tạo issue:
   - Tạo `open-task/test-e2e.md` với nội dung:
     ```markdown
     # E2E Test Open Task
     File test automation.
     ```
   - Push lên `main`
   - Kiểm tra: issue xuất hiện trên Linear, file đã chuyển sang `open-task-processed/`

2. **Retry không tạo trùng** (chạy local):
   - Copy file từ `open-task-processed/` về `open-task/`
   - `LINEAR_API_KEY=... LINEAR_TEAM_ID=... npm run process:open-task`
   - Kiểm tra: log `[SKIP] Issue exists`, không tạo issue mới
