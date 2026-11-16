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
- **Backend Node/Express**: 18 endpoint REST + **SSE realtime** (`/api/stream`).
- Lưu trữ bền vững `data/parking.json` – không cần database.
- **JWT token** ký HMAC-SHA256, mật khẩu hash SHA-256.
- **Dashboard 5 tab**: Sơ đồ bãi · Thống kê (Chart.js) · Lịch sử · Người dùng · Cài đặt.
- *Gợi ý hình: ảnh Dashboard tab Thống kê (biểu đồ cột + đường + tròn).*

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

### Slide 11 – Kiểm thử (16 case đã PASS)
| # | Hạng mục | KQ |
|---|---|---|
| 1–3 | Broker Up · Simulator nối · Backend REST | ✅ |
| 4–5 | Đặt chỗ thành công · **Chống trùng SV02 bị từ chối** | ✅ |
| 6–7 | Xe vào/ra · **Tính phí 95p → 6000đ** | ✅ |
| 8–11 | Thống kê · Đăng ký/đăng nhập · **Sai mật khẩu → 401** · Nạp tiền | ✅ |
| 12–14 | Lịch sử 3 bảng · Biểu đồ Chart.js · **Firmware V2 build trên Wokwi** | ✅ |
| 15–16 | **Đọc pixel canvas xác nhận OLED hiển thị** · Nút bấm đổi trạng thái | ✅ |

- *Gợi ý hình: bảng kết quả test + ảnh OLED đang hiển thị.*

### Slide 12 – Kết luận & hướng phát triển
- **Kết luận**: hệ thống 4 tầng chạy liên thông, mô phỏng 100%, đạt đủ yêu cầu 3 lab + server + nâng cấp.
- **Hạn chế**: chưa có phần cứng thật, thanh toán online thật, lưu JSON thay database.
- **Hướng phát triển**: thanh toán QR · camera nhận diện biển số (ESP32-CAM + OCR) · dự báo chỗ trống bằng ML · phân quyền vai trò · push notification.
- **Link repo + QR video demo**.
- *Gợi ý hình: QR code GitHub + QR YouTube.*

---

## Phụ lục trình bày
- **Bố cục thời gian**: Slide 1–5 (4 phút) · Slide 6–9 (4 phút) · Slide 10–11 (2 phút) · Slide 12 (1 phút) + **demo live 2 phút**.
- **Demo live nên làm**: 2 điện thoại cùng đặt P3 → 1 thành công, 1 báo *"O da duoc dat boi SV01"*; sau đó mở Web Dashboard tab Thống kê để thấy doanh thu tăng.
