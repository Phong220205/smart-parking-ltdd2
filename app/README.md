# APP SMART PARKING – React Native (Expo)

Ứng dụng di động cho đồ án LTDD2 – Bãi đỗ xe thông minh.

## 4 tab

| Tab | Nội dung |
|---|---|
| 🅿️ Bãi | Lưới 6 ô realtime (MQTT), đặt/hủy chỗ, xác nhận xe vào/ra, điều khiển barrier, cài đặt IP broker + mã sinh viên, nhật ký sự kiện |
| 🧾 Lịch sử | KPI tổng phí & lượt xe, danh sách hóa đơn tính phí, lịch sử đặt chỗ (tag OK/LỖI) |
| 📊 Thống kê | 4 KPI + biểu đồ cột doanh thu 7 ngày + biểu đồ đường doanh thu theo giờ + thanh ngang top người dùng (tự vẽ bằng `View`, không cần thư viện chart) |
| 👤 Tài khoản | Đăng ký / đăng nhập (JWT), xem thông tin tài khoản, đăng xuất |

## Chạy

```bash
cd app
npm install
npx expo start
```

- Điện thoại: cài **Expo Go** → quét QR.
- Trong app vào tab **⚙️ Cài đặt** (biểu tượng bánh răng) → sửa `MQTT WebSocket` thành `ws://<IP-máy-chạy-Broker>:9001`.
- Điền **mã sinh viên** (VD `SV01`) để phân biệt ai đặt chỗ.
- Kéo xuống để refresh dữ liệu.

> Lấy IP máy Windows: `ipconfig` → dòng *IPv4 Address* (VD `192.168.1.10`).

## Cấu trúc

| File | Vai trò |
|---|---|
| `index.js` | Điểm vào, đăng ký `App` |
| `src/App.js` | Toàn bộ UI 4 tab + logic MQTT |
| `src/parkingMqtt.js` | Kết nối MQTT qua WebSocket, subscribe 8 topic, reconnect 2s, sinh `requestId` |
| `src/api.js` | Gọi REST API của Backend (thống kê, lịch sử, tài khoản) |
| `metro.config.js` | Bắt buộc: cấu hình `resolverMainFields: ["browser","module","main"]` để thư viện `mqtt` dùng bản browser (bản Node sẽ lỗi `require("url")`) |

## ⚠️ Lưu ý quan trọng về `mqtt` + React Native

Thư viện `mqtt@5` xuất bản cho cả Node.js và trình duyệt. Bản Node (`build/index.js`) dùng `require("url")`, `require("net")`, `require("tls")` — **không có trong React Native**, gây lỗi:

```
Error: Unable to resolve module url from node_modules/mqtt/build/lib/connect/index.js
```

Cách khắc phục (đã áp dụng trong `metro.config.js`): ưu tiên `browser` field trong `package.json` của thư viện khi Metro resolve.

## Kiểm chứng

```bash
npx expo export --platform android
# -> Android Bundled 7810ms (552 modules)
# -> index-6f95fcffa2dc24413e46f0bc0e4c9355.hbc (2.17 MB)
```

## Xử lý lỗi đã tích hợp

- **Chống trùng đặt chỗ**: mỗi lệnh gửi kèm `requestId`; chỉ khi nhận `booking/<ID>/state` có **cùng `requestId`** mới báo thành công.
- **Timeout 5 giây**: không nhận phản hồi → popup "Timeout – kiểm tra IP Broker".
- **Banner ONLINE/OFFLINE** + tự reconnect 2 giây.
- **Parse JSON an toàn**: `try/catch` bỏ qua payload rác.
