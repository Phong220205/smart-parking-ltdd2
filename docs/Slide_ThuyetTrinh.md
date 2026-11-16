# SLIDE THUYẾT TRÌNH – BÃI ĐỖ XE THÔNG MINH (10-12 phút) — Phiên bản 2.0

> Quy ước: mỗi slide **1 hình minh hoạ + 3–5 dòng chữ**. Demo live 2 điện thoại đặt trùng P3.

---

### Slide 1 – Bìa
- Tên đề tài: **BÃI ĐỖ XE THÔNG MINH (SMART PARKING)**
- Học phần LTDD2 · Nhóm ... · Lớp ... · GVHD ... · Học kỳ ...
- *Gợi ý hình: logo trường + ảnh sơ đồ 6 ô.*

### Slide 2 – Vấn đề thực tế
- Bãi xe thủ công: **không biết ô nào trống**, phải chạy vòng tìm.
- **Tranh chỗ giờ cao điểm** – mất thời gian và năng lượng.
- Không có cơ chế **giữ chỗ từ xa**, vẫn phải bố trí người trực.
- **Tính phí thủ công** dễ sai, và **không có dữ liệu** để quản lý bãi.
- *Gợi ý hình: ảnh bãi xe đông, biển số xếp hàng.*

### Slide 3 – Mục tiêu & phạm vi
| Lab | Mục tiêu |
|---|---|
| Lab1 | ESP32: 6 IR, RFID RC522, Servo barrier, **OLED SSD1306**, Buzzer; MQTT + LWT + reconnect |
| Lab2 | Mosquitto Docker: 1883 + 9001 WebSocket, ACL phân quyền, QoS1 + retain |
| Lab3 | App React Native Expo: sơ đồ 6 ô realtime, đặt/hủy chỗ, barrier, popup thanh toán, banner ONLINE |
| Server | REST + SSE + lưu JSON + JWT + thống kê doanh thu |

- **Toàn bộ mô phỏng 100%** – không cần phần cứng thật.
- *Gợi ý hình: sơ đồ khối 4 tầng.*

### Slide 4 – Kiến trúc hệ thống
```
ESP32 (thật/Wokwi)  ──MQTT 1883──▶  Mosquitto Broker  ──WS 9001──▶  App React Native
6 IR · RFID · Servo · OLED                                          (4 tab)
                                              │
                                              └──MQTT──▶  Backend Express ──▶ Web Dashboard (5 tab)
                                                            REST + SSE + JSON + JWT
```
- **3 tầng tách bạch**: thiết bị (trạng thái vật lý) → truyền tải → nghiệp vụ.
- ESP32 là **nguồn sự thật duy nhất** cho trạng thái ô.
- *Gợi ý hình: sơ đồ khối vẽ tay + mũi tên luồng dữ liệu.*

### Slide 5 – Giao thức MQTT (chi tiết bảng)
| Topic | Hướng | QoS | Retain |
|---|---|---|---|
| `parking/slot/<ID>/status` | ESP32 → App | 1 | ✅ |
| `parking/slots/snapshot` | ESP32 → App | 1 | ✅ |
| `parking/booking/<ID>/set` | App → ESP32 | 1 | ❌ |
| `parking/booking/<ID>/state` | ESP32 → App | 1 | ✅ |
| `parking/gate/barrier/cmd` | App → ESP32 | 1 | ❌ |
| `parking/billing/receipt` | ESP32 → App | 1 | ✅ |
| `parking/system/status` | ESP32 → App | 1 | ✅ (LWT) |

- **Chống trùng bằng `requestId`**: App gửi kèm `requestId`, chỉ nhận `state` có **cùng `requestId`** mới coi là thành công.
- **ACL**: user `app` chỉ được *đọc* trạng thái, *ghi* lệnh → không thể giả mạo cảm biến.
- *Gợi ý hình: ảnh log broker hiện PUBLISH/SUBSCRIBE.*

### Slide 6 – Phần cứng & giả lập (Lab1)
| Cảm biến | Chân | | Cảm biến | Chân |
|---|---|---|---|---|
| IR P1..P6 | 13,12,14,27,26,25 | | RFID RC522 | SS5, RST4, SPI 18/19/23 |
| Servo barrier | 15 | | OLED SSD1306 | SDA21, SCL22 |
| Buzzer | 2 | | | |

- ⚠️ **Bài học**: phải dùng `board-ssd1306` + `esp:D21/D22` – sai chân thì màn **trắng xanh** dù code đúng.
- Lệnh Serial demo: `BOOK:P1:SV01`, `ENTER:P1:SV01`, `EXIT:P1`, `RFID:A1B2C3`, `DEMO`.
- **BOM ~400–500k** nếu mua thật.
- *Gợi ý hình: ảnh Wokwi đang chạy, OLED hiện "Trong: 5/6 CLOSED".*

### Slide 7 – Broker (Lab2)
- `docker-compose.yml` – image `eclipse-mosquitto:2.0`, cổng **1883** (ESP32) + **9001** (App WebSocket).
- User `esp32/esp32123` (thiết bị) và `app/app123` (ứng dụng) + file `acl.conf`.
- QoS 1 + Retain cho snapshot/booking/gate → App mới vào thấy ngay trạng thái.
- **LWT**: ESP32 mất mạng → Broker tự publish `{"online":false}`.
- *Gợi ý hình: ảnh `docker compose ps` + log `CONNECT / PUBLISH`.*

### Slide 8 – Server & Web Dashboard (nâng cấp)
- **Backend Node/Express**: 19 endpoint REST + **SSE realtime** (`/api/stream`).
- Lưu trữ bền vững `data/parking.json` – không cần database.
- **JWT token** ký HMAC-SHA256, mật khẩu hash SHA-256.
- **Bảo mật API**: rate limit 120 req/phút/IP → 429 · validate input (mã ô `P1..P6`, allowlist action) → 400 · 404/500 JSON chuẩn · log request kèm thời gian xử lý.
- **Chẩn đoán**: `GET /api/health/deep` → uptime, MQTT, số liệu, bộ nhớ.
- **Dashboard 5 tab**: Sơ đồ bãi · Thống kê (Chart.js) · Lịch sử · Người dùng · Cài đặt.
- *Gợi ý hình: ảnh Dashboard tab Thống kê (biểu đồ cột + đường + tròn).*

### Slide 8b – MQTT-over-WebSocket Bridge & Server cloud (điểm nhấn kỹ thuật)
- **Vấn đề thật**: App React Native chỉ nối MQTT qua **WebSocket**; broker public
  mở 1883 + 443 nhưng **không bật WS 8084** → App không kết nối được broker cloud.
- **Giải pháp**: Backend làm proxy `wss://<server>/mqtt` → `mqtt://<broker>:1883`.
- **1 kết nối MQTT duy nhất** chia sẻ cho N App · lọc topic theo client · tự phát lại retain · cache message.
- **Server cloud thật (Render free)**: `https://smart-parking-ltdd2.onrender.com`
  → REST + SSE + Dashboard + bridge, tất cả trong **1 URL duy nhất**.
- **Trong App chỉ nhập 1 dòng** → App tự suy ra REST + MQTT-WS.
- *Gợi ý hình: sơ đồ App → Bridge → Broker + ảnh Dashboard trên điện thoại mở link cloud.*

### Slide 9 – Ứng dụng di động (Lab3)
- **4 tab**: 🅿️ Bãi · 🧾 Lịch sử · 📊 Thống kê · 👤 Tài khoản.
- Màu ô: xanh trống / đỏ có xe / vàng bạn đặt / cam đã đặt.
- Đăng nhập được (đăng ký, JWT, ví nạp tiền, lịch sử cá nhân).
- Xử lý lỗi: banner ONLINE/OFFLINE, **timeout đặt chỗ 5s**, tự reconnect 2s, `try/catch` payload.
- *Gợi ý hình: ảnh App Expo Go (chụp màn hình điện thoại).*

### Slide 10 – Quy tắc nghiệp vụ
- **Tính phí**: 30 phút đầu miễn phí → sau đó **3000đ/giờ** (làm tròn lên). *Test: 95 phút → 6000đ.*
- **Giữ chỗ 5 phút** – hết hạn tự hủy, giải phóng ô.
- **RFID**: quét thẻ → mở barrier cho ô đã đặt; ghi nhớ thẻ ↔ user.
- **Barrier tự đóng sau 5 giây**.
- *Gợi ý hình: sơ đồ luồng booking.*

### Slide 11 – Kiểm thử tự động (38/38 PASS)
- **Bộ test end-to-end 1 lệnh**: `python simulator/test_suite.py` → `KET QUA: 38/38 PASS`.
- Tự bật/tắt simulator `quiet`, tự sinh tài khoản thử nghiệm không trùng lặp.
| Nhóm | Checkpoint | KQ |
|---|---|---|
| Hạ tầng | Broker + Backend + MQTT online, đủ 6 ô | ✅ |
| Đặt chỗ | `POST /api/booking` + **chống trùng SV02 bị từ chối** | ✅ |
| Vòng đời xe | Xe vào/ra + **tính phí 95p → 6000đ, ≤30p → 0đ** | ✅ |
| Barrier | `POST /api/gate OPEN` → `gate=OPEN` | ✅ |
| Thống kê | Doanh thu 7 ngày · 24 mốc giờ · top user | ✅ |
| Xác thực | Đăng ký/đăng nhập · nạp tiền · **sai mật khẩu → 401** | ✅ |
| Dịch vụ | `health/deep` · 404 JSON · **validate sai → 400** | ✅ |
| **Bridge WS** | **App → Broker → App, đúng `requestId`** | ✅ |
| Dashboard | HTML · 5 tab · Chart.js · **SSE realtime** | ✅ |

- **CI GitHub Actions**: mỗi lần push tự chạy lại 38 checkpoint + kiểm tra syntax firmware/backend/app.
  *Kết quả thực tế trên GitHub: `KET QUA: 38/38 PASS` + `3/3 file syntax OK`.*
- **8 bug đã tìm & sửa**: OLED trắng xanh · lệnh ENTER bị IR ghi đè · nhiễu bounce nút bấm · token JWT sai · barrier không lưu `db.gate` · test SSE đọc theo byte bị treo · test 404 mất mã HTTP · bridge sai thứ tự route.
- *Gợi ý hình: bảng kết quả test + ảnh OLED đang hiển thị.*

### Slide 12 – Kết luận & hướng phát triển
- **Kết luận**: hệ thống 4 tầng chạy liên thông, mô phỏng 100%, đạt đủ yêu cầu 3 lab + server + nâng cấp.
- **Hạn chế**: chưa có phần cứng thật, thanh toán online thật, lưu JSON thay database.
- **Hướng phát triển**: thanh toán QR · camera nhận diện biển số (ESP32-CAM + OCR) · dự báo chỗ trống bằng ML · phân quyền vai trò · push notification.
- **Link repo + QR video demo**.
- **Server cloud**: https://smart-parking-ltdd2.onrender.com (mở được ngay, không cần cài gì).
- *Gợi ý hình: QR code GitHub + QR YouTube + QR server cloud.*

---

## Phụ lục trình bày
- **Bố cục thời gian**: Slide 1–5 (4 phút) · Slide 6–9 (4 phút) · Slide 10–11 (2 phút) · Slide 12 (1 phút) + **demo live 2 phút**.
- **Demo live nên làm**: 2 điện thoại cùng đặt P3 → 1 thành công, 1 báo *"O da duoc dat boi SV01"*; sau đó mở Web Dashboard tab Thống kê để thấy doanh thu tăng.
