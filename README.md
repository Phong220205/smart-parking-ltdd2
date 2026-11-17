# ĐỒ ÁN LTDD2 – BÃI ĐỖ XE THÔNG MINH (SMART PARKING)
Mô phỏng 100% – không cần phần cứng thật.

[![CI - Smart Parking](https://github.com/Phong220205/smart-parking-ltdd2/actions/workflows/ci.yml/badge.svg)](https://github.com/Phong220205/smart-parking-ltdd2/actions/workflows/ci.yml)
![Tests](https://img.shields.io/badge/tests-39%2F39%20PASS-brightgreen)
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
# 0) Sinh chứng thư TLS (chỉ 1 lần, cho broker mã hoá)
python broker/make_certs.py

# 1) Broker (cần Docker) - mở 4 cổng: 1883/9001/8883 TLS/9002 WSS
cd broker; docker compose up -d; docker compose logs -f

# 2) Giả lập ESP32 + xe ra vào (cần Python)
pip install paho-mqtt
python simulator/parking_simulator.py --mode demo     # tự có xe ra vào
python simulator/parking_simulator.py --mode quiet    # đứng yên, App điều khiển
python simulator/parking_simulator.py --mode chaos   # test mất mạng/đặt trùng
python simulator/parking_simulator.py --mode demo --tls   # bản mã hoá (MQTT/TLS 8883)

# 3) Backend + Web Dashboard (cần Node)
cd backend; npm install; npm start
# http://localhost:3000  → Web Dashboard 5 tab

# 4) App (cần Node + Expo Go trên điện thoại)
cd app; npm install; npx expo start
# Điện thoại quét QR Expo Go, dán link server trong tab Cài đặt
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

### 4.1.1 Broker nội bộ (aedes) — xác thực, phân quyền và tự dò cổng

Khi `EMBED_BROKER=true` (mặc định), backend **nhúng** broker MQTT `aedes`
(`backend/mqttAuthBroker.js`) và expose nó qua `/mqtt`. Ở chế độ này:

| Đặc điểm | Chi tiết |
|---|---|
| **Bắt buộc xác thực** | Client phải gửi user/pass, nếu không broker trả `CONNACK 4 – Bad username or password` |
| Tài khoản | `esp32 / esp32123` (thiết bị, đọc+ghi `parking/#`) · `app / app123` (App: chỉ đọc + gửi lệnh) |
| **ACL theo topic** | App **không** publish được trạng thái ô → không thể giả mạo cảm biến |
| **Tự dò cổng trống** | Nếu cổng **1883 đã bị chiếm** (Mosquitto Docker, project khác…) broker chuyển sang cổng trống tiếp theo (1884, 1885…) |
| Báo cổng thật | `GET /api/health` → `{ "brokerPort": 1884, "brokerHost": "127.0.0.1" }` |
| Nhật ký xác thực | `GET /api/broker/auth-log` → ai đăng nhập, thành công/thất bại, topic bị ACL chặn |

> **Lưu ý khi chạy local**: nếu báo `brokerPort` khác 1883, hãy trỏ simulator/App
> vào cổng đó. Bộ test tự động (`simulator/test_suite.py`) đã tự đọc cổng này.

## 4.2 Cấu trúc App React Native (tách component/service)

```
app/src/
├── App.js                  (78 dòng)  – màn hình chính, CHỈ điều phối
├── components/
│   └── Tabs.js            (462 dòng)  – Header, TabBar + 4 tab component + StyleSheet
├── hooks/
│   └── useParking.js      (182 dòng)  – logic MQTT realtime + REST + state
├── parkingMqtt.js         (116 dòng)  – service MQTT WebSocket
├── api.js                  (65 dòng)  – service REST
├── constants.js            (33 dòng)  – hằng số dùng chung
└── utils.js                (40 dòng)  – hàm thuần (format, tính phí)
```

| Tầng | Quy tắc |
|---|---|
| **View** (`components/Tabs.js`) | Chỉ render + `props.onXxx()`, **không** gọi mạng, **không** chứa logic nghiệp vụ |
| **Logic** (`hooks/useParking.js`) | Kết nối MQTT, parse event, state, timeout, chống trùng `requestId` — không biết view |
| **Service** (`parkingMqtt.js`, `api.js`) | Giao tiếp mạng, trả dữ liệu thuần, không phụ thuộc React |
| **Shared** (`constants.js`, `utils.js`) | Hằng số + hàm thuần, không side-effect, test được |

> Trước khi tách `App.js` dài **584 dòng** (lẫn view + logic) → sau khi tách còn **78 dòng**.

## 4.3 Bảo mật Broker (Lab2) + mã hoá TLS

| Yêu cầu | Hiện thực |
|---|---|
| Xác thực người dùng | `password_file` + `allow_anonymous false` → user `esp32`, `app` |
| Phân quyền topic | `acl.conf` – App chỉ đọc topic trạng thái, chỉ ghi topic lệnh |
| **Mã hoá** | 2 listener TLS: **8883** (MQTT/TLS) + **9002** (WebSocket/TLS) |
| Chứng thư | `broker/make_certs.py` tự sinh CA + server (RSA-2048, SHA-256, SAN + AKI/SKI) |
| Nhật ký | `log_type all` + `connection_messages true` |

```powershell
python broker/make_certs.py       # sinh chứng thư (1 lần)
python simulator/test_tls.py      # → KET QUA TLS: 5/5 PASS
```

Bật TLS ở firmware: đổi `#define MQTT_USE_TLS 1`.
Bật TLS ở App: tab ⚙️ Cài đặt → chế độ **🔒 wss:// (TLS)**.

## 4.4 Kiểm thử tự động (Automated E2E Test Suite)

```powershell
python simulator/test_suite.py
```

Bộ test chạy **39 checkpoint** end-to-end xuyên suốt Broker → Simulator → Backend → Dashboard:

```
KET QUA: 39/39 PASS
```

- Tự bật/tắt simulator ở chế độ `quiet` (tự thu hồi tiến trình khi kết thúc).
- Tự sinh tài khoản thử nghiệm không trùng lặp → chạy lại nhiều lần vẫn PASS.
- Bao phủ: hạ tầng · chống trùng đặt chỗ · vòng đời xe · tính phí · barrier ·
  thống kê · xác thực 401 · validate input · lịch sử · **bridge MQTT-WS 2 chiều** ·
  **Broker TLS 8883 + WSS 9002 + từ chối CA sai** · Dashboard 5 tab · SSE.

**CI tự động trên GitHub Actions** (`.github/workflows/ci.yml`): mỗi lần push sẽ
tự sinh chứng thư TLS, dựng Mosquitto (4 listener) + Backend, chạy đủ 39 checkpoint
+ `test_tls.py` (5/5), đồng thời kiểm tra syntax firmware, **5 file backend**,
**3 file Python simulator** và **7 file JSX** của App.

### Bảo mật & vận hành
- **Xác thực**: token ký HMAC-SHA256, header `Authorization: Bearer <token>`, hạn 7 ngày.
- **Mật khẩu**: lưu dạng hash SHA-256, không lưu bản rõ.
- **Rate limit**: 120 request / phút / IP → trả `429 Too Many Requests`.
- **Validate input**: mã ô phải khớp `P1..P6`, `action` phải thuộc danh sách cho phép,
  username chỉ gồm chữ/số/`_.-`, tên & biển số được lọc ký tự và cắt ngắn.
- **404 JSON** cho mọi endpoint `/api` không tồn tại, **500 JSON** khi lỗi server.

## 4.1 Kiểm thử tự động & CI

```powershell
# Chạy toàn bộ 39 checkpoint end-to-end (tự bật/tắt simulator)
python simulator/test_suite.py
# → KET QUA: 39/39 PASS
```

Repo có sẵn **GitHub Actions** (`.github/workflows/ci.yml`) tự động:
1. Kiểm tra syntax firmware, 5 file backend, 3 file Python simulator, 7 file JSX của app.
2. Dựng Mosquitto + Backend (`EMBED_BROKER=false` để dùng đúng broker có TLS)
   → chạy `test_suite.py` → **39/39 PASS** → chạy `test_tls.py` → **5/5 PASS**.
3. Đóng gói log backend làm artifact.

Mỗi lần `git push` lên `master` → CI tự chạy, có huy hiệu xanh trên trang repo.
> *Lưu ý (17/11/2026): trước đây workflow có lỗi YAML khiến CI báo failure sau 0 giây
> mà **không chạy checkpoint nào** — badge "PASS" là không trung thực. Đã sửa và kiểm
> chứng lại bằng log thật: **39/39 PASS + TLS 5/5 PASS**.*

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
.github/     CI: tự động kiểm thử 39 checkpoint mỗi lần push
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
