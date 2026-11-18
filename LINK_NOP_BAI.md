# LINK NỘP BÀI – BÃI ĐỖ XE THÔNG MINH (bản 2.0)

| # | Ô trong hình GV | Link | Trạng thái |
|---|---|---|---|
| 1 | Link Github Project | https://github.com/Phong220205/smart-parking-ltdd2 | ✅ có (CI badge xanh: 39/39 PASS) |
| 2 | Link github source Arduino | https://github.com/Phong220205/smart-parking-ltdd2/blob/master/esp32/parking_firmware.ino | ✅ có |
| 3 | Link Wokwi | https://wokwi.com/projects/481021450080913409 | ⚠️ **CẦN CẬP NHẬT** — firmware trên link là bản 16/11 (dùng `WebSocketStreamClient`), **Build failed** vì thiếu thư viện. Phải nạp lại firmware mới (xem mục "Cập nhật link Wokwi" bên dưới) |
| 4 | Link source code Backend | https://github.com/Phong220205/smart-parking-ltdd2/tree/master/backend | ✅ có |
| 5 | **Link Server cloud** | **https://smart-parking-ltdd2.onrender.com** | ✅ **ĐÃ DEPLOY THẬT** (Render free, HTTPS, MQTT-WS bridge `/mqtt`) |
| 6 | Link Source Code App | https://github.com/Phong220205/smart-parking-ltdd2/tree/master/app | ✅ có |
| 7 | Link báo cáo + slide | Chưa có | ⬜ xuất `docs/BaoCao_LTDD2_BaiDoXe.docx` + `docs/Slide_ThuyetTrinh.pptx` → up Drive share Anyone → dán link |
| 8 | Link phần mềm / video demo | Chưa có | ⬜ quay theo `docs/MINH_CHUNG.md` → up YouTube unlisted/Drive → dán link |

### 🌐 Server cloud đã deploy — dùng ngay

| Thành phần | Địa chỉ |
|---|---|
| **Web Dashboard (mở trên máy/điện thoại)** | https://smart-parking-ltdd2.onrender.com |
| **REST API** | https://smart-parking-ltdd2.onrender.com/api/... |
| **MQTT over WebSocket (App)** | wss://smart-parking-ltdd2.onrender.com/mqtt |
| **Broker MQTT public** | test.mosquitto.org:1883 (không user/pass) |

**Trong App React Native** chỉ cần nhập **1 dòng**:
```
https://smart-parking-ltdd2.onrender.com
```
→ App tự suy ra REST + MQTT-WS. (Xem `backend/DEPLOY.md` để biết chi tiết.)

---

## Đã test thật ngày 16/11/2026 (máy SV, không phần cứng)

**Môi trường**: Docker 28.5.1 · Mosquitto 2.0.22 · Node 24.19.0 · Python 3.13.9 · Chrome.

| Hạng mục | Kết quả |
|---|---|
| Broker | ✅ Up, mở 1883 + 9001, user `esp32`/`app` + ACL |
| Simulator (thay ESP32) | ✅ nối broker, 3 mode, 6 lệnh console |
| Backend REST | ✅ 19 endpoint, lưu JSON bền vững, SSE realtime, rate limit + validate input |
| Đặt chỗ + **chống trùng** | ✅ SV01 đặt P5 OK; SV02 đặt trùng → `ok:false "O da duoc dat boi SV01"` |
| Xe vào / xe ra | ✅ `ENTERED` → `FREE` + publish receipt |
| **Tính phí** | ✅ 95 phút → **6000đ**; 1 phút → 0đ |
| **Thống kê** | ✅ doanh thu 7 ngày, theo giờ, top user |
| **Tài khoản** | ✅ đăng ký / đăng nhập (JWT) / sai mật khẩu → 401 / nạp tiền ví |
| **Dashboard 5 tab** | ✅ 3 biểu đồ Chart.js, 3 bảng lịch sử, quản lý user |
| **Firmware V2 trên Wokwi** | ✅ build OK, OLED hiển thị 6 dòng (đọc pixel canvas xác nhận), MQTT OK, tự reconnect |
| **App React Native** | ✅ bundle Android thành công (552 modules, 2.17 MB) |
| **Bộ test tự động E2E** | ✅ `simulator/test_suite.py` — **39/39 PASS** |
| **CI GitHub Actions** | ✅ `.github/workflows/ci.yml` — 2 job (test E2E + app syntax) — **đã sửa lỗi YAML, đang xanh** |
| **MQTT-WS Bridge (2 chiều)** | ✅ `wss://smart-parking-ltdd2.onrender.com/mqtt` — App → Broker → App, đúng `requestId` |
| **Server cloud thật** | ✅ Render free: https://smart-parking-ltdd2.onrender.com — REST + SSE + Dashboard + bridge đều OK |

Chi tiết đầy đủ + **8 bug đã tìm & sửa**: xem `docs/KET_QUA_TEST.md`.

### Chạy lại bộ test (1 lệnh)
```powershell
python simulator/test_suite.py
```
→ in ra `KET QUA: 39/39 PASS`. Bộ test tự bật/tắt simulator nên không cần chuẩn bị gì.
**CI tự động**: `.github/workflows/ci.yml` — mỗi lần push GitHub sẽ tự chạy lại đủ 39 checkpoint
+ kiểm thử TLS 5/5. *(Đã sửa lỗi YAML khiến workflow không parse — xem mục "Sửa lỗi" bên dưới.)*

---

## Việc còn lại (5 phút mỗi việc)

1. **App trên điện thoại**:
   ```powershell
   cd app; npm install; npx expo start
   ```
   → cài Expo Go → quét QR → tab **⚙️ Cài đặt kết nối** → dán
   `https://smart-parking-ltdd2.onrender.com` → chế độ **🌐 Qua Backend**.
   *(Điện thoại và máy tính phải cùng mạng WiFi nếu chạy local; dùng link cloud thì không cần.)*

2. **Báo cáo + slide** (ô #7): file đã sinh sẵn ở `docs/`.
   - `docs/BaoCao_LTDD2_BaiDoXe.docx` (50 KB)
   - `docs/Slide_ThuyetTrinh.pptx` (15 slide)
   → Upload Drive → share "Anyone with the link" → dán link

3. **Video demo** (ô #8): theo kịch bản `docs/MINH_CHUNG.md`.
   Nếu quay trên **server cloud**, chạy trước simulator gắn vào broker cloud:
   ```powershell
   python simulator/parking_simulator.py --mode quiet `
     --ws wss://smart-parking-ltdd2.onrender.com/mqtt --user esp32 --password esp32123
   ```

4. **Kiểm tra link Wokwi**: bấm **Share** trên Wokwi (đã share sẵn) → chắc chắn "Anyone with the link".

> ⏱️ Render free ngủ sau ~15 phút không có request → lần mở đầu tiên có thể chờ 30–60 giây.

---

## Sửa lỗi ngày 17/11/2026 (4 lỗi nghiêm trọng)

Khi chạy lại toàn bộ hệ thống trên máy thật, phát hiện 4 lỗi làm **đứt đường kết nối
App → Broker → Server trên cloud** — tính năng quan trọng nhất của đồ án:

| # | Lỗi | Sửa |
|---|---|---|
| 12 | `test_bridge.js` không gửi user/password → *"Bad username or password"* (FAIL cả cloud) | Gửi `app/app123` giống hệt App |
| 13 | Backend nối nhầm broker khi cổng 1883 bị chiếm → mất trạng thái | Broker tự dò cổng trống (1883→1884…), backend chờ cổng thật rồi nối, `/api/health` trả `brokerPort` |
| 14 | Simulator không bật TLS với `wss://` → *"WebSocket handshake error"* | Tự bật TLS khi scheme là `wss://` |
| 15 | Log broker in trùng lặp | Một listener `"error"` duy nhất + sự kiện `"listening"` |
| 16 | **CI workflow không parse được YAML** (3 lần push đều fail sau 0 giây) | Bọc nháy tên step chứa dấu `:` |
| 17 | CI: `Permission denied` khi đọc file `passwd` | `sudo chmod 644` trước khi đọc |
| 18 | CI: backend dùng nhầm broker nội bộ thay vì Mosquitto có TLS | Đặt `EMBED_BROKER=false` + `MQTT_URL` trong CI |

**Kiểm chứng**: 39/39 PASS (cổng 1883 trống) · 39/39 PASS (1883 bị chiếm) ·
bridge 2 chiều PASS trên cloud · simulator nối cloud → `online:true` ·
**CI GitHub Actions xanh**: 39/39 PASS + TLS 5/5 PASS.
Chi tiết: `docs/KET_QUA_TEST.md` mục 10 & 13.

---

## ⚠️ Cập nhật link Wokwi (ô #3) — bắt buộc trước khi nộp

**Vấn đề**: link Wokwi `https://wokwi.com/projects/480840614046528513` đang trỏ tới
firmware bản **16/11** — bản dùng thư viện `WebSocketStreamClient` (areve).
Thư viện đó viết cho Arduino core 2.x, **không biên dịch được trên core 3.x**
(lỗi: *"cannot declare variable ... to be of abstract type"*) → Wokwi báo
**"Build failed!"** và project không chạy được.

**Nguyên nhân gốc đã được xử lý trong repo** (commit `dbe9dbe`): viết lớp
`MqttWsClient` tự viết theo chuẩn RFC 6455 → bỏ hẳn thư viện lỗi, chỉ còn
6 thư viện có sẵn trong `libraries.txt` → **build được**.

**Cách cập nhật** (cần đăng nhập Wokwi — 5 phút):

1. Vào https://wokwi.com/projects/480840614046528513 → bấm **Sign in** (góc trên phải)
2. Tab **Code** → chọn file **`sketch.ino`**
3. Xoá hết nội dung cũ → dán toàn bộ nội dung file
   `esp32/sketch.ino` (đã tạo sẵn, 62 KB / 1326 dòng — trùng `parking_firmware.ino`)
4. Bấm **Save**
5. Kiểm tra tab `libraries.txt` và `diagram.json` — **giữ nguyên** (đã khớp repo)
6. Tab **Simulation** → **Start the simulation** → phải hiện OLED 6 dòng +
   Serial log `[MQTT] OK -> smart-parking-ltdd2.onrender.com`
7. Bấm **Share** → chắc chắn quyền **"Anyone with the link"** (không cần đăng nhập
   khi GV mở link)

> **Nếu thay firmware mà vẫn lỗi build**: kiểm tra `libraries.txt` phải có đúng 6 dòng:
> `PubSubClient`, `ArduinoJson`, `ESP32Servo`, `MFRC522`, `Adafruit SSD1306`,
> `Adafruit GFX Library` — **KHÔNG** thêm `arduinoWebSockets`/`WebSocketStreamClient`.

### Thay thế nếu không cập nhật được Wokwi

Firmware trong repo (`esp32/`) là bản **đúng và đã build OK** ở link GitHub
(ô #2). Nếu GV chỉ cần xem firmware + mô phỏng, có thể:
- Dùng **Wokwi for VS Code** (mở thư mục `esp32/` → Start Simulation) — tự đồng bộ từ GitHub
- Hoặc demo bằng **simulator Python** (đang chạy được, thay đúng vai trò ESP32):
  ```powershell
  python simulator/parking_simulator.py --mode demo --ws wss://smart-parking-ltdd2.onrender.com/mqtt --user esp32 --password esp32123
  ```
