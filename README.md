# ĐỒ ÁN LTDD2 – BÃI ĐỖ XE THÔNG MINH (SMART PARKING)
Mô phỏng 100% – không cần phần cứng thật.

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
simulator/   Python giả lập ESP32
docs/        Báo cáo, slide, kịch bản quay video, kết quả test
data/        parking.json (dữ liệu backend, tự sinh – không commit)
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
