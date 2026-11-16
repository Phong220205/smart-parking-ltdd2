# ĐỒ ÁN LTDD2 – BÃI ĐỖ XE THÔNG MINH (SMART PARKING)
Mô phỏng 100% – không cần phần cứng thật.

[![CI - Smart Parking](https://github.com/Phong220205/smart-parking-ltdd2/actions/workflows/ci.yml/badge.svg)](https://github.com/Phong220205/smart-parking-ltdd2/actions/workflows/ci.yml)
![Tests](https://img.shields.io/badge/tests-38%2F38%20PASS-brightgreen)
![License](https://img.shields.io/badge/LTDD2-Tr%C4%B0%E1%BB%9D%20H%E1%BB%8C%20%C4%90%E1%BA%A4NG%20%C3%81-blue)

**Server cloud đã deploy**: https://smart-parking-ltdd2.onrender.com  
(Mở trực tiếp = Web Dashboard 5 tab. App React Native chỉ cần dán link này là chạy.)

## 1. Kiến trúc
```
[ESP32 thật / Wokwi / simulator Python]  <--MQTT 1883-->  [Mosquitto Broker]
   6 ô P1..P6 (IR), RFID RC522, Servo barrier, OLED SSD1306
   WiFi + MQTT + LWT + reconnect + tính phí                    |
                                                                 | <--MQTT WebSocket 9001--> [App React Native Expo]
                                                                 | <--REST 3000-----------------------> [Web Dashboard + App]
                                                                 v
                                                        [Backend Node/Express]
                                                        - lưu JSON bền vững
                                                        - REST + SSE realtime
                                                        - thống kê doanh thu
                                                        - đăng ký/đăng nhập
```

## 2. Topic MQTT (thống nhất toàn đồ án)

| Topic | Hướng | Retain | QoS | Payload mẫu |
|---|---|---|---|---|
| `parking/slot/<ID>/status` | ESP32 → App | YES | 1 | `{"id":"P1","occupied":false,"reservedBy":null,"currentUser":null,"updatedAt":123456}` |
| `parking/slots/snapshot` | ESP32/sim → App | YES | 1 | `{"slots":[...],"gate":"CLOSED","free":4,"revenue":6000,"ts":123}` |
| `parking/booking/<ID>/set` | App → ESP32 | NO | 1 | `{"slot":"P1","user":"SV01","action":"reserve","requestId":"abc"}` |
| `parking/booking/<ID>/state` | ESP32 → App | YES | 1 | `{"slot":"P1","state":"RESERVED","user":"SV01","requestId":"abc","ok":true,"msg":"..."}` |
| `parking/gate/barrier/cmd` | App → ESP32 | NO | 1 | `{"cmd":"OPEN","by":"SV01","requestId":"xyz"}` |
| `parking/gate/barrier/state` | ESP32 → App | YES | 1 | `{"gate":"OPEN","openedBy":"SV01","ts":123}` |
| `parking/gate/rfid` | ESP32 → App | NO | 0 | `{"card":"A1B2C3","slot":"P2","event":"ENTER","user":"SV01"}` |
| `parking/billing/receipt` | ESP32 → App | YES | 1 | `{"slot":"P2","user":"SV01","minutes":95,"fee":6000}` |
| `parking/system/status` | ESP32 → App | YES | 1 | `{"online":true}` (LWT tự publish `false` khi mất mạng) |
| `parking/system/heartbeat` | ESP32 → App | NO | 0 | `{"uptime":3600,"wifi":-58,"freeHeap":120000,"revenue":6000}` |

**Action hỗ trợ trên `parking/booking/<ID>/set`:** `reserve` · `cancel` · `enter` · `exit` · `stay`

**State trả về:** `RESERVED` · `FREE` · `OCCUPIED` · `ENTERED` · `EXPIRED` · `ERROR`

### Quy tắc chống trùng đặt chỗ (ăn điểm Lab2 + Lab3)
- ESP32/simulator là nguồn sự thật duy nhất. App chỉ gửi `set`, phải đợi `state` trả về có cùng `requestId` mới coi là thành công.
- Nếu 2 App cùng đặt P1: request đến trước thắng, request sau nhận `{"ok":false,"msg":"O da duoc dat boi SV01"}`.
- Booking tự hết hạn sau **5 phút** nếu xe không vào (`expiresAt` → publish `EXPIRED`).
- Token đăng nhập Backend ký bằng HMAC-SHA256 (`Authorization: Bearer <token>`).

### Quy tắc tính phí
- **30 phút đầu miễn phí**, sau đó **3000đ/giờ** (làm tròn lên).
- Công thức: `fee = 0` nếu `minutes <= 30`, ngược lại `ceil(minutes/60) * 3000`.

## 3. Chạy nhanh (không phần cứng)

```powershell
# 1) Broker (cần Docker)
cd broker; docker compose up -d; docker compose logs -f

# 2) Giả lập ESP32 + xe ra vào (cần Python)
pip install paho-mqtt
python simulator/parking_simulator.py --mode demo     # tự có xe ra vào
python simulator/parking_simulator.py --mode quiet    # đứng yên, App điều khiển
python simulator/parking_simulator.py --mode chaos   # test mất mạng/đặt trùng

# 3) Backend + Web Dashboard (cần Node)
cd backend; npm install; npm start
# http://localhost:3000  → Web Dashboard 5 tab

# 4) App (cần Node + Expo Go trên điện thoại)
cd app; npm install; npx expo start
# Điện thoại quét QR Expo Go, chỉnh IP broker trong tab Cài đặt
```

### Lệnh điều khiển Simulator từ console (mode `quiet`)
```
BOOK:P1:SV01     # đặt chỗ
CANCEL:P1:SV01   # hủy đặt
ENTER:P1:SV01    # xe vào
EXIT:P1          # xe ra (tính phí)
STAY:P1:95       # giả lập xe đã đứng 95 phút (để demo tính phí 6000đ)
GATE:OPEN / GATE:CLOSE
RFID:A1B2C3      # giả quẹt thẻ
```

### Lệnh điều khiển ESP32 từ Serial Monitor (Wokwi)
```
RFID:A1B2C3
BOOK:P1:SV01
CANCEL:P1:SV01
ENTER:P1:SV01
EXIT:P1
GATE:OPEN / GATE:CLOSE
DEMO            # bật/tắt chế độ xe tự ra vào
```

## 4. REST API Backend

| Method | Endpoint | Công dụng |
|---|---|---|
| GET | `/api/health` | Kiểm tra Backend + MQTT |
| GET | `/api/health/deep` | Sức khỏe hệ thống: uptime, số liệu, bộ nhớ, counters |
| GET | `/api/status` | Sơ đồ realtime (6 ô + gate + doanh thu) |
| GET | `/api/slots` | Trạng thái từng ô |
| GET | `/api/stats` | Thống kê doanh thu 7 ngày, theo giờ, top user |
| GET | `/api/receipts?limit=` | Lịch sử hóa đơn |
| GET | `/api/bookings?limit=` | Lịch sử đặt chỗ |
| GET | `/api/rfid` | Log thẻ RFID |
| GET | `/api/events` | Log sự kiện |
| GET | `/api/stream` | **SSE** – đẩy dữ liệu realtime xuống Dashboard |
| POST | `/api/booking` | Đặt / hủy chỗ (chuyển tiếp MQTT) |
| POST | `/api/gate` | Mở / đóng barrier |
| POST | `/api/enter` | Xác nhận xe vào |
| POST | `/api/exit` | Xác nhận xe ra (tính phí) |
| POST | `/api/auth/register` | Đăng ký tài khoản |
| POST | `/api/auth/login` | Đăng nhập → token |
| GET | `/api/auth/me` | Thông tin user (cần Bearer token) |
| GET | `/api/users` | Danh sách user + lượt xe + chi tiêu |
| POST | `/api/balance` | Nạp tiền ví (cần Bearer token) |

Dữ liệu lưu ở `data/parking.json` (tự tạo, không cần database).

### Bảo mật & độ bền của REST API
| Cơ chế | Chi tiết |
|---|---|
| **JWT token** | Ký HMAC-SHA256, hạn 7 ngày, gửi qua `Authorization: Bearer <token>` |
| **Hash mật khẩu** | SHA-256, không lưu bản rõ |
| **Rate limit** | 120 request/phút mỗi IP (sliding window) → trả `429` khi vượt |
| **Validate input** | Mã ô chỉ `P1..P6`, `action` chỉ trong allowlist, tên đăng nhập 3–32 ký tự, chống ký tự `<>` |
| **404 / 500 JSON** | Mọi lỗi trả về JSON chuẩn `{ok:false, error}` |
| **Request log** | Ghi log mọi request kèm status + thời gian xử lý |

## 4.1 MQTT-over-WebSocket Bridge (App ↔ Broker qua 1 URL duy nhất)

**Vấn đề:** App React Native chỉ nối được MQTT qua WebSocket (`ws://`/`wss://`).
Broker public `test.mosquitto.org` mở cổng **1883** + **443** nhưng **không bật
WebSocket 8084** → App không kết nối được broker cloud.

**Giải pháp:** `backend/mqttWsBridge.js` — Backend làm proxy MQTT-over-WebSocket:

```
App --wss://smart-parking-ltdd2.onrender.com/mqtt--> BRIDGE --mqtt://test.mosquitto.org:1883--> Broker
```

| Đặc điểm | Chi tiết |
|---|---|
| 1 kết nối MQTT duy nhất | Bridge chia sẻ cho N App → không tạm quá tải broker |
| Chuẩn MQTT 3.1.1 | CONNECT / SUBSCRIBE / UNSUBSCRIBE / PUBLISH / PINGREQ / DISCONNECT |
| Lọc topic theo client | Mỗi App chỉ nhận topic **nó đã subscribe** (không rò rỉ dữ liệu) |
| Tự phát lại (retain) | App mới mở app → nhận ngay trạng thái hiện tại |
| Cache message | Giữ topic→payload mới nhất để phục vụ client mới |
| Xem trạng thái | `GET /api/bridge` → số client, topic đang subscribe, cache, trạng thái upstream |

**Trong App chỉ cần nhập 1 dòng** (tab ⚙️ Cài đặt kết nối → Link server):
```
https://smart-parking-ltdd2.onrender.com
```
App tự suy ra REST (`/api/...`) và MQTT-WS (`wss://.../mqtt`).

Test bridge 2 chiều:
```powershell
node backend/test_bridge.js wss://smart-parking-ltdd2.onrender.com/mqtt
# → === KET QUA: BRIDGE HOAT DONG (2 chieu) ===
```

## 4.2 Kiểm thử tự động (Automated E2E Test Suite)

```powershell
python simulator/test_suite.py
```

Bộ test chạy **38 checkpoint** end-to-end xuyên suốt Broker → Simulator → Backend → Dashboard:

```
KET QUA: 38/38 PASS
```

- Tự bật/tắt simulator ở chế độ `quiet` (tự thu hồi tiến trình khi kết thúc).
- Tự sinh tài khoản thử nghiệm không trùng lặp → chạy lại nhiều lần vẫn PASS.
- Bao phủ: hạ tầng · chống trùng đặt chỗ · vòng đời xe · tính phí · barrier ·
  thống kê · xác thực 401 · validate input · lịch sử · **bridge MQTT-WS 2 chiều** ·
  Dashboard 5 tab · SSE.

**CI tự động trên GitHub Actions** (`.github/workflows/ci.yml`): mỗi lần push sẽ
tự dựng Mosquitto + Backend + chạy đủ 36 checkpoint, đồng thời kiểm tra syntax
firmware, backend và bundle JSX của App React Native.

### Bảo mật & vận hành
- **Xác thực**: token ký HMAC-SHA256, header `Authorization: Bearer <token>`, hạn 7 ngày.
- **Mật khẩu**: lưu dạng hash SHA-256, không lưu bản rõ.
- **Rate limit**: 120 request / phút / IP → trả `429 Too Many Requests`.
- **Validate input**: mã ô phải khớp `P1..P6`, `action` phải thuộc danh sách cho phép,
  username chỉ gồm chữ/số/`_.-`, tên & biển số được lọc ký tự và cắt ngắn.
- **404 JSON** cho mọi endpoint `/api` không tồn tại, **500 JSON** khi lỗi server.

## 4.1 Kiểm thử tự động & CI

```powershell
# Chạy toàn bộ 36 checkpoint end-to-end (tự bật/tắt simulator)
python simulator/test_suite.py
# → KET QUA: 36/36 PASS
```

Repo có sẵn **GitHub Actions** (`.github/workflows/ci.yml`) tự động:
1. Kiểm tra syntax firmware, backend, JSX của app.
2. Dựng Mosquitto + Backend → chạy `test_suite.py` → 36/36 PASS.
3. Đóng gói log backend làm artifact.

Mỗi lần `git push` lên `master` → CI tự chạy, có huy hiệu xanh trên trang repo.

## 5. Giả lập thay phần cứng (để nộp Lab1)

- `esp32/parking_firmware.ino` : code thật, nạp là chạy. **Màn hình OLED SSD1306 128x64** (I2C SDA=D21, SCL=D22).
- `esp32/diagram.json` : mạch Wokwi — `board-ssd1306` + 6 nút + RFID + Servo + Buzzer.
  ⚠️ Bắt buộc dùng `board-ssd1306` (chân `VCC/SDA/SCL`) và ký hiệu chân ESP32 là `esp:D21` / `esp:D22` / `esp:3V3` / `esp:GND.1`.
  Dùng `wokwi-ssd1306` (đã deprecated) sẽ màn **không hiển thị**.
- `simulator/parking_simulator.py` : giả lập ESP32 + xe + RFID + barrier y hệt firmware, 3 mode demo/quiet/chaos.
- Ảnh minh chứng Wokwi + log simulator để dán vào báo cáo: xem `docs/MINH_CHUNG.md`.

## 6. Cấu trúc thư mục

```
esp32/       firmware ESP32 + diagram.json + libraries.txt (Wokwi)
broker/      Mosquitto Docker (1883 + 9001) + ACL phân quyền
backend/     Node/Express REST + SSE + Web Dashboard (public/index.html)
app/         React Native Expo – 4 tab: Bãi / Lịch sử / Thống kê / Tài khoản
simulator/   Python giả lập ESP32 + bộ kiểm thử tự động (test_suite.py)
docs/        Báo cáo, slide, kịch bản quay video, kết quả test
data/        parking.json (dữ liệu backend, tự sinh – không commit)
.github/     CI: tự động kiểm thử 36 checkpoint mỗi lần push
```

## 7. Link nộp (điền theo Phiếu chấm – mục I)

| Sản phẩm nộp | Link (sinh viên điền) |
|---|---|
| Mã nguồn React Native (Lab3) | ... |
| Mã nguồn / cấu hình Broker (Lab2) | ... |
| Mã nguồn ESP32 + sơ đồ mạch (Lab1) | ... |
| Mã nguồn Server | ... |
| Báo cáo Word/PDF | ... |
| Slide | ... |
| Video demo | ... |

Nhớ bật share "Anyone with the link".
