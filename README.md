# WorkBrief AI

Web ghi chú & tóm tắt công việc bằng AI: dán nội dung email / tin nhắn Zalo, AI (Gemini) tóm tắt thành đầu việc kèm checklist, mức ưu tiên; theo dõi tiến độ trên Dashboard. Admin cấp tài khoản dùng thử (số ngày + AI quota).

```
WorkBriefAI/
├── backend/    # REST API — Express + TypeScript + MongoDB          → http://localhost:8081/api
└── frontend/   # Web app — Next.js (App Router) + Tailwind + TanStack Query → http://localhost:8080
```

## Yêu cầu

- Node.js ≥ 20
- MongoDB (local hoặc Atlas)
- (Tuỳ chọn) Gemini API key — https://aistudio.google.com/apikey

## Cài đặt lần đầu

```bash
cd backend
npm install
cp .env.example .env          # rồi điền các biến bên dưới

cd ../frontend
npm install
cp .env.example .env.local    # NEXT_PUBLIC_API_URL=http://localhost:8081/api
```

### Biến môi trường

`backend/.env`

| Biến | Bắt buộc | Ghi chú |
|------|----------|---------|
| `MONGODB_URI` | ✅ | Chuỗi kết nối MongoDB / Atlas (kèm tên DB, vd `/workbrief_ai`) |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | ✅ | Chuỗi ngẫu nhiên ≥ 32 ký tự, hai giá trị khác nhau |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | ✅ | Tài khoản Admin được tạo ở lần chạy đầu (mật khẩu ≥ 8 ký tự) |
| `GEMINI_API_KEY` | – | Bỏ trống + `AI_MOCK_FALLBACK=true` → dùng tóm tắt mẫu |
| `PORT` | – | Mặc định `8081` |
| `CORS_ORIGINS` | – | Mặc định `http://localhost:8080` |

`frontend/.env.local`

| Biến | Giá trị |
|------|---------|
| `NEXT_PUBLIC_API_URL` | `http://localhost:8081/api` |

## Chạy hằng ngày (2 terminal)

```bash
cd backend && npm run dev     # API  → http://localhost:8081/api
```

```bash
cd frontend && npm run dev    # Web  → http://localhost:8080
```

Khi khởi động, backend tự tạo tài khoản Admin từ `ADMIN_EMAIL` / `ADMIN_PASSWORD` **nếu chưa tồn tại** (không xoá hay ghi đè dữ liệu có sẵn). Đăng nhập tại `http://localhost:8080/login`.

Kiểm tra API: `GET http://localhost:8081/api/health`.

## Frontend — các trang

| Route | Mô tả |
|-------|-------|
| `/login` | Đăng nhập JWT; thông báo riêng khi tài khoản bị khóa / hết hạn dùng thử |
| `/` | Dashboard: 4 thẻ thống kê, tỷ lệ hoàn thành, việc sắp đến hạn, ghi chú gần đây |
| `/tasks` | Lọc trạng thái / nguồn / tìm kiếm; modal **Tạo việc nhanh với AI**; tick checklist; Mail/Zalo người giao; chốt Hoàn thành / Chưa hoàn thành |
| `/colleagues` | Danh bạ sếp & đồng nghiệp + liên hệ nhanh |
| `/integrations` | Trạng thái Gmail, Zalo webhook key (copy / tạo mới), giả lập tin nhắn Zalo |
| `/admin` | Chỉ ADMIN: cấp tài khoản dùng thử, `+7 ngày`, `Reset AI`, `Khóa / Mở khóa` |

## API chính

Mọi response: `{ success, data, message }`. Các route (trừ login/refresh/health/webhook) cần header `Authorization: Bearer <accessToken>`.

### Auth — `/api/auth`
| Method | Path               | Mô tả                                   |
|--------|--------------------|-----------------------------------------|
| POST   | `/login`           | `{ email, password }` → user + tokens   |
| POST   | `/refresh`         | `{ refreshToken }` → cặp token mới      |
| POST   | `/logout`          | Vô hiệu mọi token hiện có của user      |
| GET    | `/me`              | Thông tin tài khoản + quota             |
| PATCH  | `/change-password` | `{ currentPassword, newPassword }`      |

### Admin — `/api/admin/users` (role `ADMIN`)
| Method | Path                    | Mô tả                                                    |
|--------|-------------------------|----------------------------------------------------------|
| GET    | `/`                     | Danh sách user + số task (`?search=&role=&status=`)      |
| POST   | `/`                     | Tạo tài khoản dùng thử `{ fullName, email, password, trialDays, aiQuotaLimit }` |
| GET    | `/:id`                  | Chi tiết user                                            |
| PATCH  | `/:id/extend-trial`     | `{ days }` gia hạn                                       |
| PATCH  | `/:id/reset-quota`      | `{ aiQuotaLimit? }` reset quota đã dùng về 0             |
| PATCH  | `/:id/status`           | `{ status: "ACTIVE" \| "SUSPENDED" }` khoá / mở           |

### Tasks — `/api/tasks`
| Method | Path                          | Mô tả                                                        |
|--------|-------------------------------|--------------------------------------------------------------|
| POST   | `/ai-summarize`               | `{ rawContent, source }` → `{ title, aiSummary, checklist, suggestedPriority }` |
| GET    | `/stats`                      | Thống kê Dashboard (`?upcomingDays=7`)                       |
| GET    | `/`                           | Danh sách (`?status=&priority=&source=&q=&page=&limit=`)     |
| POST   | `/`                           | Tạo task                                                     |
| GET    | `/:id`                        | Chi tiết                                                     |
| PATCH  | `/:id`                        | Sửa nội dung                                                 |
| DELETE | `/:id`                        | Xoá                                                          |
| PATCH  | `/:id/checklist/:itemId`      | Tick checklist `{ isDone? }` (bỏ trống = đảo trạng thái)     |
| PATCH  | `/:id/status`                 | `{ status, incompleteReason?, deadline? }`                    |
| GET    | `/:id/activities`             | Lịch sử hoạt động của task                                   |

### Colleagues — `/api/colleagues`
CRUD: `GET /`, `POST /`, `GET /:id`, `PATCH /:id`, `DELETE /:id`.

### Integrations — `/api/integrations`
| Method | Path                     | Mô tả                                                       |
|--------|--------------------------|-------------------------------------------------------------|
| GET    | `/overview`              | Trạng thái Gmail, Zalo webhook key/URL, số task theo nguồn  |
| POST   | `/zalo/regenerate-key`   | Tạo webhook key mới                                         |
| POST   | `/zalo/webhook`          | Header `x-webhook-key`; body `{ message, senderName?, senderPhone?, groupName? }` → AI tóm tắt + lưu Task |
