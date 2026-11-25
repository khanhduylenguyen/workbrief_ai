# WorkBrief AI

Web ghi chú & tóm tắt công việc bằng AI: dán nội dung email / tin nhắn Zalo, AI (Gemini) tóm tắt thành đầu việc kèm checklist, mức ưu tiên; theo dõi tiến độ trên Dashboard. Admin cấp tài khoản dùng thử (số ngày + AI quota).

```
WorkBriefAI/
├── backend/         # REST API — Express + TypeScript + MongoDB          → http://localhost:8081/api
├── frontend/        # Web app — Next.js (App Router) + Tailwind + TanStack Query → http://localhost:8080
└── zalo-extension/  # Chrome Extension (Manifest V3) gửi tin nhắn Zalo Web vào WorkBrief AI
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
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | – | Bật kết nối Gmail (xem mục **Cấu hình Gmail OAuth**) |
| `GOOGLE_REDIRECT_URI` | – | Mặc định `http://localhost:8081/api/integrations/gmail/callback` |
| `FRONTEND_URL` | – | Mặc định `http://localhost:8080` (nơi quay về sau khi cấp quyền Google) |
| `GMAIL_SYNC_LABEL` / `GMAIL_SYNC_MAX_MESSAGES` / `GMAIL_SYNC_NEWER_THAN_DAYS` | – | Mặc định `WorkBrief` / `10` / `7` |
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

## Deploy Backend lên Vercel

Backend chạy dạng serverless trên Vercel qua `backend/index.js` → `dist/serverless.js` (được build bằng `npm run build`).
Vercel **không** tự biên dịch TypeScript trong `src/` (entry dev đã đổi tên thành `src/main.ts`, `src/createApp.ts` để Vercel không tự nhận).
Kết nối MongoDB và seed Admin chạy ở request đầu tiên của mỗi instance.

Cấu hình project trên Vercel:

| Mục | Giá trị |
|-----|---------|
| Root Directory | `backend` |
| Framework Preset | Express (tự nhận) |
| Build Command | `npm run build` (mặc định) |

Environment Variables (Settings → Environment Variables):

| Biến | Giá trị ví dụ |
|------|---------------|
| `NODE_ENV` | `production` |
| `MONGODB_URI` | chuỗi kết nối Atlas (kèm `/workbrief_ai`) |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | 2 chuỗi ngẫu nhiên ≥ 32 ký tự, khác nhau |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | tài khoản Admin |
| `CORS_ORIGINS` | domain frontend, vd `https://<frontend>.vercel.app` (nhiều domain cách nhau dấu phẩy) |
| `PUBLIC_API_URL` | `https://<backend>.vercel.app` |
| `FRONTEND_URL` | `https://<frontend>.vercel.app` |
| `GEMINI_API_KEY`, `AI_MOCK_FALLBACK` | tuỳ chọn |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | tuỳ chọn (Gmail) |
| `GOOGLE_REDIRECT_URI` | `https://<backend>.vercel.app/api/integrations/gmail/callback` (thêm cả URI này trong Google Cloud) |

MongoDB Atlas → **Network Access** phải cho phép IP của Vercel (thường là `0.0.0.0/0`, vì Vercel không có IP cố định).

Frontend deploy riêng (Root Directory `frontend`) với `NEXT_PUBLIC_API_URL=https://<backend>.vercel.app/api`.

## Nhắc việc qua email & tác vụ theo lịch

- **Email nhắc việc mỗi sáng**: danh sách việc quá hạn / đến hạn hôm nay / ngày mai (không có thì không gửi). Người dùng bật/tắt ở trang **Hồ sơ** và có nút **Gửi thử**.
- **Tự động đồng bộ Gmail**: quét email mới của các tài khoản đã kết nối (bật/tắt ở **Hồ sơ** hoặc **Gmail & Zalo**).

Cấu hình (backend):

| Biến | Ví dụ |
|------|-------|
| `CRON_SECRET` | chuỗi ngẫu nhiên dài; bắt buộc để bật `/api/cron/*` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE` | Gmail: `smtp.gmail.com`, `465`, `true` |
| `SMTP_USER`, `SMTP_PASS` | Gmail + **App Password** (myaccount.google.com → Security → 2-Step Verification → App passwords) |
| `MAIL_FROM` | `WorkBrief AI <ban@gmail.com>` |
| `APP_TIMEZONE` | `Asia/Ho_Chi_Minh` (mặc định) |

Lịch chạy:

- **Vercel Cron** (`backend/vercel.json`): `GET /api/cron/daily` lúc 01:00 UTC (≈ 08:00 giờ VN) — gửi email nhắc việc + đồng bộ Gmail. Vercel tự gửi header `Authorization: Bearer <CRON_SECRET>`. Gói Hobby chỉ cho chạy **1 lần/ngày**.
- **GitHub Actions** (`.github/workflows/gmail-sync.yml`): gọi `POST /api/cron/gmail-sync` **mỗi 30 phút**. Cần thêm 2 repository secret: `BACKEND_URL` (vd `https://backend-dy-08b7.vercel.app`) và `CRON_SECRET` (trùng giá trị trên Vercel). Chưa có secret thì workflow tự bỏ qua.

Gọi tay để thử: `curl -X POST https://<backend>/api/cron/gmail-sync -H "Authorization: Bearer <CRON_SECRET>"`.

## Telegram bot (một lần)

1. Trên Telegram, nhắn **@BotFather** → `/newbot` → đặt tên (vd `WorkBrief AI`) và username kết thúc bằng `bot` (vd `WorkBriefAIBot`). BotFather trả về **token**.
2. Thêm vào backend (Vercel → Environment Variables, và `backend/.env` nếu chạy local):
   - `TELEGRAM_BOT_TOKEN` = token từ BotFather
   - `TELEGRAM_BOT_USERNAME` = username bot, không có `@`
   - `TELEGRAM_WEBHOOK_SECRET` = chuỗi ngẫu nhiên ≥ 16 ký tự
   Rồi **Redeploy**.
3. Đăng nhập Admin → trang **Quản trị** → **Cài webhook Telegram** (Telegram chỉ gọi webhook qua HTTPS, nên cần backend đã deploy; `PUBLIC_API_URL` phải là `https://…`).
4. Người dùng: trang **Kết nối** → **Kết nối Telegram** → Telegram mở chat với bot → bấm **Start**.
5. Gửi / chuyển tiếp cho bot: tin nhắn, ảnh, PDF, tin nhắn thoại → AI tạo công việc (nguồn `TELEGRAM`) và trả lời ngay trong chat. Lệnh: `/status`, `/unlink`, `/help`.

Microsoft Teams chưa hỗ trợ (cần đăng ký Azure Bot + Microsoft 365).

## AI đọc ảnh / PDF / ghi âm

- Modal **Tạo việc nhanh với AI** → **Đọc ảnh / PDF / ghi âm**: ảnh chụp tin nhắn, giấy ghi chú, file PDF, file ghi âm → AI chép nội dung và điền sẵn tiêu đề, tóm tắt, checklist, hạn chót.
- Trang **Họp → Việc** (`/meetings`): ghi âm ngay trên trình duyệt (tối đa 12 phút), tải file ghi âm / ảnh biên bản / PDF hoặc dán ghi chép → AI tách **nhiều việc**, tự khớp người giao với danh bạ → chọn, chỉnh rồi **tạo hàng loạt** (nguồn `MEETING`).
- Cần `GEMINI_API_KEY` (chế độ mẫu chỉ hỗ trợ ghi chép dạng văn bản). Mỗi lần xử lý = 1 lượt AI. Giới hạn file 3 MB khi tải từ trình duyệt (ảnh được tự thu nhỏ; ghi âm ≈ 12 phút ở 32 kbps) do giới hạn 4.5 MB/request của Vercel; file qua Telegram tối đa 10 MB.

## Cấu hình Gmail OAuth (một lần)

1. Vào [Google Cloud Console](https://console.cloud.google.com/) → tạo project.
2. **APIs & Services → Library** → bật **Gmail API**.
3. **OAuth consent screen**: chọn *External*, điền tên app, thêm scope `.../auth/gmail.readonly`, thêm Gmail của bạn vào **Test users** (khi app còn ở chế độ *Testing*).
4. **Credentials → Create credentials → OAuth client ID** → *Web application*:
   - Authorized redirect URI: `http://localhost:8081/api/integrations/gmail/callback`
5. Copy **Client ID** / **Client secret** vào `backend/.env` (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`) rồi khởi động lại backend.
6. Trên web: **Gmail & Zalo → Kết nối Gmail** → cấp quyền → **Đồng bộ Gmail ngay**.

Đồng bộ đọc email trong `GMAIL_SYNC_NEWER_THAN_DAYS` ngày **gửi từ email đồng nghiệp trong Danh bạ** hoặc **có nhãn `WorkBrief`**,
tối đa `GMAIL_SYNC_MAX_MESSAGES` email/lần. Mỗi email mới tốn 1 lượt AI; email đã đồng bộ được nhận diện qua `Task.externalMessageId` nên không tạo trùng.

## Chrome Extension Zalo (`/zalo-extension`)

`chrome://extensions` → bật **Developer mode** → **Load unpacked** → chọn thư mục `zalo-extension`.
Dán Webhook URL + `x-webhook-key` (trang **Gmail & Zalo**) vào popup → **Kiểm tra kết nối** → **Lưu**.
Trên `chat.zalo.me`: bôi đen tin nhắn → chuột phải → **Gửi vào WorkBrief AI**. Chi tiết: [zalo-extension/README.md](zalo-extension/README.md).

## Frontend — các trang

| Route | Mô tả |
|-------|-------|
| `/login` | Đăng nhập JWT; thông báo riêng khi tài khoản bị khóa / hết hạn dùng thử |
| `/` | Dashboard: 4 thẻ thống kê, tỷ lệ hoàn thành, việc sắp đến hạn, ghi chú gần đây |
| `/tasks` | Lọc trạng thái / nguồn / tìm kiếm; modal **Tạo việc nhanh với AI**; tick checklist; Mail/Zalo người giao; chốt Hoàn thành / Chưa hoàn thành |
| `/colleagues` | Danh bạ sếp & đồng nghiệp + liên hệ nhanh |
| `/integrations` | Trạng thái Gmail, Zalo webhook key (copy / tạo mới), giả lập tin nhắn Zalo |
| `/admin` | Chỉ ADMIN: cấp tài khoản dùng thử, `+7 ngày`, `Reset AI`, `Khóa / Mở khóa` |
| `/profile` | Hồ sơ: đổi họ tên, **đổi mật khẩu**, bật/tắt email nhắc việc & tự động đồng bộ Gmail |
| `/calendar` | **Lịch** tháng theo hạn chót; kéo thả thẻ sang ngày khác để dời hạn (giữ giờ), kéo việc chưa có hạn vào lịch (17:00); mobile hiển thị dạng danh sách |
| `/assistant` | **Trợ lý AI**: hỏi đáp về công việc của bạn ("việc nào quá hạn?", "chị Hương giao gì?"), có thẻ việc liên quan để mở nhanh |
| `/reports` | **Báo cáo tuần** do AI viết (hoàn thành / chưa xong & lý do / rủi ro / kế hoạch tuần tới), sửa được, copy hoặc gửi email |

Trên mỗi thẻ công việc có nút **Soạn phản hồi**: AI soạn tin trả lời người giao việc (xác nhận, báo tiến độ, báo hoàn thành, xin lùi hạn, hỏi lại) cho Email hoặc Zalo; người dùng xem/sửa rồi tự gửi. Mỗi lần dùng AI (tóm tắt, báo cáo, soạn phản hồi, hỏi trợ lý) tốn 1 lượt quota.

AI tự đọc **hạn chót** trong nội dung ("trước 3h chiều nay", "thứ 6", "25/11"…) theo `APP_TIMEZONE` và điền sẵn Deadline (modal tạo việc, Zalo webhook, đồng bộ Gmail).

## API chính

Mọi response: `{ success, data, message }`. Các route (trừ login/refresh/health/webhook) cần header `Authorization: Bearer <accessToken>`.

### Auth — `/api/auth`
| Method | Path               | Mô tả                                   |
|--------|--------------------|-----------------------------------------|
| POST   | `/login`           | `{ email, password }` → user + tokens   |
| POST   | `/refresh`         | `{ refreshToken }` → cặp token mới      |
| POST   | `/logout`          | Vô hiệu mọi token hiện có của user      |
| GET    | `/me`              | Thông tin tài khoản + quota             |
| PATCH  | `/me`              | `{ fullName?, settings?: { emailDigest?, autoGmailSync? } }` |
| POST   | `/me/test-reminder`| Gửi ngay email nhắc việc (thử SMTP)     |
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
| POST   | `/ai-summarize-file`          | `{ file: { mimeType, data(base64), filename? }, source?, note? }` → bản nháp + `extractedText` |
| POST   | `/bulk`                       | `{ tasks: [...] }` (tối đa 20) — tạo nhiều việc một lần       |
| POST   | `/:id/draft-reply`            | `{ tone: CONFIRM\|PROGRESS\|DONE\|DELAY\|QUESTION, channel: EMAIL\|ZALO, note? }` → `{ subject, body }` |
| GET    | `/calendar`                   | `?from=&to=` (≤ 62 ngày) → `{ scheduled, unscheduled }`       |

### AI — `/api/ai`
| Method | Path              | Mô tả |
|--------|-------------------|-------|
| POST   | `/weekly-report`  | `{ weekOffset: 0 \| -1 … -12 }` → `{ range, stats, report }` |
| POST   | `/assistant`      | `{ question, history? }` → `{ answer, tasks }` |
| POST   | `/meeting`        | `{ file?, text?, note? }` → `{ meetingTitle, summary, transcript, decisions, tasks }` (chưa lưu) |

Integrations: `POST /integrations/telegram/link` (deep link 15 phút), `POST /integrations/telegram/unlink`, `POST /integrations/telegram/webhook` (Telegram gọi, xác thực header `X-Telegram-Bot-Api-Secret-Token`). Admin: `GET /admin/telegram`, `POST /admin/telegram/setup`.

### Colleagues — `/api/colleagues`
CRUD: `GET /`, `POST /`, `GET /:id`, `PATCH /:id`, `DELETE /:id`.

### Integrations — `/api/integrations`
| Method | Path                     | Mô tả                                                       |
|--------|--------------------------|-------------------------------------------------------------|
| GET    | `/overview`              | Trạng thái Gmail, Zalo webhook key/URL, số task theo nguồn  |
| GET    | `/gmail/connect`         | Trả `{ url }` trang cấp quyền Google (frontend chuyển hướng tới) |
| GET    | `/gmail/callback`        | Google redirect về (không cần JWT, xác thực bằng `state` đã ký) → lưu token → quay về `/integrations` |
| POST   | `/gmail/sync`            | Đọc email mới → AI tóm tắt → tạo Task `GMAIL` (bỏ qua email đã đồng bộ) |
| POST   | `/gmail/disconnect`      | Thu hồi token tại Google và xoá khỏi DB                     |
| POST   | `/zalo/regenerate-key`   | Tạo webhook key mới                                         |
| GET    | `/zalo/ping`             | Header `x-webhook-key`; kiểm tra key, không tốn lượt AI (dùng cho extension) |
| POST   | `/zalo/webhook`          | Header `x-webhook-key`; body `{ message, senderName?, senderPhone?, groupName? }` → AI tóm tắt + lưu Task |
