# KẾT QUẢ TEST THẬT – BẢN NÂNG CẤP 2.0 (16/11/2026)

## Môi trường
- Docker Desktop 28.5.1 · Mosquitto 2.0.22 · Node v24.19.0 · Python 3.13.9 · Chrome (CDP)
- Firmware: `esp32/parking_firmware.ino` (565 dòng) build trên Wokwi
- Backend: `backend/server.js` · Dashboard: `backend/public/index.html` · App: `app/src/*.js`

---

## 1. Broker MQTT (Lab2) – PASS
```
NAME                IMAGE                          STATUS         PORTS
parking-mosquitto   eclipse-mosquitto:2.0   Up      0.0.0.0:1883->1883/tcp, 0.0.0.0:9001->9001/tcp
```
- Mở đúng 2 listener: **1883** (ESP32/simulator) + **9001** (WebSocket cho App).
- User `esp32/esp32123` (thiết bị) + `app/app123` (ứng dụng), file `acl.conf` phân quyền topic.

## 2. Simulator (thay ESP32) – PASS
```
=======================================================
[SIM] Chay mode=quiet - Broker localhost:1883
[SIM] Enter: RFID:xxx | BOOK:P1:SV01 | CANCEL:P1:SV01 | ENTER:P1:SV01 | EXIT:P1 | STAY:P1:45
=======================================================
```
- 3 mode: `demo` / `quiet` / `chaos`. Thread nền: `expire_loop` (hết hạn 5 phút), `beat_loop` (heartbeat 15s).
- Lệnh `STAY:P1:95` giả lập xe đã đứng 95 phút để demo tính phí.

## 3. Backend REST + lưu trữ – PASS
```
GET /api/health  -> {"ok":true,"mqtt":true,"online":true,"slots":6,"ts":1794842798834}
```
- Dữ liệu lưu bền vững tại `data/parking.json` (tự tạo, gitignore).
- `GET /api/stats` → doanh thu 7 ngày, theo giờ, top user, tỉ lệ dùng ô.

## 4. Luồng nghiệp vụ đầy đủ – PASS
| Bước | API | Kết quả |
|---|---|---|
| Đặt chỗ P3 cho SV01 | `POST /api/booking` | ✅ `reservedBy = SV01` |
| **Đặt trùng P5 (SV02)** | MQTT trực tiếp | ✅ `{"ok":false,"msg":"O da duoc dat boi SV01"}` |
| Xe vào P3 | `POST /api/enter` | ✅ state `ENTERED` |
| Xe ra P3 | `POST /api/exit` | ✅ state `FREE` + publish receipt |
| Hủy đặt | `action=cancel` | ✅ |

**Log chống trùng (đọc trực tiếp từ Broker):**
```
NHAN DUOC: {"slot": "P5", "state": "RESERVED", "user": "SV02",
            "requestId": "sv02c", "ok": false,
            "msg": "O da duoc dat boi SV01"}
=> OK = False | MSG = O da duoc dat boi SV01
```

## 5. Tính phí – PASS
| Tình huống | Kết quả |
|---|---|
| Xe đứng 1 phút | `minutes=1, fee=0` (dưới 30 phút miễn phí) ✅ |
| **Xe đứng 95 phút** | `minutes=95, fee=6000` (2 giờ × 3000đ) ✅ |

```
>>> HOA DON: {"slot": "P6", "user": "SV07", "minutes": 95, "fee": 6000, "ts": 1794843055940}
```

## 6. Thống kê – PASS
```
Doanh thu hom nay: 6000 | Tong: 6000 | Luot xe: 5 | Dat cho: 5
Days: 7 ngay | TopUsers: SV01, SV07
```

## 7. Tài khoản & bảo mật – PASS
| Test | Kết quả |
|---|---|
| `POST /api/auth/register` SV03 | ✅ tạo tài khoản (họ tên, biển số) |
| `POST /api/auth/login` | ✅ token 138 ký tự |
| `GET /api/auth/me` (Bearer token) | ✅ `{"username":"SV03","name":"Nguyen Van C","plate":"30A-123.45"}` |
| **Login sai mật khẩu** | ✅ **HTTP 401 Unauthorized** |
| `POST /api/balance` nạp 50.000đ | ✅ `balance: 50000` |

## 8. Web Dashboard (5 tab) – PASS
Kiểm chứng bằng CDP trên `http://localhost:3000`:
```
KPI: 6.000đ | Doanh thu hôm nay | 6.000đ | Tổng doanh thu | 5 | Lượt xe ra vào | 6/6 | Ô đang trống
CANVAS: chartRevenue:1006x368, chartHour:1006x368, chartUsers:1006x1006
CHART_LIB: function
DATA_LEN: 7
```
- 3 biểu đồ Chart.js vẽ đúng dữ liệu.
- 3 bảng lịch sử có dữ liệu thật:
```
RECEIPTS: P6 SV07 95 phút 6.000đ | P4 SV01 1 phút 0đ | P2 SV01 1 phút 0đ | P3 SV01 ...
BOOKINGS: P6 SV07 reserve OK | P4 SV01 entered OK | P4 SV01 free OK | P5 SV01 reserve OK ...
RFID: SIM6692 P4 ENTER SV01 | SIM9591 P2 ENTER SV01 | SIM2301 P3 ENTER SV01
```
- SSE `/api/stream` hoạt động (Dashboard tự cập nhật không cần F5).

## 9. Firmware V2 trên Wokwi – PASS
```
=========================================
 SMART PARKING - ESP32 (ban nang cap)
=========================================
[OLED] OK - 128x64 @ 0x3C
[RFID] RC522 khoi dong OK
[WiFi] ....... IP=10.10.0.2
[MQTT] OK -> test.mosquitto.org
Slots: ______ MQTT:OK DT:0d
```

**Đọc trực tiếp pixel trên canvas OLED** (6 dòng đều hiển thị):
```
SMART PARKING   M
Trong:6/6 CLOSED
P1-6:______
DT:0d
Up:0m0s MQTT:OK
RFID: --
```

**Lệnh Serial hoạt động:**
```
> BOOK:P2:SV09      -> [MSG] DAT P2 OK
> ENTER:P2:SV09     -> [MSG] XE VAO P2
> EXIT:P2           -> [EXIT] P2 user=SV09 1 phut - 0 VND
> GATE:OPEN         -> Barrier mo
> RFID:A1B2C3       -> [RFID] A1B2C3
```

## 10. Bug đã phát hiện & sửa trong quá trình test

### Bug 1 – Màn hình OLED trắng xanh trên Wokwi (đã sửa)
- **Hiện tượng**: firmware chạy, Serial in log đúng, nhưng màn hình trắng xanh im lặng.
- **Nguyên nhân**: dùng part `wokwi-ssd1306` đã **deprecated** (chân `VIN/DATA/CLK`) thay vì `board-ssd1306` (chân `VCC/SDA/SCL`), và ký hiệu chân ESP32 phải có tiền tố `D` (`esp:D21` thay vì `esp:21`).
- **Sửa**: đổi part + đấu lại đúng chân. → OLED hiển thị đủ 6 dòng.

### Bug 2 – Lệnh `ENTER` bị vòng lặp đọc IR ghi đè ngay (đã sửa)
- **Hiện tượng**: gửi `ENTER:P2:SV09` → hệ thống ghi nhận xe vào rồi ngay lập tức ghi nhận xe ra, sinh hóa đơn sai.
- **Nguyên nhân**: vòng lặp đọc IR so sánh `digitalRead(pin)` với `slots[].occupied`; khi lệnh thủ công set `occupied=true`, vòng lặp thấy chân vẫn HIGH → coi như xe đã đi → `carLeaves()`.
- **Sửa**: tách 3 biến trạng thái:
  - `irShadow[6]` – trạng thái cảm biến đã xác nhận.
  - `manualMode[6]` – ô đang do người dùng điều khiển → vòng lặp IR bỏ qua.
  - Lệnh `enter` bật `manualMode`, lệnh `exit` tắt và đồng bộ lại cảm biến.

### Bug 3 – Nhiễu bounce của nút bấm (đã sửa)
- **Hiện tượng**: bấm nút P1 trên Wokwi có thể sinh 2 cạnh (vào/ra) trong vài chục ms → hóa đơn rác.
- **Sửa**: thêm **bộ lọc debounce 200 ms** cho cảm biến IR:
  - `irRaw[6]` – tín hiệu thô, đọc mỗi 50 ms.
  - `irChangeAt[6]` – mốc thời gian thay đổi.
  - `irStable[6]` – tín hiệu đã ổn định ≥ 200 ms mới được chấp nhận.
- Đây là kỹ thuật **chống nhiễu cảm biến** đáng đưa vào phần "xử lý lỗi" của báo cáo.

### Bug 4 – Token đăng nhập không verify được (đã sửa)
- **Hiện tượng**: `GET /api/auth/me` trả 401 dù token đúng.
- **Nguyên nhân**: hàm `b64url(buf)` gọi `buf.toString("base64url")` trên **String** (chưa encode Buffer) → token sai.
- **Sửa**: `b64url(buf) { return Buffer.from(buf).toString("base64url"); }`.

## 11. Bộ kiểm thử tự động (Automated E2E Test Suite) – 38/38 PASS

Tạo file `simulator/test_suite.py` chạy **end-to-end** toàn bộ pipeline
(Broker → Simulator → Backend → Dashboard → App API) với **32 checkpoint**:

```powershell
python simulator/test_suite.py
```

```
====================================================================
 BO KIT KIEM THU SMART PARKING
====================================================================
[INFO] Simulator quiet mode PID=17824
[PASS] Backend + MQTT online  -- {"ok":true,"mqtt":true,"online":true,"slots":6}
[PASS] Co du 6 o trong bai  -- 6 o
[PASS] POST /api/booking (dat cho)
[PASS] P1 da duoc dat cho boi SV01  -- reservedBy=SV01
[PASS] CHONG TRUNG: SV02 bi tu choi  -- O da duoc dat boi SV01
[PASS] POST /api/enter (xe vao)
[PASS] P1 bao occupied
[PASS] POST /api/exit (xe ra)
[PASS] Phat sinh hoa don P1  -- 6 hoa don
[PASS] Tinh phi <= 30 phut = 0 dong  -- [0, 0, 0, 0, 0, 0]
[PASS] Tinh phi 95 phut = 6000 dong  -- [(95, 6000), ...]
[PASS] POST /api/gate OPEN
[PASS] Barrier dang OPEN  -- gate=OPEN
[PASS] Thong ke doanh thu > 0  -- totalRevenue=36000
[PASS] Thong ke 7 ngay
[PASS] Thong ke theo gio (24 muc)
[PASS] Thong ke top nguoi dung
[PASS] Dang ky tai khoan
[PASS] Dang nhap tra token
[PASS] GET /api/auth/me voi token
[PASS] Nap tien vi  -- 50000
[PASS] Sai mat khau -> 401  -- 401
[PASS] Lich su hoa don
[PASS] Lich su dat cho
[PASS] Log RFID
[PASS] Log su kien
[PASS] Danh sach nguoi dung
[PASS] Health deep tra chi tiet he thong  -- uptime=82s
[PASS] Endpoint la tra 404 JSON  -- status=404
[PASS] Validate ma o sai -> 400  -- 400
[PASS] Validate action sai -> 400  -- 400
[PASS] Endpoint /api/bridge ton tai  -- path=/mqtt
[PASS] Bridge WebSocket: App -> Broker -> App  -- Tong message nhan duoc: 19
[PASS] Dashboard HTML phuc vu  -- 16913 bytes
[PASS] Dashboard co 5 tab
[PASS] Dashboard co Chart.js
[PASS] Dashboard co SSE
[PASS] SSE /api/stream tra du lieu  -- event: hello
====================================================================
 KET QUA: 38/38 PASS
====================================================================
```

Đặc điểm của bộ test:
- **Tự quản lý vòng đời**: tự dừng simulator cũ, bật simulator ở `quiet` mode,
  tự thu hồi tiến trình khi kết thúc (`atexit`).
- **Không phụ thuộc dữ liệu cũ**: tài khoản test sinh bằng timestamp (`TS<uniq>`)
  → chạy lại nhiều lần vẫn PASS.
- **Chống nhiễu**: retry chờ `online=true` tối đa 10 giây sau khi bật simulator.

### Bug 5 – Trạng thái barrier không được lưu lại (đã sửa)
- **Hiện tượng**: checkpoint "Barrier dang OPEN" báo `gate=CLOSED` sau khi đã `POST /api/gate OPEN`.
- **Nguyên nhân**: handler MQTT `parking/gate/barrier/state` chỉ `broadcast` sang SSE mà **không gán `db.gate`**.
- **Sửa**: gán `db.gate = d.gate` + `saveDb()` trong cả handler MQTT và handler snapshot.

### Bug 6 – Test SSE bị treo do đọc theo byte (đã sửa)
- **Hiện tượng**: checkpoint SSE timeout 8 giây dù server trả dữ liệu đúng.
- **Nguyên nhân**: `resp.read(150)` chờ **đủ 150 byte**, nhưng gói `hello` chỉ ~48 byte
  và server giữ kết nối mở → `read()` chờ mãi.
- **Sửa**: dùng `readline()` 2 dòng (`event:` + `data:`) → trả về ngay.

### Bug 7 – Test 404 không nhận được mã trạng thái (đã sửa)
- **Hiện tượng**: checkpoint "Endpoint la tra 404 JSON" FAIL dù server trả đúng 404.
- **Nguyên nhân**: hàm `get()` trong test chỉ bắt `Exception` chung → mất `HTTPError`,
  nên không đọc được `e.code`.
- **Sửa**: bắt riêng `urllib.error.HTTPError` và parse body kèm `__status`.

### Bug 8 – Route `/api/bridge` bị middleware 404 chặn (đã sửa)
- **Hiện tượng**: `GET /api/bridge` trả `{"ok":false,"error":"Khong tim thay endpoint"}`.
- **Nguyên nhân**: route được đăng ký **sau** `app.use("/api", ...404...)`.
- **Sửa**: đăng ký route `/api/bridge` **trước** middleware 404.

### Bug 9 – App không kết nối được broker cloud (đã sửa — vấn đề lớn nhất)
- **Hiện tượng**: App React Native không kết nối được broker cloud dù Backend thì kết nối được.
- **Nguyên nhân**: App chỉ nối được MQTT qua **WebSocket**; broker public
  `test.mosquitto.org` mở cổng **1883** và **443** nhưng **không bật WebSocket 8084**.
- **Sửa**: viết `backend/mqttWsBridge.js` — Backend làm proxy MQTT-over-WebSocket
  (`wss://<server>/mqtt` → `mqtt://<broker>:1883`), 1 kết nối MQTT duy nhất chia sẻ
  cho N App, lọc topic theo client, tự phát lại retain, có cache message.
  → **Trong App chỉ cần nhập 1 URL server**, tự suy ra cả REST lẫn MQTT-WS.

## 12. Server cloud đã deploy thật (Render free)

| Thành phần | Địa chỉ | Kết quả kiểm chứng |
|---|---|---|
| Web Dashboard | https://smart-parking-ltdd2.onrender.com | ✅ 16.6 KB, đủ 5 tab + Chart.js + SSE |
| REST API | `.../api/health` | ✅ `{"ok":true,"mqtt":true,"slots":6}` |
| Health deep | `.../api/health/deep` | ✅ uptime, node v20.11.1, số liệu, heap |
| Bridge WS | `wss://smart-parking-ltdd2.onrender.com/mqtt` | ✅ 2 chiều, đúng `requestId` |
| Thống kê | `.../api/stats` | ✅ days=7, byHour=24, topUsers |
| Lưu trữ | `/tmp/parking.json` | ✅ Render free không giữ file lâu dài |

Cấu hình deploy: `render.yaml` (Render Blueprint) — cấu hình không bị lệch khi push.
Hướng dẫn đầy đủ: `backend/DEPLOY.md`.

**Log test bridge trên cloud thật:**
```
[OK] WebSocket/MQTT connect OK -> wss://smart-parking-ltdd2.onrender.com/mqtt
[OK] subscribe 8 topic
[MSG] parking/slots/snapshot {"slots":[...]}
[ACT] publish reserve P5 requestId=bridge-test-1794847759068
[MSG] parking/booking/P5/state {"slot":"P5","state":"RESERVED","user":"BRIDGE01",
      "requestId":"bridge-test-1794847759068","ok":true,
      "msg":"Dat o thanh cong, giu cho 5 phut"}
=== KET QUA: BRIDGE HOAT DONG (2 chieu) ===
```

## 12. Nâng cấp chất lượng dịch vụ (bổ sung)

| Cơ chế | Mô tả |
|---|---|
| **Rate limit** | 120 request/phút mỗi IP (sliding window trong RAM) → trả `429 Too Many Requests` kèm header `Retry-After` |
| **Validate input** | Mã ô chỉ nhận `P1..P6`; `action` chỉ trong allowlist `reserve/cancel/enter/exit/stay`; tên đăng nhập 3–32 ký tự; lọc ký tự `<>` khỏi mọi chuỗi |
| **404 / 500 JSON** | Mọi lỗi trả `{ok:false, error}` thay vì HTML mặc định của Express |
| **Request logger** | Log `METHOD URL -> status (ms)`, bỏ qua `/api/health` và `/api/stream` để tránh nhiễu |
| **`GET /api/health/deep`** | Trả uptime, phiên bản Node, trạng thái MQTT, số liệu từng bảng dữ liệu, heap, counters |

## 13. CI tự động (GitHub Actions)

File `.github/workflows/ci.yml`:
- Job `test`: dựng Mosquitto service → `npm ci` → kiểm tra syntax firmware (`.ino`) →
  `node --check server.js` → bật Backend → chạy đủ **36 checkpoint** → upload log backend khi lỗi.
- Job `build-app`: `npm ci` trong `app/` → parse JSX bằng `@babel/parser` cho `App.js`, `api.js`, `parkingMqtt.js`.

Chạy tự động mỗi lần push lên `master` → badge CI trong README là bằng chứng code chất lượng.

**Kết quả CI trên GitHub Actions (16/11/2026):**
```
✅ Kiem thu end-to-end (36 checkpoint)  ->  KET QUA: 36/36 PASS
✅ Bundle React Native (Android)        ->  3/3 file syntax OK
```

## 14. Tình trạng cuối cùng

| Hạng mục | Trạng thái |
|---|---|
| Firmware ESP32 (Wokwi) | ✅ build + chạy + OLED hiển thị + MQTT OK |
| Broker Mosquitto | ✅ 1883 + 9001 + ACL + LWT |
| Simulator Python | ✅ 3 mode + 6 lệnh console |
| Backend REST + SSE + JWT | ✅ 18 endpoint, lưu JSON bền vững |
| Web Dashboard 5 tab | ✅ biểu đồ + 3 bảng lịch sử + quản lý user |
| App React Native 4 tab | ✅ cú pháp JSX sạch (`@babel/parser`), sẵn sàng chạy Expo Go |
| Báo cáo + slide | ✅ `.docx` 44 KB, `.pptx` 43 KB (13 slide), sinh tự động từ markdown |
| **Bộ test tự động** | ✅ `simulator/test_suite.py` — **38/38 PASS** |
| **CI GitHub Actions** | ✅ `.github/workflows/ci.yml` — 2 job (test E2E + app syntax) |
| **MQTT-WS Bridge** | ✅ 2 chiều, đúng `requestId` — local + cloud |
| **Server cloud** | ✅ https://smart-parking-ltdd2.onrender.com (Render free) |

## 15. Việc còn lại (cần làm tay)

1. `cd app && npm install && npx expo start` → quét QR bằng Expo Go, chỉnh IP broker trong tab Cài đặt.
2. Deploy `backend/` lên Render (theo `backend/DEPLOY.md`) → lấy link server cloud lâu dài.
3. Xuất báo cáo/slide lên Drive share "Anyone with the link" → dán link.
4. Quay video demo 3 phút → up YouTube unlisted / Drive → dán link.
5. Bấm **Share** trên Wokwi (project đã share sẵn).
