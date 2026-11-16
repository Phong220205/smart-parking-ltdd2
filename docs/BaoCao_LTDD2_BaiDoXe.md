# BÁO CÁO ĐỒ ÁN LTDD2 – BÃI ĐỖ XE THÔNG MINH (SMART PARKING)
Nhóm: ............ | Lớp: ............ | GVHD: ............
Phiên bản 2.0 – nâng cấp đầy đủ cho đồ án kết thúc học phần.

---

## 1. Đặt vấn đề

Bãi xe thủ công thường gặp 4 vấn đề: (1) tài xế không biết ô nào còn trống, phải chạy vòng tìm; (2) tranh chỗ giờ cao điểm; (3) không có cơ chế giữ chỗ từ xa nên vẫn phải có người trực; (4) việc tính phí làm thủ công, dễ sai lệch và không có dữ liệu để quản lý.

Đề tài xây dựng hệ thống **giám sát bãi xe thông minh 6 ô (P1..P6)** hoạt động realtime: đèn báo ô trống, đặt giữ chỗ từ xa qua điện thoại, mở barrier bằng thẻ RFID, tính phí tự động theo thời gian gửi xe, và có bảng thống kê doanh thu phục vụ quản lý.

Toàn bộ hệ thống **được mô phỏng 100%** – không cần phần cứng thật, phù hợp yêu cầu mô phỏng của học phần.

## 2. Mục tiêu (khớp phiếu chấm)

| Lab | Mục tiêu | Thành phần đạt được |
|---|---|---|
| **Lab1 – ESP32** | Đọc 6 cảm biến IR, RFID RC522, Servo barrier, màn hình hiển thị, Buzzer; WiFi + MQTT có reconnect và LWT | `esp32/parking_firmware.ino` (565 dòng), mô phỏng trên Wokwi |
| **Lab2 – Broker** | Mosquitto Docker (1883 TCP + 9001 WebSocket), user/ACL phân quyền, QoS1 + retain, log CONNECT/PUBLISH, nhiều client đồng thời | `broker/` (docker-compose, mosquitto.conf, acl.conf, passwd) |
| **Lab3 – App** | Sơ đồ 6 ô realtime, đặt/hủy chỗ kèm requestId chống trùng, mở barrier, popup thanh toán, banner ONLINE/OFFLINE + tự nối lại, timeout 5s | `app/` React Native Expo – 4 tab |
| **Server** | Cầu nối MQTT ↔ REST, lưu trữ, thống kê | `backend/` Node/Express + Web Dashboard 5 tab |
| **Nâng cấp** | Tài khoản, ví tiền, thống kê doanh thu, lịch sử, realtime push | JWT token, JSON store, SSE, Chart.js |

## 3. Kiến trúc hệ thống

```
┌─────────────────────────┐
│  ESP32 (thật / Wokwi)   │   6×IR · RFID RC522 · Servo · OLED SSD1306 · Buzzer
│  hoặc Simulator Python  │   WiFi + MQTT client + LWT
└───────────┬─────────────┘
            │ MQTT 1883 (QoS1, retain)
┌───────────▼─────────────┐
│   Mosquitto Broker      │   user esp32 / app + ACL phân quyền topic
│   (Docker)              │   WebSocket 9001 cho App
└───────────┬─────────────┘
            │                    ┌──────────────────────┐
            │  MQTT              │  App React Native     │
            ├───────────────────▶│  4 tab: Bãi/Lịch sử/ │
            │                    │  Thống kê/Tài khoản   │
            │                    └──────────────────────┘
┌───────────▼─────────────┐
│  Backend Node/Express   │   REST + SSE + JSON store + JWT
│  Web Dashboard 5 tab    │   Chart.js thống kê doanh thu
└─────────────────────────┘
```

**Vì sao chọn kiến trúc này?** Tách biệt rõ 3 tầng trách nhiệm:
- **Tầng thiết bị** (ESP32): chỉ quan tâm trạng thái vật lý, là *nguồn sự thật duy nhất* cho trạng thái ô.
- **Tầng truyền tải** (Mosquitto): giải quyết vấn đề nhiều client cùng lúc, có QoS + retain + ACL + LWT.
- **Tầng ứng dụng** (App + Backend): xử lý nghiệp vụ, lưu trữ, thống kê, giao diện.

## 4. Thiết kế phần cứng (giả lập 100%)

### 4.1 Sơ đồ kết nối

| Linh kiện | Chân ESP32 | Ghi chú |
|---|---|---|
| IR ô P1 | GPIO 13 | `INPUT_PULLUP`, LOW = có xe |
| IR ô P2 | GPIO 12 | |
| IR ô P3 | GPIO 14 | |
| IR ô P4 | GPIO 27 | |
| IR ô P5 | GPIO 26 | |
| IR ô P6 | GPIO 25 | |
| RFID RC522 | SS=5, RST=4, SCK=18, MISO=19, MOSI=23 | SPI |
| Servo barrier | GPIO 15 | 0° = đóng, 90° = mở |
| Buzzer | GPIO 2 | |
| OLED SSD1306 | SDA=21, SCL=22, VCC=3V3 | I2C 0x3C, 128×64 |

### 4.2 ⚠️ Bài học kỹ thuật quan trọng (đã gây lỗi thật)

Khi triển khai trên Wokwi, màn hình hiển thị **không sáng** dù code đúng. Nguyên nhân tìm ra sau khi tra tài liệu chính thức:

1. **Part `wokwi-ssd1306` đã bị deprecated** → phải dùng `board-ssd1306`.
2. **Tên chân khác nhau**: `wokwi-ssd1306` dùng `VIN/DATA/CLK`; `board-ssd1306` dùng `VCC/SDA/SCL`.
3. **Ký hiệu chân ESP32 trong `diagram.json` phải có tiền tố `D`**: `esp:D21` (không phải `esp:21`), `esp:3V3`, `esp:GND.1`.

Nếu đấu sai chân, Wokwi vẫn biên dịch và chạy bình thường (Serial in ra log đúng) nhưng màn hình **trắng xanh im lặng** – rất dễ gây hiểu nhầm là lỗi code. Sau khi sửa cả 3 điểm, màn hiển thị đúng và đã được kiểm chứng bằng cách **đọc trực tiếp mảng pixel trên canvas** của trình mô phỏng.

### 4.3 Firmware ESP32 (565 dòng)

| Nhóm tính năng | Chi tiết |
|---|---|
| Khởi tạo | WiFi (timeout 24s), OLED, SPI RFID, Servo, Buzzer, 6 IR |
| MQTT | Reconnect mỗi 3s, LWT `parking/system/status = offline`, subscribe 2 topic, publish retain |
| Hiển thị OLED | 6 dòng: tiêu đề, trống/barrier, bảng trạng thái 6 ô, doanh thu/thông báo, uptime+MQTT, thẻ RFID gần nhất |
| Nghiệp vụ ô | Nhận biết xe vào/ra theo cạnh IR, tính phí, publish receipt |
| Đặt chỗ | `reserve` / `cancel` / `enter` / `exit` / `stay`, chống trùng theo `reservedBy` |
| Hết hạn | Tự hủy giữ chỗ sau 5 phút, publish `EXPIRED` |
| RFID | Ghi nhớ thẻ ↔ user (8 thẻ), quét thẻ mở barrier cho ô đã đặt, publish `parking/gate/rfid` |
| Barrier | Mở tự đóng sau 5 giây |
| Chống trùng | Kiểm tra `occupied` và `reservedBy` ngay trên ESP32 trước khi nhận lệnh |
| Lệnh Serial | `RFID:`, `BOOK:`, `CANCEL:`, `ENTER:`, `EXIT:`, `GATE:`, `DEMO` – để demo không cần App |
| Chẩn đoán | Log chi tiết mỗi giây: `Slots: X_____ MQTT:OK DT:6000d` |
| Chống nhiễu cảm biến | **Debounce 200 ms** cho 6 IR (3 biến: `irRaw` / `irChangeAt` / `irStable`) – loại bỏ hiện tượng bounce của nút bấm |
| Tách trạng thái | `irShadow[6]` (cảm biến đã xác nhận) + `manualMode[6]` (ô do lệnh thủ công điều khiển) để lệnh Serial không bị vòng lặp IR ghi đè |

### 4.4 Simulator Python (thay ESP32)

`simulator/parking_simulator.py` mô phỏng **đúng hành vi firmware** để chạy khi không mở được Wokwi (build queue thường xếp 30–40 job):

- 3 chế độ: `demo` (xe tự ra vào), `quiet` (đứng yên cho App điều khiển), `chaos` (mất mạng giả lập).
- Lệnh console: `BOOK:`, `CANCEL:`, `ENTER:`, `EXIT:`, `STAY:P1:95` (giả lập xe đã đứng 95 phút để demo tính phí), `GATE:`, `RFID:`.
- Thread nền: `expire_loop` (hết hạn 5 phút), `beat_loop` (heartbeat 15s).

## 5. Broker MQTT (Lab2)

### 5.1 Cấu hình
- `broker/docker-compose.yml`: image `eclipse-mosquitto:2.0`, mở cổng `1883` (TCP cho ESP32) và `9001` (WebSocket cho App).
- `broker/mosquitto.conf`: 2 listener, `allow_anonymous false`, `persistence true`.
- `broker/passwd` (gitignore): user `esp32/esp32123` (thiết bị), `app/app123` (ứng dụng).

### 5.2 Phân quyền topic (ACL)

| User | Quyền |
|---|---|
| `esp32` | `readwrite parking/#` – đọc/ghi mọi topic (thiết bị là nguồn sự thật) |
| `app` | **chỉ đọc**: `parking/slot/+/status`, `parking/slots/snapshot`, `parking/booking/+/state`, `parking/gate/barrier/state`, `parking/gate/rfid`, `parking/billing/receipt`, `parking/system/heartbeat` |
| `app` | **chỉ ghi**: `parking/booking/+/set`, `parking/gate/barrier/cmd` |

App **không thể** tự publish trạng thái ô → không thể giả mạo cảm biến. Đây là cơ chế bảo mật quan trọng của hệ thống.

### 5.3 Chiến lược QoS & Retain

| Nhóm topic | QoS | Retain | Lý do |
|---|---|---|---|
| `slot/*/status`, `slots/snapshot` | 1 | ✅ | App mới vào phải thấy ngay trạng thái hiện tại |
| `booking/*/state` | 1 | ✅ | Request đến trễ vẫn đọc được kết quả |
| `gate/barrier/state` | 1 | ✅ | Biết barrier đang mở hay đóng |
| `billing/receipt` | 1 | ✅ | Không mất hóa đơn khi App tắt |
| `gate/rfid`, `system/heartbeat` | 0 | ❌ | Dữ liệu sự kiện, không cần giữ |
| `booking/*/set`, `gate/barrier/cmd` | 1 | ❌ | Lệnh, không nên giữ lại (tránh chạy lại lệnh cũ) |

## 6. Server / Backend

### 6.1 Chức năng
- **Cầu nối MQTT ↔ REST**: subscribe 8 topic, cache trạng thái 6 ô vào RAM.
- **Lưu trữ bền vững**: `data/parking.json` – lưu booking, hóa đơn, log RFID, sự kiện, tài khoản. Ghi trễ 400ms (debounce) để không ghi đĩa liên tục.
- **REST API**: 18 endpoint (xem README bảng đầy đủ).
- **SSE realtime** (`/api/stream`): đẩy `slots` / `gate` / `receipt` / `booking` / `rfid` xuống Dashboard ngay khi có, tự reconnect 5s.
- **Xác thực**: token ký bằng HMAC-SHA256 (`Authorization: Bearer <token>`), mật khẩu lưu dạng SHA-256.
- **Thống kê**: doanh thu 7 ngày, doanh thu theo giờ trong ngày, top người dùng, tỉ lệ sử dụng theo ô.

### 6.2 Web Dashboard (5 tab, thuần HTML/CSS/JS + Chart.js)

| Tab | Nội dung |
|---|---|
| 🅿️ Sơ đồ bãi | Lưới 6 ô màu theo trạng thái, 4 nút thao tác mỗi ô (Đặt/Hủy/Vào/Ra), điều khiển barrier, log hệ thống realtime |
| 📊 Thống kê | 4 KPI + 3 biểu đồ Chart.js (cột 7 ngày, đường theo giờ, tròn top user) |
| 🧾 Lịch sử | 3 bảng: hóa đơn tính phí, lịch sử đặt chỗ, log thẻ RFID |
| 👤 Người dùng | Đăng ký tài khoản, bảng danh sách user kèm lượt xe & chi tiêu |
| ⚙️ Cài đặt | Đổi Backend URL, tra cứu nhanh toàn bộ endpoint |

## 7. Ứng dụng di động (Lab3)

### 7.1 Cấu trúc
- `app/src/parkingMqtt.js`: kết nối MQTT qua WebSocket, subscribe 8 topic, tự reconnect 2s, phát sinh `requestId` cho mỗi lệnh.
- `app/src/api.js`: lớp gọi REST cho Backend (thống kê, lịch sử, tài khoản).
- `app/src/App.js`: 4 tab dùng chung một kết nối MQTT.

### 7.2 Tính năng theo tab

| Tab | Nội dung |
|---|---|
| 🅿️ Bãi | Lưới 6 ô (xanh trống / đỏ có xe / vàng bạn đặt / cam đã đặt), nhấn giữ để xem menu ô, điều khiển barrier, cài đặt IP broker + mã SV, nhật ký realtime |
| 🧾 Lịch sử | KPI tổng phí & lượt xe, danh sách hóa đơn (ô, user, phút, phí, giờ), lịch sử đặt chỗ có tag OK/LỖI |
| 📊 Thống kê | 4 KPI, biểu đồ cột doanh thu 7 ngày, biểu đồ đường doanh thu theo giờ, thanh ngang top user – tất cả vẽ bằng View không cần thư viện chart |
| 👤 Tài khoản | Đăng ký / đăng nhập, xem thông tin tài khoản, đăng xuất |

### 7.3 Xử lý lỗi & ổn định
- **Chống trùng bằng `requestId`**: App gửi `booking/<ID>/set` kèm `requestId`; chỉ khi nhận `booking/<ID>/state` có **cùng `requestId`** mới coi là thành công. Request đến trễ sẽ bị bỏ qua.
- **Timeout 5 giây**: không nhận phản hồi → hiện popup "Timeout – kiểm tra IP Broker" và xoá khỏi hàng đợi.
- **Banner ONLINE/OFFLINE** + tự reconnect 2s.
- `try/catch` toàn bộ parse JSON payload, payload rác bị bỏ qua im lặng.

## 8. Quy tắc nghiệp vụ cốt lõi

### 8.1 Chống trùng đặt chỗ
```
App SV01 ──booking/P1/set──▶ ESP32 (kiểm tra occupied + reservedBy) ──▶ publish state ok=true
App SV02 ──booking/P1/set──▶ ESP32 (thấy reservedBy=SV01)          ──▶ publish state ok=false
                                                                    "O da duoc dat boi SV01"
```
Kiểm tra được thực hiện **trên ESP32** (thẩm quyền cao nhất), Broker chỉ truyền tải, App chỉ phản ánh. Cả 3 tầng đều có cơ chế riêng.

### 8.2 Tính phí
```
minutes = (thời điểm xe ra - thời điểm xe vào) / 60000
fee = 0                                        nếu minutes ≤ 30
fee = ceil(minutes / 60) × 3000đ               nếu minutes > 30
```
Đã kiểm chứng: 95 phút → 6000đ (2 giờ × 3000đ); 1 phút → 0đ.

### 8.3 Giữ chỗ 5 phút
Đặt chỗ nhưng xe không vào → sau 5 phút hệ thống tự hủy, publish `EXPIRED`, giải phóng ô cho người khác.

## 9. Kiểm thử tự động (đã chạy thật ngày 16/11/2026)

Môi trường: Docker Desktop 28.5.1, Mosquitto 2.0.22, Node v24.19.0, Python 3.13.9, Chrome.

### 9.1 Bộ kiểm thử end-to-end tự động

Đóng gói toàn bộ quy trình kiểm thử vào **một lệnh** bằng `simulator/test_suite.py`:

```powershell
python simulator/test_suite.py
```

Bộ test tự bật/tắt simulator ở chế độ `quiet`, tự sinh tài khoản thử nghiệm không trùng lặp,
và kiểm tra **32 checkpoint** xuyên suốt chuỗi Broker → Simulator → Backend → Dashboard.
Kết quả lần chạy cuối: **32/32 PASS**.

| Nhóm | Checkpoint | Kết quả |
|---|---|---|
| Hạ tầng | Broker + Backend + MQTT online, đủ 6 ô | ✅ |
| Nghiệp vụ đặt chỗ | `POST /api/booking`, ô đã đặt đúng user | ✅ |
| **Chống trùng** | SV02 đặt trùng → `ok=false "O da duoc dat boi SV01"` | ✅ |
| Vòng đời xe | `POST /api/enter` → occupied; `POST /api/exit` → sinh hóa đơn | ✅ |
| **Tính phí** | ≤ 30 phút → 0đ; 95 phút → **6000đ** | ✅ |
| Barrier | `POST /api/gate OPEN` → `gate=OPEN` | ✅ |
| Thống kê | doanh thu > 0, 7 ngày, 24 mốc giờ, top user | ✅ |
| Xác thực | đăng ký, đăng nhập, `me` bằng token, nạp tiền, sai mật khẩu → **401** | ✅ |
| Lịch sử | hóa đơn, booking, log RFID, log sự kiện, danh sách user | ✅ |
| Dashboard | HTML phục vụ, 5 tab, Chart.js, SSE | ✅ |

### 9.2 Kiểm thử thủ công bổ sung

| # | Hạng mục | Kết quả | Bằng chứng |
|---|---|---|---|
| 1 | Broker Up | ✅ | `docker compose ps` → Up, mở 1883 + 9001 |
| 2 | Simulator nối broker | ✅ | Log `Received PUBLISH parking/slot/P*/status` + snapshot retain |
| 3 | Backend REST | ✅ | `GET /api/health` → `{"ok":true,"mqtt":true,"online":true,"slots":6}` |
| 4 | Đặt chỗ thành công | ✅ | `POST /api/booking P3 SV01` → `reservedBy=SV01` |
| 5 | **Chống trùng** | ✅ | SV02 đặt P5 → `{"ok":false,"msg":"O da duoc dat boi SV01"}` |
| 6 | Xe vào / xe ra | ✅ | `ENTER` → `ENTERED`; `EXIT` → `FREE` + publish receipt |
| 7 | **Tính phí** | ✅ | 95 phút → **6000đ**; 1 phút → 0đ |
| 8 | Thống kê | ✅ | `revenueToday=6000`, `totalSessions=5`, 7 ngày, top user |
| 9 | Đăng ký / đăng nhập | ✅ | Register → Login → `GET /api/auth/me` OK |
| 10 | Sai mật khẩu | ✅ | HTTP **401 Unauthorized** |
| 11 | Nạp tiền ví | ✅ | `POST /api/balance 50000` → `balance=50000` |
| 12 | Lịch sử hóa đơn/booking/RFID | ✅ | 3 bảng trên Dashboard hiển thị đầy đủ dữ liệu |
| 13 | Biểu đồ Chart.js | ✅ | 3 canvas vẽ đúng, `DATA_LEN=7` |
| 14 | Firmware V2 trên Wokwi | ✅ | Build thành công, OLED hiển thị 6 dòng, MQTT OK |
| 15 | OLED hiển thị thật | ✅ | **Đọc pixel canvas**: thấy rõ "Smart Parking / Trong:5/6 CLOSED / X_____ / MQTT:OK" |
| 16 | Nút bấm Wokwi | ✅ | Giữ nút P1 → OLED đổi "Trong:5/6", Serial `Slots: X_____` |

## 10. Kết quả & Hạn chế

### Kết quả
Hệ thống chạy liên thông đủ 4 tầng (thiết bị → broker → backend → ứng dụng), **không cần phần cứng thật**. Đã kiểm chứng bằng **bộ test tự động 32/32 checkpoint** (chạy bằng 1 lệnh) cộng với các kiểm thử thủ công bổ sung, trong đó có các tính năng nâng cấp: tài khoản + token, ví nạp tiền, thống kê doanh thu 7 ngày, biểu đồ, log lịch sử, realtime SSE, tính phí theo thời gian, hết hạn giữ chỗ, mở barrier bằng RFID.

### Hạn chế
- Chưa có phần cứng thật → IR/RFID/Servo mô phỏng bằng Wokwi + simulator. Khi có ESP32 thật chỉ cần đổi `MQTT_HOST` và `WIFI_SSID`.
- Chưa tích hợp thanh toán online thật (ví nội bộ hiện chỉ mô phỏng số dư).
- Dữ liệu lưu file JSON, phù hợp quy mô đồ án; production nên chuyển MySQL/PostgreSQL.
- Nhận diện biển số bằng camera chưa triển khai.

### Hướng phát triển
1. Tích hợp thanh toán QR (VNPay/Momo) trừ thẳng ví.
2. Nhận diện biển số bằng ESP32-CAM + OCR.
3. Dự báo chỗ trống theo lịch sử (machine learning).
4. Phân quyền vai trò: quản trị viên (xem doanh thu toàn bãi) vs người dùng (chỉ thấy xe mình).
5. Push notification bằng FCM khi giữ chỗ sắp hết hạn.

## Phụ lục

- **Link nộp 8 ô**: xem `LINK_NOP_BAI.md`.
- **Kịch bản quay video + ảnh minh chứng**: xem `docs/MINH_CHUNG.md`.
- **Kết quả test chi tiết**: xem `docs/KET_QUA_TEST.md`.
- **Slide thuyết trình**: `docs/Slide_ThuyetTrinh.md` → xuất `.pptx`.
