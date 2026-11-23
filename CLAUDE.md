# WorkBrief AI — ghi chú kiến trúc

Web note & tóm tắt công việc bằng AI (Gemini), nhận việc từ Gmail / Zalo, có Dashboard thống kê và Admin cấp tài khoản dùng thử.

## Monorepo

| Thư mục     | Vai trò  | Port   | Stack                                                                 |
|-------------|----------|--------|-----------------------------------------------------------------------|
| `/frontend` | Web app  | `8080` | Next.js 16 (App Router), React 19, Tailwind 4, TanStack Query, Axios, Lucide |
| `/backend`  | REST API | `8081` | Node.js, Express 5, TypeScript, Mongoose, JWT, Zod, `@google/genai`   |

- Database: **MongoDB** (`MONGODB_URI` trong `backend/.env`).
- CORS backend chỉ cho phép các origin trong `CORS_ORIGINS` (mặc định `http://localhost:8080`).
- Không commit `.env`; mọi biến mới phải được thêm vào `backend/.env.example` và schema `backend/src/config/env.ts`.

## Quy ước API

- Prefix: `/api`.
- Mọi response (kể cả lỗi) có dạng:
  ```json
  { "success": true, "data": {}, "message": "..." }
  ```
  Lỗi: `success: false`, `data: null` (hoặc chi tiết lỗi validate), HTTP status phù hợp.
- Dùng `sendSuccess()` trong `src/utils/apiResponse.ts`; ném `ApiError` (`src/utils/ApiError.ts`) để trả lỗi — middleware `error.middleware.ts` sẽ format.
- Validate input bằng Zod (`src/validators/*`) và gọi `schema.parse(...)` trong controller; `ZodError` tự trả về 400.
- Express 5: handler async ném lỗi được tự chuyển tới error middleware, không cần `asyncHandler`.
- Danh sách có phân trang trả về `data: { items, pagination: { page, limit, total, totalPages } }`.

## Auth

- Không có API đăng ký tự do. Admin mặc định được tạo bởi `src/seed/seedAdmin.ts` khi server khởi động (từ `ADMIN_EMAIL` / `ADMIN_PASSWORD`). Seed **chỉ tạo nếu chưa có**, không bao giờ xoá/ghi đè dữ liệu.
- Admin tạo tài khoản dùng thử qua `/api/admin/users`.
- JWT: access token (header `Authorization: Bearer`) + refresh token (`POST /api/auth/refresh`). Cả hai mang `tokenVersion`; logout / khoá tài khoản / đổi mật khẩu sẽ tăng `tokenVersion` để vô hiệu token cũ.
- `auth.middleware.ts` chặn request nếu `status !== 'ACTIVE'` hoặc `trialExpiresAt` đã quá hạn.
- Zalo Extension gọi `POST /api/integrations/zalo/webhook` với header `x-webhook-key` (= `User.webhookApiKey`), không dùng JWT.

## AI

- `src/services/ai.service.ts` gọi Gemini (`GEMINI_MODEL`, mặc định `gemini-3.5-flash`; lỗi 404/429/500/503/timeout thì thử lần lượt `GEMINI_FALLBACK_MODELS`) với JSON schema, trả `{ title, aiSummary, checklist, suggestedPriority }`.
- Mỗi lần tóm tắt trừ 1 quota (`aiQuotaUsed`), được giữ chỗ nguyên tử trước khi gọi AI và hoàn lại nếu AI lỗi.
- Thiếu `GEMINI_API_KEY` + `AI_MOCK_FALLBACK=true` → trả tóm tắt mẫu (heuristic) để test, có cờ `isMock: true`.

## Tích hợp

- **Gmail** (`src/services/gmail.service.ts`, `googleapis`): OAuth 2.0 scope `gmail.readonly`, `access_type=offline` + `prompt=consent`. `state` là JWT ký bằng `JWT_ACCESS_SECRET` (type `gmail_oauth`, hạn 10 phút). Token lưu ở `User.gmailIntegration` (`select: false`); access token mới được ghi lại qua sự kiện `tokens`.
- Sync chống trùng bằng `Task.externalMessageId` (unique index một phần `{userId, externalMessageId}`) + khoá in-memory mỗi user (409 khi đang chạy). Hết quota AI → dừng, `quotaExhausted: true`.
- Lỗi Gmail **không** được trả 401/403 (frontend sẽ hiểu là mất phiên đăng nhập): dùng 400 + `data.code` (`GMAIL_NOT_CONNECTED`, `GMAIL_RECONNECT_REQUIRED`), 503 `GMAIL_NOT_CONFIGURED`, 409 `SYNC_IN_PROGRESS`.
- **Zalo extension** (`/zalo-extension`, MV3, JS thuần, không build): gọi `POST /zalo/webhook` và `GET /zalo/ping` bằng header `x-webhook-key`. Fetch từ service worker nhờ `host_permissions` nên không phụ thuộc CORS.

## Lịch chạy & nhắc việc

- `/api/cron/daily` (Vercel Cron, 1 lần/ngày) và `/api/cron/gmail-sync` (GitHub Actions mỗi 30 phút) — xác thực bằng `CRON_SECRET` (`Authorization: Bearer` hoặc `x-cron-secret`). Không có `CRON_SECRET` → 503.
- Email nhắc việc: `reminder.service.ts` + `mail.service.ts` (nodemailer, SMTP_*). Mỗi user tối đa 1 email/ngày (`lastDigestAt`). Tôn trọng `User.settings.emailDigest` / `autoGmailSync`.
- Mọi tính toán "hôm nay" / hạn chót tương đối dùng `APP_TIMEZONE` qua `src/utils/time.ts` — không dùng giờ máy chủ (Vercel chạy UTC).
- AI trả `suggestedDeadline` (Gemini ghi giờ địa phương `YYYY-MM-DDTHH:mm`, server đổi sang UTC); bản mock dùng `guessDeadline()`.

## Frontend

- Next.js 16 khác nhiều so với các bản cũ — đọc `frontend/node_modules/next/dist/docs/` trước khi dùng API mới (xem `frontend/AGENTS.md`).
- `cacheComponents` đang bật: không đọc `new Date()` / `localStorage` lúc render ở những phần được prerender; instant-navigation validation đặt `manual-warning` trong `next.config.ts`.
- Toàn bộ dashboard là client app: JWT lưu trong `localStorage` (`src/lib/auth-storage.ts`), guard ở `src/app/(dashboard)/layout.tsx`.
- Gọi API qua `src/lib/api.ts` (axios + tự refresh token, tự đăng xuất khi nhận `ACCOUNT_SUSPENDED` / `TRIAL_EXPIRED`) và các hook TanStack Query trong `src/lib/queries.ts`.
- UI dùng các primitive trong `src/components/ui/` (Button, Input, Modal, Toast…), không thêm thư viện UI.

## Lệnh thường dùng

Backend (`/backend`):
- `npm run dev` — chạy dev (tsx watch `src/main.ts`), port 8081.
- Vercel: entry `index.js` → `dist/serverless.js` (không `listen`, kết nối DB khi có request). Không đặt tên file `src/app.ts`, `src/server.ts`, `src/index.ts` — Vercel sẽ tự nhận làm entry và tự biên dịch TS.
- `npm run typecheck` — `tsc --noEmit`, phải 0 lỗi trước khi commit.
- `npm run build` / `npm start` — build ra `dist/` và chạy bản build.

Frontend (`/frontend`):
- `npm run dev` — `next dev -p 8080`.
- `npm run typecheck` / `npm run lint` / `npm run build`.

## Lưu ý môi trường dev

- Máy dev có sẵn MongoDB service ở `127.0.0.1:27017`. Khi test tự động / chạy MongoDB tạm, dùng port khác (vd `27999`) để không ghi vào database thật.
