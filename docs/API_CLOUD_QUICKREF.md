# TRA CỨU NHANH — LINK SERVER CLOUD

> **Server:** https://smart-parking-ltdd2.onrender.com
> **Deploy:** commit `d52778a` · Render tự động build & deploy khi push lên `master`

---

## ⚠️ Hiểu đúng đường dẫn (quan trọng nhất)

Link gốc `/` **KHÔNG phải** REST API — nó là **Web Dashboard** (giao diện web 5 tab).
Đây là **thiết kế có chủ đích**, không phải lỗi:

| Đường dẫn | Trả về | Dùng khi |
|---|---|---|
| `/` | **Web Dashboard** (HTML) | GV muốn xem giao diện, thống kê, lịch sử |
| `/api` | **JSON** — danh sách 19 endpoint | Muốn biết có API nào |
| `/api/health` | **JSON** | Kiểm tra server còn sống không |
| `/api/status` | **JSON** — trạng thái 6 ô | Xem trạng thái bãi realtime |

> **Nếu bạn muốn thấy REST API** → mở `https://smart-parking-ltdd2.onrender.com/api`
> **Nếu bạn muốn thấy Dashboard** → mở `https://smart-parking-ltdd2.onrender.com/`

---

## Danh sách endpoint đầy đủ

### Hệ thống

| Method | Đường dẫn | Mô tả |
|---|---|---|
| GET | `/api` | **Danh sách endpoint** (mới thêm) |
| GET | `/api/health` | Kiểm tra sức khoẻ: MQTT, số slot, online |
| GET | `/api/health/deep` | Chẩn đoán sâu: uptime, Node, bộ nhớ, số liệu từng bảng |
| GET | `/api/version` | Phiên bản đang chạy (mã commit deploy) |
| GET | `/api/bridge` | Trạng thái MQTT-over-WebSocket bridge |
| GET | `/api/broker/auth-log` | **Nhật ký xác thực broker** (minh chứng Lab 2) |

### Trạng thái bãi

| Method | Đường dẫn | Mô tả |
|---|---|---|
| GET | `/api/status` | Toàn bộ: 6 ô + gate + doanh thu + online |
| GET | `/api/slots` | Chỉ trạng thái 6 ô |

### Lịch sử & thống kê

| Method | Đường dẫn | Mô tả |
|---|---|---|
| GET | `/api/receipts?limit=50` | Lịch sử hoá đơn tính phí |
| GET | `/api/bookings?limit=50` | Lịch sử đặt chỗ |
| GET | `/api/rfid` | Nhật ký quét thẻ RFID |
| GET | `/api/events` | Nhật ký sự kiện hệ thống |
| GET | `/api/stats` | Doanh thu 7 ngày · theo giờ · top user |

### Realtime

| Method | Đường dẫn | Mô tả |
|---|---|---|
| GET | `/api/stream` | **SSE** (`text/event-stream`) — đẩy `slots`/`gate`/`receipt`/`booking`/`rfid` |

### Điều khiển

| Method | Đường dẫn | Body | Mô tả |
|---|---|---|---|
| POST | `/api/booking` | `{"slot":"P1","user":"SV01","action":"reserve"}` | Đặt / huỷ chỗ |
| POST | `/api/gate` | `{"action":"OPEN"}` | Mở / đóng barrier |

### Tài khoản

| Method | Đường dẫn | Mô tả |
|---|---|---|
| POST | `/api/auth/register` | Đăng ký |
| POST | `/api/auth/login` | Đăng nhập → trả **JWT** |
| GET | `/api/auth/me` | Thông tin tài khoản (cần `Authorization: Bearer <token>`) |
| GET | `/api/users` | Danh sách người dùng |
| POST | `/api/logout` | Đăng xuất |

---

## Lệnh kiểm tra nhanh (PowerShell)

```powershell
# 1) Server còn sống?
curl.exe -s https://smart-parking-ltdd2.onrender.com/api/health

# 2) Danh sách endpoint
curl.exe -s https://smart-parking-ltdd2.onrender.com/api

# 3) Trạng thái 6 ô
curl.exe -s https://smart-parking-ltdd2.onrender.com/api/status

# 4) Đặt chỗ ô P5
curl.exe -s -X POST https://smart-parking-ltdd2.onrender.com/api/booking `
  -H "Content-Type: application/json" `
  -d '{"slot":"P5","user":"SV01","action":"reserve"}'

# 5) Mở barrier
curl.exe -s -X POST https://smart-parking-ltdd2.onrender.com/api/gate `
  -H "Content-Type: application/json" -d '{"action":"OPEN"}'

# 6) Thống kê
curl.exe -s https://smart-parking-ltdd2.onrender.com/api/stats

# 7) Nhật ký xác thực broker (minh chứng Lab 2)
curl.exe -s https://smart-parking-ltdd2.onrender.com/api/broker/auth-log
```

---

## Cấu hình cho App React Native

Trong app → tab **Bãi** → phần **Cài đặt**:

```
Chế độ:      🌐 Qua Backend (bridge)     ← khuyến nghị, không cần cùng mạng
Backend URL: https://smart-parking-ltdd2.onrender.com
```

App tự suy ra:
- REST → `https://smart-parking-ltdd2.onrender.com/api/...`
- MQTT → `wss://smart-parking-ltdd2.onrender.com/mqtt`

**Chế độ 🔌 Broker trực tiếp** (cần cùng WiFi):
```
Broker:    ws://<IP-máy-chạy-Docker>:9001/mqtt
User/Pass: app / app123
```

---

## Vì sao link gốc là Dashboard chứ không phải JSON?

| Lý do | Giải thích |
|---|---|
| **Trải nghiệm GV** | GV mở link → thấy **giao diện đẹp** với biểu đồ, sơ đồ bãi, lịch sử — ấn tượng hơn JSON |
| **1 URL cho mọi thứ** | Dashboard + REST + SSE + MQTT bridge đều trong 1 domain → App chỉ cần 1 ô cấu hình |
| **Render free** | Free tier ngủ (sleep) sau 15′ không có request → mở Dashboard cũng là 1 request → giữ server sống |
| **Chuẩn REST** | Theo chuẩn, `/` là tài nguyên chính (HTML), API nằm dưới prefix `/api` |

---

## Nếu server đang ngủ (sleep)

Render free tier tắt server sau ~15′ không có request. Triệu chứng: **lần mở đầu chậm 30–60 giây**.

**Cách xử lý:** truy cập bất kỳ endpoint nào để "đánh thức", ví dụ:

```powershell
curl.exe -s https://smart-parking-ltdd2.onrender.com/api/health
```

Sau đó trang sẽ tải bình thường.

> **Mẹo trình bày:** mở Dashboard **trước** khi lên trình bày 1–2 phút → không bị delay khi GV xem.

---

## Thông tin deploy hiện tại

| Thành phần | Giá trị |
|---|---|
| Nền tảng | Render (free tier) |
| Loại | Docker (dùng `backend/Dockerfile`) |
| Broker nội bộ | `embedded-aedes` (port 1883) |
| Broker ngoài | `mqtt://test.mosquitto.org:1883` |
| Bridge path | `/mqtt` |
| Node | v20.11.1 |
| Lưu trữ | `/tmp/parking.json` (bị xoá khi restart) |

**Kiểm tra phiên bản đang chạy:**

```powershell
curl.exe -s https://smart-parking-ltdd2.onrender.com/api/version
```

`build` phải khớp mã commit trên GitHub → xác nhận deploy thành công.

---

> **Tài liệu tra cứu nhanh — Smart Parking LTDD2** · cập nhật 23/11/2026
