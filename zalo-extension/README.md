# WorkBrief AI – Zalo (Chrome Extension, Manifest V3)

Bôi đen tin nhắn sếp giao trên **Zalo Web** → chuột phải → **Gửi vào WorkBrief AI**. Extension gửi nội dung tới
webhook của WorkBrief AI, AI tóm tắt và tạo công việc (nguồn `ZALO`) trên web.

## Cài đặt (chế độ developer)

1. Mở `chrome://extensions` (hoặc `edge://extensions`).
2. Bật **Developer mode**.
3. Bấm **Load unpacked** → chọn thư mục `zalo-extension` này.
4. Popup cài đặt sẽ tự mở. Điền:
   - **API URL**: `http://localhost:8081/api/integrations/zalo/webhook`
   - **x-webhook-key**: copy từ trang **Gmail & Zalo** (`http://localhost:8080/integrations`)
   - **Địa chỉ Web App**: `http://localhost:8080`
5. Bấm **Kiểm tra kết nối** (gọi `GET /api/integrations/zalo/ping`, không tốn lượt AI) rồi **Lưu**.

## Sử dụng

1. Mở `https://chat.zalo.me` và đăng nhập.
2. Bôi đen đoạn tin nhắn (≥ 10 ký tự).
3. Chuột phải → **Gửi vào WorkBrief AI**.
4. Biểu tượng extension hiện `…` khi đang gửi, `✓` khi thành công, `!` khi lỗi. Có thông báo hệ thống; bấm vào để mở trang Công việc.

Mỗi lần gửi dùng 1 lượt AI của tài khoản. Webhook tự khớp người gửi với danh bạ đồng nghiệp nếu có thông tin.

## Tệp

| Tệp | Vai trò |
|-----|---------|
| `manifest.json` | Khai báo MV3, quyền `contextMenus`, `storage`, `notifications`, `scripting`; host `chat.zalo.me` + `localhost:8081` |
| `background.js` | Service worker: tạo menu chuột phải, đọc vùng chọn (giữ xuống dòng), POST tới webhook, thông báo kết quả |
| `popup.html` / `popup.js` | Cài đặt API URL + key, kiểm tra kết nối, lịch sử 10 lần gửi gần nhất |
| `icons/` | Icon 16/32/48/128 px |

## Ghi chú

- Key được lưu trong `chrome.storage.local` (chỉ trên máy này, không đồng bộ qua tài khoản Google).
- Nếu Backend chạy ở địa chỉ khác `localhost:8081`, khi bấm **Lưu** Chrome sẽ hỏi quyền truy cập địa chỉ đó.
- Ai có webhook key đều tạo được công việc và dùng lượt AI của bạn. Nếu lộ key, vào trang Gmail & Zalo → **Tạo key mới**.
