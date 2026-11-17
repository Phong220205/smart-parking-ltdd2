# KỊCH BẢN QUAY VIDEO + ẢNH MINH CHỨNG (bản 2.0)

## A. Ảnh cần chụp (mỗi ảnh 1 điểm minh chứng)

### Nhóm 1 – Phần cứng & Firmware (Lab1)
1. **Ảnh Wokwi toàn cảnh** – mạch đầy đủ: ESP32, OLED SSD1306 (đang hiện "SMART PARKING / Trong: 5/6 CLOSED / P1-6: X_____ / MQTT:OK"), 6 nút P1–P6, RFID RC522, Servo, Buzzer.
2. **Ảnh Serial Monitor** – log đầy đủ:
   ```
   SMART PARKING - ESP32 (ban nang cap)
   [OLED] OK - 128x64 @ 0x3C
   [RFID] RC522 khoi dong OK
   [WiFi] ....... IP=10.10.0.2
   [MQTT] OK -> test.mosquitto.org
   Slots: X_____ MQTT:OK DT:6000d
   ```
3. **Ảnh màn OLED cận cảnh** – 6 dòng: tiêu đề · Trống x/6 + Barrier · bảng trạng thái 6 ô · doanh thu/thông báo · uptime + MQTT · thẻ RFID.
4. **Ảnh RFID quét thẻ** – Serial hiện `[RFID] A1B2C3`, barrier mở (Servo xoay).
5. **Ảnh Serial lệnh demo** – gõ `BOOK:P2:SV09` → `[MSG] DAT P2 OK` → `ENTER:P2:SV09` → `[MSG] XE VAO P2` → `EXIT:P2` → `[EXIT] P2 user=SV09 1 phut - 0 VND`.

### Nhóm 2 – Broker (Lab2)
6. **Ảnh `docker compose ps`** – `parking-mosquitto Up 0.0.0.0:1883->1883/tcp, 0.0.0.0:9001->9001/tcp`.
7. **Ảnh log broker** – `mosquitto version 2.0.22 running`, `Opening ipv4 listen socket on port 1883`, `Opening websockets listen socket on port 9001`, các dòng `New client connected ... as ...`.
8. **Ảnh MQTT Explorer** – subscribe `parking/#`, thấy các topic retain: `parking/slots/snapshot`, `parking/slot/P1/status` …, `parking/system/status`.

### Nhóm 3 – Server & Dashboard
9. **Ảnh Dashboard tab Sơ đồ bãi** – lưới 6 ô màu, banner "● Broker ONLINE", log hệ thống realtime.
10. **Ảnh Dashboard tab Thống kê** – 4 KPI + 3 biểu đồ Chart.js (cột 7 ngày, đường theo giờ, tròn top user).
11. **Ảnh Dashboard tab Lịch sử** – 3 bảng: hóa đơn tính phí, lịch sử đặt chỗ, log thẻ RFID.
12. **Ảnh Dashboard tab Người dùng** – đăng ký SV03 + bảng danh sách user (lượt xe, chi tiêu).
13. **Ảnh Terminal** – `curl http://localhost:3000/api/health` → `{"ok":true,"mqtt":true,"online":true,"slots":6}`.

### Nhóm 3b – Server cloud + MQTT-WS Bridge (điểm nhấn mới)
13b. **Ảnh trình duyệt mở server cloud** – thanh địa chỉ `https://smart-parking-ltdd2.onrender.com`,
   Dashboard 5 tab hiển thị đầy đủ, banner "● Broker ONLINE".
13c. **Ảnh Terminal gọi API cloud**:
   ```powershell
   curl https://smart-parking-ltdd2.onrender.com/api/health
   {"ok":true,"mqtt":true,"online":true,"slots":6,...}
   curl https://smart-parking-ltdd2.onrender.com/api/bridge
   {"ok":true,"path":"/mqtt","clients":2,"subscriptions":["parking/slot/+/status",...]}
   ```
13d. **Ảnh test bridge 2 chiều** – chạy `node backend/test_bridge.js wss://smart-parking-ltdd2.onrender.com/mqtt`
   → log `=== KET QUA: BRIDGE HOAT DONG (2 chieu) ===`.
13e. **Ảnh App mở tab Cài đặt** – chỉ 1 ô "Link server" đã điền
   `https://smart-parking-ltdd2.onrender.com`, chế độ "Qua Backend", URL MQTT tự sinh.

### Nhóm 3c – Ảnh minh chứng đã chụp sẵn (docs/anh/)
- `docs/anh/dashboard-local-sodobai.png` – Dashboard tab Sơ đồ bãi (chạy local).
- `docs/anh/dashboard-cloud-thongke.png` – Dashboard tab Thống kê trên **server cloud thật**.

### Nhóm 4 – Ứng dụng di động (Lab3)
14. **Ảnh App Expo Go – tab Bãi** – lưới 6 ô màu + banner ONLINE + barrier.
15. **Ảnh App – đặt chỗ** – popup kết quả "✅ Thành công / Dat o thanh cong, giu cho 5 phut".
16. **Ảnh App – tab Lịch sử** – danh sách hóa đơn có số tiền (VD `6.000đ`).
17. **Ảnh App – tab Thống kê** – biểu đồ doanh thu.
18. **Ảnh App – tab Tài khoản** – form đăng nhập / thông tin user.

### Nhóm 5 – Chứng minh tính năng nâng cấp
19. **Ảnh chống trùng** – log broker/App: `{"ok":false,"msg":"O da duoc dat boi SV01"}`.
20. **Ảnh tính phí** – hóa đơn `{"slot":"P6","user":"SV07","minutes":95,"fee":6000}`.
21. **Ảnh xác thực** – `POST /api/auth/login` sai mật khẩu → `401 Unauthorized`.
22. **Ảnh bảng thống kê 7 ngày** – `Doanh thu hom nay: 6000 | Tong: 6000 | Luot xe: 5`.

---

## B. Kịch bản video 3 phút

| Mốc | Nội dung | Ghi chú |
|---|---|---|
| 0:00 | Toàn cảnh Wokwi + simulator `demo` đang chạy, xe tự ra vào | quay chậm, có thấy OLED đổi |
| 0:20 | Serial Monitor: đặt chỗ `BOOK:P2:SV09`, quét thẻ RFID, barrier mở | Lab1 |
| 0:45 | Mở App: 6 ô nhảy realtime, bấm "MỞ BARRIER" | Lab3 |
| 1:10 | Đặt chỗ P3 từ App → popup thành công → ô P3 chuyển màu vàng "BẠN ĐẶT" | |
| 1:40 | **Máy 2 đặt trùng P3** → popup "❌ O da duoc dat boi SV01" | **điểm mạnh nhất, quay rõ** |
| 2:00 | Xe vào → OLED đổi `X` → xe ra → popup thanh toán + hóa đơn MQTT | |
| 2:25 | Mở Dashboard tab Thống kê → biểu đồ doanh thu nhảy số | **điểm ấn tượng** |
| 2:40 | Tắt Broker 10s → App báo OFFLINE → bật lại tự nối lại | ăn điểm ổn định |
| 2:55 | Quay nhanh 4 tab của App + đăng nhập tài khoản | |

### Lời thoại gợi ý (in ra video)
> "Đây là hệ thống bãi đỗ xe thông minh, mô phỏng 100%. Màn hình OLED hiển thị trạng thái 6 chỗ đỗ và doanh thu. Khi quét thẻ RFID, barrier tự mở cho xe đã đặt chỗ. Từ điện thoại, tôi đặt chỗ P3. Bây giờ máy thứ hai cố đặt trùng P3 — hệ thống từ chối rõ ràng nhờ kiểm tra `requestId` ngay trên ESP32. Khi xe ra, hệ thống tự tính phí và ghi hoá đơn. Dashboard thống kê cập nhật doanh thu realtime."

---

## C. Lưu ý khi quay

- Quay màn hình điện thoại (Expo Go) bằng **scrcpy** (Android) hoặc **QuickTime** (iPhone) để ghép vào video màn hình máy tính.
- Đặt sẵn cửa sổ theo thứ tự: Wokwi (trái) · App Expo Go (giữa) · Dashboard (phải).
- Bật `Auto scroll` trong Serial Monitor để log cuộn đều.
- Trước khi quay: `docker compose up -d` → `python simulator/parking_simulator.py --mode demo` → `cd backend && npm start` → `cd app && npx expo start`.
- Xóa `data/parking.json` trước khi quay nếu muốn thống kê sạch từ đầu.

---

## D. Quay demo trên SERVER CLOUD (khuyên dùng cho video nộp bài)

Ưu điểm: **không cần mở Docker / Wokwi trong lúc quay**, chỉ cần 1 trình duyệt +
1 điện thoại. Mọi thứ đều chạy trên `https://smart-parking-ltdd2.onrender.com`.

```powershell
# 1. Bật simulator kết nối broker của SERVER CLOUD (thay cho ESP32)
#    -> dùng đúng đường dẫn MQTT-over-WebSocket mà App dùng
python simulator/parking_simulator.py --mode quiet `
  --ws wss://smart-parking-ltdd2.onrender.com/mqtt --user esp32 --password esp32123

# 2. Mở Dashboard cloud
start https://smart-parking-ltdd2.onrender.com
```

Kiểm tra nhanh thiết bị đã "vào" broker cloud:
```powershell
curl https://smart-parking-ltdd2.onrender.com/api/health
# -> {"ok":true,"mqtt":true,"online":true,...}
```

Trên điện thoại: mở App → ⚙️ Cài đặt kết nối → dán
`https://smart-parking-ltdd2.onrender.com` → chế độ **Qua Backend** → Kết nối lại.

**Kịch bản quay trên cloud (2 phút):**
| Mốc | Nội dung |
|---|---|
| 0:00 | Dashboard cloud: sơ đồ 6 ô, banner "Broker ONLINE" |
| 0:20 | App: đặt chỗ P3 → popup "Thành công" → ô chuyển màu vàng |
| 0:50 | **Máy 2 đặt trùng P3** → "O da duoc dat boi SV01" (điểm mạnh nhất) |
| 1:15 | Mở barrier từ App → Dashboard đổi trạng thái ngay (SSE realtime) |
| 1:40 | Dashboard tab Thống kê → biểu đồ doanh thu |
| 1:55 | Dashboard tab Lịch sử → bảng hóa đơn + RFID |

> Nhớ: Render free có thể ngủ 15 phút → lần mở đầu quay video nên "tuyên trình" trước
> 30 giây cho server thức dậy.
