# CẬP NHẬT LINK WOKWI — HƯỚNG DẪN CHI TIẾT (Ô #3)

> **Link cần cập nhật:** https://wokwi.com/projects/480840614046528513
> **Tên project:** `smart-parking-ltdd2 Copy`
> **Trạng thái:** ⚠️ firmware trên link là bản **17/11** — dùng thư viện `WebSocketStreamClient` (areve) viết cho Arduino core 2.x → **không biên dịch được trên core 3.x** → Wokwi báo *"Build failed!"*

---

## ⚡ Tóm tắt: cần 6 phút, chỉ 1 việc duy nhất

> **Bạn cần đăng nhập Wokwi.** Mọi cách khác (paste tự động, API, CLI) đều cần token đăng nhập — tôi đã thử và xác nhận.
> Sau khi đăng nhập, paste **1 file duy nhất** là xong. `diagram.json` và `libraries.txt` trên Wokwi **đã đúng, không cần đổi**.

---

## BƯỚC 1 — Đăng nhập Wokwi (1 phút)

1. Mở https://wokwi.com/projects/480840614046528513
2. Bấm **Sign in** (góc trên phải) → đăng nhập bằng Google hoặc GitHub
3. Quay lại project → tab **Code** phải mở được và **cho phép sửa**

> Không có tài khoản? Tạo miễn phí tại https://wokwi.com — mất khoảng 1 phút.

---

## BƯỚC 2 — Paste firmware mới (3 phút)

1. Trên máy tính, mở file: **`D:\LTDD2\esp32\sketch.ino`**
   - Dung lượng: **58.467 ký tự · 1.333 dòng**
   - File này đã được đồng bộ với `parking_firmware.ino` (có fix ngày 23/11)

2. Chọn **toàn bộ** nội dung: `Ctrl + A` → `Ctrl + C`

3. Trên Wokwi, tab **Code** → click file **`sketch.ino`** trong danh sách bên trái

4. Trong editor, chọn hết nội dung cũ: `Ctrl + A` → `Delete`

5. Paste: `Ctrl + V`

6. **Kiểm tra số dòng** ở góc dưới editor phải hiện **~1333 dòng**
   - Nếu hiện số nhỏ hơn nhiều (ví dụ 800) → paste bị thiếu → làm lại Bước 2

7. Bấm **Save** (nút ở góc trên trái, sẽ chuyển từ *disabled* sang bấm được)

---

## BƯỚC 3 — Kiểm tra 2 file còn lại (KHÔNG sửa) (30 giây)

| File | Trạng thái đúng | Nếu sai thì sửa thành |
|---|---|---|
| `libraries.txt` | Đúng 6 dòng (xem bên dưới) | Bỏ hết dòng thừa |
| `diagram.json` | **Giữ nguyên** — đã đúng 100% | Không sửa |

**`libraries.txt` phải có đúng 6 dòng này (không thêm, không bớt):**

```
PubSubClient
ArduinoJson
ESP32Servo
MFRC522
Adafruit SSD1306
Adafruit GFX Library
```

> ❌ **KHÔNG** thêm `arduinoWebSockets` hay `WebSocketStreamClient` — đó chính là nguyên nhân *Build failed*.

> ✅ `diagram.json` trên Wokwi đã đúng hoàn toàn:
> - Part OLED là `board-ssd1306` (KHÔNG phải `wokwi-ssd1306` — bản cũ đã deprecated)
> - Chân OLED: `oled:VCC→esp:3V3`, `oled:SDA→esp:D21`, `oled:SCL→esp:D22`
> - 6 nút IR → `esp:D13, D12, D14, D27, D26, D25`
> - RFID: `SDA→D5`, `SCK→D18`, `MOSI→D23`, `MISO→D19`, `RST→D4`

---

## BƯỚC 4 — Chạy thử & xác minh (1 phút)

Bấm tab **Simulation** → **Start the simulation**

### Phải thấy trên Serial Monitor:

```
[MQTT] Chu bi smart-parking-ltdd2.onrender.com/mqtt (wss://)
[MQTT] OK -> smart-parking-ltdd2.onrender.com
Slots: X_____ MQTT:OK DT:0d
```

### Phải thấy trên OLED (6 dòng):

| Dòng | Nội dung |
|---|---|
| 1 | `BAI DO XE THONG MINH` + trạng thái cổng |
| 2 | Sơ đồ 6 ô (ký hiệu trạng thái) |
| 3 | Doanh thu / thông báo |
| 4 | Uptime + `MQTT:OK` |
| 5 | Thẻ RFID gần nhất |
| 6 | Thông báo ngắn |

### Nếu OLED trắng xanh (màn không sáng):

| Nguyên nhân | Cách sửa |
|---|---|
| `diagram.json` dùng `wokwi-ssd1306` | Đổi thành `board-ssd1306` + chân `VCC/SDA/SCL` |
| Thiếu tiền tố `D` | `esp:21` → `esp:D21`, `esp:22` → `esp:D22` |

*(2 nguyên nhân này phải sửa **cùng lúc**. Sai chân vẫn build OK, chỉ OLED không sáng.)*

### Nếu vẫn "Build failed":

Kiểm tra `libraries.txt` đúng 6 dòng ở Bước 3, rồi **Save** lại `sketch.ino`.

---

## BƯỚC 5 — Chia sẻ link (30 giây)

1. Bấm nút **Share** (góc trên phải)
2. Chọn quyền **"Anyone with the link"** — GV mở được **không cần đăng nhập**
3. Copy link → dán vào ô #3 trong `LINK_NOP_BAI.md`

---

## ✅ Checklist xác nhận hoàn thành

| # | Hạng mục | Trạng thái |
|---|---|---|
| 1 | Đã đăng nhập Wokwi | ⬜ |
| 2 | `sketch.ino` = 1333 dòng | ⬜ |
| 3 | `libraries.txt` = đúng 6 dòng | ⬜ |
| 4 | `diagram.json` giữ nguyên | ⬜ |
| 5 | Simulation chạy, OLED hiện 6 dòng | ⬜ |
| 6 | Serial log có `[MQTT] OK` | ⬜ |
| 7 | Share = "Anyone with the link" | ⬜ |

---

## 🔄 Phương án thay thế (KHÔNG cần đăng nhập Wokwi)

Nếu bạn không muốn đăng nhập Wokwi, dùng **Wokwi for VS Code** — extension đã cài sẵn (v4.1.0):

```powershell
code D:\LTDD2\esp32
```

1. Mở VS Code với thư mục `esp32/`
2. Kiểm tra `wokwi.toml` (đã đúng):
   ```toml
   [wokwi]
   firmware = "parking_firmware.ino"
   ```
3. Bấm **Wokwi: Start Simulation** trong Command Palette (`Ctrl+Shift+P`)
4. OLED + Serial hiện ngay trong VS Code

> ⚠️ Extension này **cũng cần license Wokwi** để build. Nhưng nếu đã đăng nhập Wokwi web thì dùng cách này **tiện hơn** — không phải paste 58KB, firmware tự đồng bộ từ file trên đĩa.

### Phương án thay thế 2 — demo bằng simulator Python (không cần Wokwi)

Simulator đang chạy sẵn trên server cloud, thay đúng vai trò ESP32:

```powershell
python simulator/parking_simulator.py --mode demo `
  --ws wss://smart-parking-ltdd2.onrender.com/mqtt --user esp32 --password esp32123
```

**Hiện tại: `online:true` ✅ — simulator đang chạy và kết nối server cloud thật.**

---

## 📌 Thông tin kỹ thuật firmware mới (để trả lời GV nếu hỏi)

| Đặc điểm | Chi tiết |
|---|---|
| **Lớp MQTT tự viết** | `MqttWsClient` — cài đặt chuẩn **RFC 6455** (WebSocket) |
| **Vì sao tự viết** | `WebSocketStreamClient` (areve) viết cho core 2.x → core 3.x đổi interface `Client` → *"cannot declare variable ... to be of abstract type"* |
| **Vòng lặp không block** | `available()` dùng `peek()` (không chặn) — tránh treo 30s → hỏng keepalive |
| **PINGREQ tự quản lý** | `sendMqttPing()` gửi `0xC0 0x00` trực tiếp, **bypass PubSubClient** → broker luôn thấy traffic |
| **Write trọn vẹn** | `writeAll()` lặp tới khi gửi đủ → tránh frame WebSocket hỏng |
| **Debounce IR** | `DEBOUNCE_MS = 200` — 4 lần xác nhận (đọc mỗi 50ms) |
| **Tách bóng cảm biến** | `irShadow[]` + `manualMode[]` — lệnh Serial `ENTER/EXIT` không bị vòng lặp IR ghi đè |
| **Tính phí** | 30 phút miễn phí → `ceil(phút/60) × 3000đ` (95′ → 6000đ) |
| **Giữ chỗ** | 5 phút, hết hạn tự huỷ + giải phóng ô |
| **Barrier** | Tự đóng sau 5 giây, ghi `openedBy` (RFID/APP/SERIAL/AUTO) |
| **LWT** | Broker tự publish `{"online":false}` khi ESP32 mất kết nối đột ngột |
| **Status định kỳ** | Publish lại `parking/system/status` mỗi 8s → server restart vẫn nhận đúng |

---

## 🐛 Danh sách bug Lab 1 đã sửa (có thể hỏi GV)

| # | Lỗi | Nguyên nhân gốc |
|---|---|---|
| 1 | OLED trắng xanh | 3 lỗi: part deprecated + tên chân + thiếu tiền tố `D` |
| 2 | Lệnh `ENTER` bị IR ghi đè | So sánh cảm biến với `slots[].occupied` |
| 3 | Nhiễu bounce nút bấm | Thiếu debounce → sinh hoá đơn sai |
| 4 | Build failed trên core 3.x | Thư viện `WebSocketStreamClient` không tương thích |
| 5 | Watchdog reset khi bắt tay WSS | Bắt tay TLS lâu hơn 30s |
| 6 | Keep alive timeout | `available()` block 30s → không gửi PINGREQ |
| 7 | Frame WebSocket hỏng | `write()` ghi partial, thiếu byte |
| 8 | Mất kết nối qua Cloudflare | PING/keepalive quá dài |
| 9 | Server báo OFFLINE sau restart | `system/status` chỉ publish 1 lần → thêm publish định kỳ |

---

> **Cập nhật link Wokwi — Smart Parking LTDD2** · 23/11/2026
> Repo: https://github.com/Phong220205/smart-parking-ltdd2
