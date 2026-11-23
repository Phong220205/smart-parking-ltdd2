# LAB 1 — FIRMWARE ESP32 (WOKWI) BÃI ĐỖ XE THÔNG MINH

> **Tài liệu hướng dẫn đầy đủ**: phần cứng · firmware · cách hoạt động từng bước · cách chạy · kiểm thử · xử lý lỗi.
>
> Repo: https://github.com/Phong220205/smart-parking-ltdd2 · Thư mục: `esp32/`
> Phiên bản: 2.0 — cập nhật 23/11/2026

---

## MỤC LỤC

1. [Lab 1 làm gì?](#1-lab-1-làm-gì)
2. [Phần cứng & sơ đồ nối dây](#2-phần-cứng--sơ-đồ-nối-dây)
3. [Cấu trúc firmware](#3-cấu-trúc-firmware)
4. [Source code — giải thích chi tiết](#4-source-code--giải-thích-chi-tiết)
   - 4.1 [Lớp `MqttWsClient` — MQTT-over-WebSocket tự viết](#41-lớp-mqttwsclient--mqtt-over-websocket-tự-viết)
   - 4.2 [Debounce cảm biến IR](#42-debounce-cảm-biến-ir)
   - 4.3 [Tách `irShadow` / `manualMode`](#43-tách-irshadow--manualmode)
   - 4.4 [Nghiệp vụ đặt chỗ & chống trùng](#44-nghiệp-vụ-đặt-chỗ--chống-trùng)
   - 4.5 [Tính phí](#45-tính-phí)
   - 4.6 [RFID & Barrier](#46-rfid--barrier)
   - 4.7 [OLED 6 dòng](#47-oled-6-dòng)
   - 4.8 [Watchdog & reconnect](#48-watchdog--reconnect)
5. [Chạy trên Wokwi](#5-chạy-trên-wokwi)
6. [Chạy trên ESP32 thật](#6-chạy-trên-esp32-thật)
7. [Kiểm thử](#7-kiểm-thử)
8. [Bài học kỹ thuật (9 bug đã sửa)](#8-bài-học-kỹ-thuật-9-bug-đã-sửa)
9. [Xử lý lỗi thường gặp](#9-xử-lý-lỗi-thường-gặp)

---

## 1. Lab 1 làm gì?

**Lab 1 xây dựng tầng thiết bị (device layer)** — firmware chạy trên ESP32, đảm nhiệm:

| Chức năng | Chi tiết |
|---|---|
| **Đọc cảm biến** | 6 cảm biến IR (ô đỗ P1–P6) + module RFID RC522 |
| **Điều khiển** | Servo barrier, Buzzer, OLED SSD1306 |
| **Nghiệp vụ** | Đặt chỗ, chống trùng, tính phí, hết hạn giữ chỗ |
| **Truyền thông** | MQTT (TCP hoặc WebSocket/TLS), LWT, reconnect, tự gửi PINGREQ |

**Nguyên tắc kiến trúc quan trọng nhất:**

> 🔑 **ESP32 là nguồn sự thật duy nhất (single source of truth) cho trạng thái vật lý của 6 ô.**
> App và Backend chỉ **phản ánh**, không được quyết định. Mọi kiểm tra nghiệp vụ (chống trùng, tính phí) thực hiện **trên ESP32** — tầng có thẩm quyền cao nhất.

---

## 2. Phần cứng & sơ đồ nối dây

### 2.1 Linh kiện (BOM)

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

**BOM ước tính: ~400–500kđ** nếu mua thật.

### 2.2 Sơ đồ Wokwi

File `esp32/diagram.json` — 11 part:

```
  P1  P2  P3  P4  P5  P6        ┌──────────────┐
  ▢  ▢  ▢  ▢  ▢  ▢  ──GPIO──▶ │  ESP32 DevKit │ ◀── SPI ── RC522 (RFID)
                                 │      V1      │
  OLED SSD1306 ──I2C(21,22)──▶  │              │ ◀── GPIO15 ── Servo (Barrier)
                                 └──────────────┘ ◀── GPIO2  ── Buzzer
```

### 2.3 ⚠️ Bài học quan trọng: OLED "trắng xanh" — 3 nguyên nhân

Khi triển khai lần đầu, màn hình **không sáng** dù code đúng. Đây là 3 lỗi phải sửa **cùng lúc**:

| # | Nguyên nhân | Sai | Đúng |
|---|---|---|---|
| 1 | Part `wokwi-ssd1306` đã **deprecated** | `wokwi-ssd1306` | `board-ssd1306` |
| 2 | **Tên chân khác nhau** | `wokwi-ssd1306`: `VIN/DATA/CLK` | `board-ssd1306`: `VCC/SDA/SCL` |
| 3 | Ký hiệu chân ESP32 trong `diagram.json` phải có tiền tố `D` | `esp:21` | `esp:D21` |

> **Đặc điểm gây hiểu nhầm nhất:** sai chân → Wokwi **vẫn biên dịch và chạy bình thường** (Serial in ra log đúng), chỉ có màn hình trắng xanh im lặng. Rất dễ tưởng là lỗi code.
>
> Sau khi sửa cả 3 điểm, màn hiển thị đúng và **đã kiểm chứng bằng cách đọc trực tiếp mảng pixel trên canvas** của trình mô phỏng.

---

## 3. Cấu trúc firmware

File: `esp32/parking_firmware.ino` — **1326 dòng**.

```
┌──────────────────────────────────────────────────────────────┐
│ 1.  INCLUDES & HẰNG SỐ                                      │
│ 2.  LỚP MqttWsClient  (MQTT-over-WebSocket tự viết RFC6455) │  ← lớp quan trọng nhất
│ 3.  CẤU HÌNH (WiFi, MQTT, phần cứng)                        │
│ 4.  BIẾN TOÀN CỤC (slots, irShadow, irRaw, gateState...)    │
│ 5.  HÀM OLED (vẽ 6 dòng)                                   │
│ 6.  HÀM NGHIỆP VỤ (booking, fee, expiry, RFID, gate)         │
│ 7.  MQTT CALLBACK (onMsg)                                   │
│ 8.  SETUP (WiFi, OLED, RFID, Servo, MQTT)                    │
│ 9.  LOOP (đọc IR, xử lý lệnh Serial, publish, keepalive)    │
└──────────────────────────────────────────────────────────────┘
```

### 3.1 Cấu hình MQTT

```cpp
const char* MQTT_HOST = "smart-parking-ltdd2.onrender.com";
const char* MQTT_PATH = "/mqtt";         // đường dẫn WebSocket của broker
#define MQTT_USE_WS  1                   // 1 = dùng MQTT-over-WebSocket (cloud)
                                       // 0 = dùng MQTT/TCP trực tiếp (cục bộ)
const char* MQTT_USER = "esp32";
const char* MQTT_PASS = "esp32123";
```

| Chế độ | Khi nào dùng | Giao thức |
|---|---|---|
| `MQTT_USE_WS = 1` | Deploy cloud, cần mã hoá | `wss://host/mqtt` |
| `MQTT_USE_WS = 0` | Chạy local với broker Docker | `mqtt://192.168.x.x:1883` |

---

## 4. Source code — giải thích chi tiết

### 4.1 Lớp `MqttWsClient` — MQTT-over-WebSocket tự viết

**Vì sao không dùng thư viện `WebSocketStreamClient` của Wokwi?**

> Bản thư viện đó (`areve/WebSocketStreamClient`) viết cho **Arduino core 2.x**.
> Trên **core 3.x**, interface `Client` đã đổi (thêm/bổ sung hàm thuần ảo) nên thư viện **không còn biên dịch được** (lỗi: *"cannot declare variable ... to be of abstract type"*).
>
> → Ta **tự viết** lớp bọc WebSocket tối giản theo đúng chuẩn **RFC 6455**.

**Kế thừh interface `Client` mà PubSubClient yêu cầu:**

```cpp
class MqttWsClient : public Client {
public:
  MqttWsClient(WiFiClientSecure &tls, const char *host, uint16_t port, const char *path)
    : _tls(tls), _host(host), _port(port), _path(path) {
    _wsReady = false; _rxLen = 0; _rxPos = 0; _rawLen = 0; _lastPing = 0;
  }

  // ---- Interface Client mà PubSubClient yêu cầu ----
  int connect(IPAddress ip, uint16_t port) override { (void)ip; (void)port; return handshake(); }
  int connect(const char *host, uint16_t port) override { (void)host; (void)port; return handshake(); }
  size_t write(uint8_t b) override { return write(&b, 1); }
  size_t write(const uint8_t *buf, size_t size) override {
    if (!_wsReady) { Serial.println("[WS] write that bai - ket noi chua san sang"); return 0; }
    // [FIX] Gửi TRỌN VẸN frame (writeAll bên trong sendFrame) - nếu ghi
    //   thiếu byte thì frame WebSocket bị hỏng -> broker không hiểu.
    if (!sendFrame(0x2, buf, size)) {   // 0x2 = binary frame
      Serial.println("[WS] Ghi frame that bai");
      return 0;
    }
    return size;
  }
  int available() override { ... }
  int read() override { ... }
  int read(uint8_t *buf, size_t size) override { ... }
  int peek() override { ... }
  void flush() override { if (_tls.connected()) _tls.flush(); }
  void stop() override { _wsReady = false; _tls.stop(); }
  uint8_t connected() override { return (_wsReady && _tls.connected()) ? 1 : 0; }
  operator bool() override { return connected() != 0; }
```

| Hàm | Vai trò |
|---|---|
| `connect()` | Gọi `handshake()` — thực hiện bắt tay WebSocket (HTTP Upgrade) qua kênh TLS |
| `write()` | Gói gói MQTT thành **1 WebSocket binary frame** có mask → gửi |
| `available()` | Trả về số byte **đã có sẵn** trong buffer nhận (không block) |
| `read()` / `peek()` | Đọc từ buffer nhận |
| `stop()` | Đóng kết nối |
| `connected()` | Trạng thái: frame đã bắt tay **và** TLS còn sống |

**Phần then chốt — `available()` không được block:**

```cpp
  int available() override {
    // [FIX - NGUYÊN NHÂN GỐC] available() gốc của NetworkClientSecure gọi
    //   mbedtls_ssl_read(NULL,0) => CÓ THỂ BLOCK tới SO_RCVTIMEO (mặc định 30s).
    //   Vì vậy mỗi vòng loop() bị treo tới 30 giây -> không kịp gửi PINGREQ
    //   -> broker aedes ngắt kết nối với lỗi "keep alive timeout".
    //   Cách sửa: chỉ dùng peek() (không chặn) để lấy dữ liệu đã có sẵn.
    //   -> loop() chạy mượt, PINGREQ luôn đúng hạn, kết nối ổn định.
    _lastAvailCall = millis();
    pumpNonBlocking();
    maybePing();
    return _rxLen - _rxPos;
  }
```

> 🔑 **Đây là bug khó nhất của toàn bộ đồ án.** `available()` gốc của `NetworkClientSecure` gọi `mbedtls_ssl_read(NULL, 0)` — có thể **block tới 30 giây**. Hệ quả chuỗi:
>
> `loop() bị treo 30s` → `không kịp gửi PINGREQ` → `broker aedes ngắt kết nối: keep alive timeout` → `reconnect` → `lặp lại`.
>
> → triệu chứng: kết nối được rồi rớt liên tục, không ổn định.

**PINGREQ MQTT tự quản lý (bypass PubSubClient):**

```cpp
  // ---- PINGREQ MQTT tự quản lý --------------------------------------------
  // Gói PINGREQ của MQTT chỉ gồm 2 byte: 0xC0 0x00 (Fixed Header + Remaining Length).
  // Ta gửi trực tiếp (không qua PubSubClient) để CHẮC CHẮN broker luôn thấy
  // traffic trong khoảng thời gian keepalive. Nếu không có gói này, broker aedes
  // sẽ ngắt kết nối với thông báo "keep alive timeout".
  bool sendMqttPing() {
    if (!_wsReady) return false;
    uint8_t p[2] = { 0xC0, 0x00 };
    return sendFrame(0x2, p, 2);
  }
```

| Byte | Ý nghĩa |
|---|---|
| `0xC0` | Fixed Header: type = 12 (PINGREQ), flags = 0 → `1100 0000` |
| `0x00` | Remaining Length = 0 (không có payload) |

> Vì sao bypass? `PubSubClient` chỉ gửi PINGREQ khi `loop()` chạy và có traffic. Khi hệ thống **nhàn rỗi** (không có xe, không có lệnh) → không có traffic → broker ngắt kết nối. Gửi thẳng từ `available()`/`maybePing()` đảm bảo **luôn** có gói tin trong cửa sổ keepalive.

**Còn "ghi trọn vẹn frame WebSocket" (bug 17/11):**

```cpp
// [FIX] Gửi TRỌN VẸN frame (writeAll bên trong sendFrame) - nếu ghi
//   thiếu byte thì frame WebSocket bị hỏng -> broker không hiểu.
```

`WiFiClientSecure::write()` có thể ghi **partial** (ít byte hơn yêu cầu) — đặc biệt khi TLS buffer đầy. Nếu không lặp lại cho đủ → frame WebSocket thiếu byte → broker **không hiểu** → im lặng. Fix: `writeAll()` lặp cho tới khi ghi đủ.

### 4.2 Debounce cảm biến IR

```cpp
// --- Lọc nhiễu (debounce) cho cảm biến IR ---
// Nút bấm có tiếp xúc co "bounce" (tiếng dập khi nhấn) -> tín hiệu về 2 lần
// liên tiếp trong vài chục ms. Nếu không lọc, sẽ ghi nhận "xe vào" rồi
// ngay "xe ra" -> phát sinh hoá đơn sai.
// Quy tắc: tín hiệu mới chỉ được chấp nhận sau khi giữ liên tục
// DEBOUNCE_MS (200ms). Đọc cảm biến mỗi 50ms -> 4 lần xác nhận.
// 200ms là nhịp chân cho nút bấm có: đủ để chống bounce (thường <50ms)
// và đủ nhanh để thao tác trên Wokwi.
#define DEBOUNCE_MS 200
bool irRaw[NUM_SLOTS] = {false, false, false, false, false, false};   // tín hiệu thô
bool irStable[NUM_SLOTS] = {false, false, false, false, false, false}; // tín hiệu đã lọc
unsigned long irChangeAt[NUM_SLOTS] = {0, 0, 0, 0, 0, 0};            // lúc tín hiệu thay đổi
```

**3 biến, 2 vai trò:**

| Biến | Vai trò |
|---|---|
| `irRaw[i]` | Giá trị **thô** đọc từ cảm biến ở vòng lặp hiện tại |
| `irStable[i]` | Giá trị **đã lọc** — giá trị được công nhận, dùng để cập nhật nghiệp vụ |
| `irChangeAt[i]` | Thời điểm `irRaw` lần cuối **đổi** — dùng để đếm thời gian giữ ổn định |

**Thuật toán:**

```
mỗi 50ms:
  raw = đọcCảmBiến(i)
  if raw != irRaw[i]:
      irRaw[i] = raw
      irChangeAt[i] = millis()        // bắt đầu đếm lại
  else if (millis() - irChangeAt[i] >= DEBOUNCE_MS):
      irStable[i] = raw               // đã giữ ổn định 200ms → chấp nhận
```

**Ví dụ minh hoạ (bounce 20ms):**

```
t=0ms      raw=1  (nhấn)      irChangeAt=0
t=50ms     raw=0  (bounce)    irChangeAt=50   ← đếm lại
t=100ms    raw=1              irChangeAt=100  ← đếm lại
t=150ms    raw=1              (giữ 50ms)
t=200ms    raw=1              (giữ 100ms)
t=250ms    raw=1              (giữ 150ms) → chưa đủ 200ms
t=300ms    raw=1              (giữ 200ms) → irStable=1  ✅ CHẤP NHẬN
```

Nếu **không** debounce: t=0 nhận "xe vào", t=50 nhận "xe ra" → **phát sinh hoá đơn sai** (giá = 0đ vì ≤30 phút, nhưng log + lịch sử sai).

### 4.3 Tách `irShadow` / `manualMode`

```cpp
// "Bóng" cảm biến IR: giá trị của cảm biến gần nhất.
// Vòng lặp đọc IR so sánh irShadow với tín hiệu hiện tại.
// Không dùng slots[].occupied để so sánh, vì lệnh thủ công (ENTER/EXIT
// qua Serial) cũng set occupied -> sẽ bị vòng lặp ghi đè ngay lập tức.
bool irShadow[NUM_SLOTS] = {false, false, false, false, false, false};

// Ô nào đang được điều khiển thủ công (lệnh ENTER/EXIT từ Serial).
// Vòng lặp đọc IR bỏ qua các ô này để không ghi đè lệnh của người dùng.
bool manualMode[NUM_SLOTS] = {false, false, false, false, false, false};
```

**Vấn đề gốc (bug đã sửa):**

> Vòng lặp ban đầu so sánh cảm biến IR với `slots[].occupied` để phát hiện cạnh lên/xuống.
> Nhưng khi gõ lệnh Serial `ENTER:P1` → firmware set `slots[P1].occupied = true`.
> → Vòng lặp thấy IR (LOW = không có xe) ≠ `occupied` (true) → **ghi đè ngay lập tức** → lệnh Serial vô hiệu!

**Giải pháp — 2 mảng tách biệt:**

| Mảng | Ý nghĩa | Ai ghi |
|---|---|---|
| `irShadow[i]` | Trạng thái **cảm biến** lần trước | Chỉ vòng lặp IR |
| `manualMode[i]` | Ô này đang do **lệnh thủ công** điều khiển | Lệnh Serial |

```
Vòng lặp:
  if (!manualMode[i]) {                    // bỏ qua ô do lệnh tay điều khiển
      if (irRaw[i] != irShadow[i]) { ... cập nhật nghiệp vụ ... }
      irShadow[i] = irRaw[i];
  }
```

### 4.4 Nghiệp vụ đặt chỗ & chống trùng

```cpp
// Gửi kết quả của 1 lệnh đặt/hủy chỗ (kèm requestId để App khớp đúng
```

**Luồng đặt chỗ:**

```
App SV01 ──booking/P1/set──▶ ESP32 (kiểm tra occupied + reservedBy) ──▶ publish state ok=true
App SV02 ──booking/P1/set──▶ ESP32 (thấy reservedBy=SV01)          ──▶ publish state ok=false
                                                                    "O da duoc dat boi SV01"
```

**Điều kiện chống trùng (kiểm tra trên ESP32 — tầng thẩm quyền cao nhất):**

| Kiểm tra | Ý nghĩa |
|---|---|
| `slots[i].occupied` | Ô đang có xe → không đặt được |
| `slots[i].reservedBy` | Ô đã có người đặt → chỉ người đó mới hủy được |

**`requestId` — chống nhận nhầm phản hồi:**

```cpp
  d["requestId"] = req; d["ok"] = ok; d["msg"] = msg;
```

App gửi kèm `requestId` ngẫu nhiên → ESP32 trả lại **giữ nguyên** → App chỉ coi là thành công khi `state.requestId === requestId đã gửi`. Tránh trường hợp phản hồi của lệnh trước bị tính nhầm cho lệnh sau.

### 4.5 Tính phí

```cpp
minutes = (thời điểm xe ra - thời điểm xe vào) / 60000
fee = 0                                        nếu minutes ≤ 30
fee = ceil(minutes / 60) × 3000đ               nếu minutes > 30
```

**Kiểm chứng thật:**

| Thời gian | Phí | Ghi chú |
|---|---|---|
| 95 phút | **6000đ** | `ceil(95/60) = 2` → `2 × 3000` |
| 1 phút | **0đ** | ≤ 30 phút miễn phí |
| 30 phút | **0đ** | đúng ngưỡng |

> `ceil` = làm tròn **lên** → người dùng không bị làm tròn xuống (bất lợi).

### 4.6 RFID & Barrier

```cpp
MFRC522 rfid(RFID_SS, RFID_RST);  // đầu đọc thẻ RFID
```

| Tính năng | Mô tả |
|---|---|
| Ghi nhớ thẻ ↔ user | 8 thẻ được đăng ký |
| Quét thẻ mở barrier | Chỉ mở cho **ô đã đặt** của user đó |
| Publish sự kiện | `parking/gate/rfid` → App nhận biết |
| Barrier tự đóng | Sau **5 giây** |

**Trạng thái barrier được theo dõi bằng biến:**

```cpp
String gateState = "CLOSED";       // trạng thái cổng: CLOSED / OPEN
String gateOpenedBy = "";          // ai mở cổng (RFID, APP, SERIAL, AUTO)
unsigned long gateOpenedAt = 0;    // thời điểm mở cổng
```

`gateOpenedBy` cho phép App hiển thị *"Cổng mở bởi RFID A1B2C3"* — tăng giá trị minh hoạ.

### 4.7 OLED 6 dòng

```cpp
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);
```

| Dòng | Nội dung |
|---|---|
| 1 | Tiêu đề + trạng thái barrier |
| 2 | Bảng trạng thái 6 ô (ký hiệu trực quan) |
| 3 | Doanh thu / thông báo |
| 4 | Uptime + trạng thái MQTT |
| 5 | Thẻ RFID gần nhất |
| 6 | Thông báo ngắn (`statusMsg`) |

**Chống treo OLED (bài học thực tế):**

> Vòng lặp vẽ OLED có thể **treo** (deadlock khi đọc Serial, OLED treo) → Watchdog reset liên tục.
> → Bọc phần đọc Serial trong `if (Serial.available())` và giới hạn tần suất vẽ (`lastLcd`).

**Kiểm chứng:** đã đọc **trực tiếp mảng pixel trên canvas** của trình mô phỏng để xác nhận 6 dòng hiển thị đúng — không chỉ tin log Serial.

### 4.8 Watchdog & reconnect

```cpp
// [FIX] Không cho Watchdog reset khi bắt tay WSS; reconfigure WDT khi đã khởi động
```

| Vấn đề | Giải pháp |
|---|---|
| Bắt tay TLS/WSS mất > 30s → WDT reset | Reconfigure WDT **sau khi** kết nối thành công |
| Mất mạng → không có gì publish | Reconnect mỗi **3s** |
| Broker ngắt kết nối (keepalive) | Tự gửi PINGREQ (xem 4.1) |

**Biến theo dõi:**

```cpp
bool mqttOK = false;               // đang kết nối broker hay không
bool mqttWasOK = false;            // lần trước đó kết nối có thành công không (để log thời điểm rớt)
unsigned long lastMqttPing = 0;    // thời điểm gửi PINGREQ MQTT tự quản lý gần nhất
```

`mqttWasOK` cho phép **log đúng thời điểm rớt kết nối** (chỉ log khi trạng thái **thay đổi**, không log liên tục).

**LWT (Last Will and Testament):**

```cpp
    ok = mqtt.connect(id.c_str(), MQTT_USER, MQTT_PASS,
                      "parking/system/status", 1, true, "{\"online\":false}");
```

Broker sẽ tự publish `{"online":false}` khi ESP32 mất kết nối **đột ngột** → App hiện banner OFFLINE.

---

## 5. Chạy trên Wokwi

### 5.1 Chuẩn bị

| Thứ | Yêu cầu |
|---|---|
| Tài khoản Wokwi | Miễn phí, đăng nhập wokwi.com |
| Thư viện | `PubSubClient`, `ArduinoJson`, `ESP32Servo`, `MFRC522`, `Adafruit SSD1306`, `Adafruit GFX Library` |

File `esp32/libraries.txt`:
```
PubSubClient
ArduinoJson
ESP32Servo
MFRC522
Adafruit SSD1306
Adafruit GFX Library
```

### 5.2 Cách 1 — Wokwi for VS Code (khuyến nghị, tự đồng bộ GitHub)

```powershell
# Cài extension "Wokwi for VS Code"
code --install wokwi.wokwi-vscode
```

1. Mở thư mục `esp32/` trong VS Code
2. Kiểm tra `wokwi.toml`:
   ```toml
   [wokwi]
   firmware = "parking_firmware.ino"
   ```
3. Bấm **Start Simulation**

### 5.3 Cách 2 — Wokwi Web

1. Vào https://wokwi.com → đăng nhập
2. Tab **Code** → file `sketch.ino` → dán nội dung `esp32/parking_firmware.ino`
3. Kiểm tra `libraries.txt` (6 dòng, **không** thêm `arduinoWebSockets`) và `diagram.json`
4. **Save** → tab **Simulation** → **Start the simulation**

### 5.4 Điều khiển bằng Serial Monitor

| Lệnh | Tác dụng |
|---|---|
| `BOOK:P1:SV01` | Đặt chỗ ô P1 cho SV01 |
| `CANCEL:P1:SV01` | Huỷ đặt chỗ |
| `ENTER:P1:SV01` | Xe vào ô P1 |
| `EXIT:P1` | Xe ra ô P1 |
| `STAY:P1:95` | Giả lập xe đã đứng 95 phút → demo tính phí 6000đ |
| `GATE:OPEN` / `GATE:CLOSE` | Điều khiển barrier |
| `RFID:A1B2C3` | Giả lập quét thẻ |
| `DEMO` | Chạy kịch bản demo tự động |

**Bấm nút IR P1–P6** trên sơ đồ để giả lập xe vào/ra.

### 5.5 Log mong đợi

```
[MQTT] Chu bi smart-parking-ltdd2.onrender.com/mqtt (wss://)
[MQTT] OK -> smart-parking-ltdd2.onrender.com
Slots: X_____ MQTT:OK DT:6000d
```

---

## 6. Chạy trên ESP32 thật

### 6.1 Board

**ESP32 DevKit V1** (30-pin).

### 6.2 Nối dây theo bảng ở mục 2.1

**Lưu ý quan trọng về chân SPI (từ `esp32/README.md`):**

> - LCD1602 I2C: SDA=21, SCL=22, địa chỉ 0x27
> - RFID RC522: SDA=5, SCK=18, MOSI=23, MISO=19, RST=22
>   - ⚠️ **SDA=5, SCK=18(shared) → nên đổi sang 19 khi lắp thật**
> - Servo: GPIO 15, nguồn 5V riêng
> - Buzzer: GPIO 23 → *đã ghi chú thích trong code*
>
> *(Lưu ý: mã nguồn hiện dùng **OLED SSD1306** thay cho LCD1602 — đây là bản nâng cấp sau, giữ nguyên chân I2C 21/22.)*

### 6.3 Sửa cấu hình

```cpp
const char* MQTT_HOST = "192.168.1.100";   // IP máy tính chạy Docker broker
const char* MQTT_USER = "esp32";
const char* MQTT_PASS = "esp32123";
#define MQTT_USE_WS  0                      // local dùng MQTT/TCP
```

### 6.4 Nạp firmware

**Arduino IDE:**
1. File → Preferences → Additional Boards Manager URLs → thêm:
   `https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json`
2. Boards Manager → cài **esp32 by Espressif Systems** (core 3.x)
3. Tools → Board → **ESP32 Dev Module**
4. Tools → Partition Scheme → **Default 4MB with spiffs**
5. Nạp `esp32/parking_firmware.ino`
6. Tools → Serial Monitor → **115200 baud**

### 6.5 Thư viện cần cài trong Arduino IDE

| Thư viện | Nguồn |
|---|---|
| PubSubClient | Knolleary |
| ArduinoJson | Benoit Blanchon (>= 6) |
| ESP32Servo | Kevin Harrington |
| MFRC522 | Miguel Balboa |
| Adafruit SSD1306 | Adafruit |
| Adafruit GFX Library | Adafruit |

---

## 7. Kiểm thử

### 7.1 Test firmware trong CI

`.github/workflows/ci.yml` — job `app-syntax` kiểm tra syntax cho **7 file JSX** app + **5 file JS** backend + **3 file Python** simulator.

### 7.2 Test tích hợp qua simulator

```powershell
# Bộ test E2E đầy đủ (39 checkpoint) - thay thế ESP32 bằng simulator
python simulator/test_suite.py
# KET QUA: 39/39 PASS
```

Simulator `simulator/parking_simulator.py` **mô phỏng đúng hành vi firmware** — cùng topic, cùng payload JSON, cùng quy tắc `requestId`, cùng logic tính phí.

### 7.3 Checklist kiểm chứng thủ công trên Wokwi

| # | Kiểm tra | Mong đợi |
|---|---|---|
| 1 | Mở simulation | OLED hiện 6 dòng, log `[MQTT] OK` |
| 2 | Bấm nút P1 | Ô P1 chuyển màu "có xe", App cập nhật |
| 3 | Gõ `BOOK:P2:SV01` | OLED hiện "P2: SV01", publish `booking/P2/state` |
| 4 | Gõ `BOOK:P2:SV02` | Bị từ chối: *"O da duoc dat boi SV01"* |
| 5 | Gõ `STAY:P3:95` rồi `EXIT:P3` | Hoá đơn **6000đ** |
| 6 | Gõ `GATE:OPEN` | Servo mở, sau 5s tự đóng |
| 7 | Gõ `RFID:A1B2C3` | Barrier mở, publish `gate/rfid` |
| 8 | Rút WiFi | App hiện banner OFFLINE (LWT) |
| 9 | Bấm nút nhiều lần nhanh | Chỉ 1 lần đổi trạng thái (debounce) |

---

## 8. Bài học kỹ thuật (9 bug đã sửa)

| # | Lỗi | Nguyên nhân | Sửa |
|---|---|---|---|
| 1 | OLED trắng xanh | 3 lỗi: part deprecated + tên chân + tiền tố `D` | Xem mục 2.3 |
| 2 | Lệnh `ENTER` bị IR ghi đè | So sánh cảm biến với `slots[].occupied` | Tách `irShadow` / `manualMode` (4.3) |
| 3 | Nhiễu bounce nút bấm | Không lọc debounce | `DEBOUNCE_MS 200` + 3 biến (4.2) |
| 4 | Thư viện WebSocket lỗi core 3.x | `WebSocketStreamClient` viết cho core 2.x | Tự viết `MqttWsClient` RFC6455 (4.1) |
| 5 | Watchdog reset khi bắt tay WSS | Bắt tay TLS lâu > 30s | Reconfigure WDT sau khi kết nối |
| 6 | Mất kết nối "keep alive timeout" | `available()` block 30s → không gửi PINGREQ | `peek()` không chặn + `sendMqttPing()` (4.1) |
| 7 | Frame WebSocket hỏng | `write()` ghi partial | `writeAll()` lặp tới đủ (4.1) |
| 8 | Mất kết nối qua Cloudflare | PING/keepalive quá dài | PING 12s, keepalive 10s, heartbeat 8s |
| 9 | Chứng thư thiếu AKI | Không có AuthorityKeyIdentifier | Thêm AKI vào `make_certs.py` (Lab 2) |

---

## 9. Xử lý lỗi thường gặp

| Triệu chứng | Nguyên nhân | Cách sửa |
|---|---|---|
| OLED trắng xanh | 3 lỗi mục 2.3 | Sửa đồng thời cả 3 |
| "Build failed" trên Wokwi | `libraries.txt` có `arduinoWebSockets` (thừa) | Xoá → chỉ giữ 6 thư viện |
| Firmware không compile | Thiếu `MqttWsClient` | Kiểm tra class đã khai báo đầu file |
| Đọc Serial treo | `Serial.read()` chặn | Dùng `if (Serial.available())` |
| Kết nối rồi rớt liên tục | `available()` block / thiếu PINGREQ | Xem 4.1 |
| `keep alive timeout` | Không có traffic trong keepalive window | `sendMqttPing()` tự quản lý |
| Không thấy trạng thái trên App | Sai broker/user | Kiểm tra `MQTT_HOST`, `MQTT_USER`, `MQTT_PASS` |
| Tính phí sai | `millis()` tràn (~49 ngày) | Dùng `unsigned long` + so sánh chênh lệch |
| Xe vào rồi ra liên tục | Chưa debounce | `DEBOUNCE_MS 200` |

---

## PHỤ LỤC — File liên quan

| File | Vai trò |
|---|---|
| `esp32/parking_firmware.ino` | Firmware chính (1326 dòng) |
| `esp32/sketch.ino` | Bản sao để paste lên Wokwi Web |
| `esp32/diagram.json` | Sơ đồ mô phỏng Wokwi (11 part) |
| `esp32/libraries.txt` | 6 thư viện cần dùng |
| `esp32/wokwi.toml` | Cấu hình firmware cho Wokwi VS Code |
| `esp32/BOM.md` | Danh sách linh kiện + giá |
| `esp32/README.md` | Hướng dẫn nối dây + chạy |
| `simulator/parking_simulator.py` | Simulator thay thế ESP32 (cùng hành vi) |

---

> **Tài liệu Lab 1 — Smart Parking LTDD2** · cập nhật 23/11/2026
> Repo: https://github.com/Phong220205/smart-parking-ltdd2
