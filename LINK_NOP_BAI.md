# LINK NỘP BÀI – BÃI ĐỖ XE THÔNG MINH (bản 2.0)

| # | Ô trong hình GV | Link | Trạng thái |
|---|---|---|---|
| 1 | Link Github Project | https://github.com/Phong220205/smart-parking-ltdd2 | ✅ có (CI badge xanh: 39/39 PASS) |
| 2 | Link github source Arduino | https://github.com/Phong220205/smart-parking-ltdd2/blob/master/esp32/parking_firmware.ino | ✅ có |
| 3 | Link Wokwi | https://wokwi.com/projects/480840614046528513 | ✅ có (firmware V2 + debounce đã nạp, build OK) |
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
| **CI GitHub Actions** | ✅ `.github/workflows/ci.yml` — 2 job (test E2E + app syntax) |
| **MQTT-WS Bridge (2 chiều)** | ✅ `wss://smart-parking-ltdd2.onrender.com/mqtt` — App → Broker → App, đúng `requestId` |
| **Server cloud thật** | ✅ Render free: https://smart-parking-ltdd2.onrender.com — REST + SSE + Dashboard + bridge đều OK |

Chi tiết đầy đủ + **8 bug đã tìm & sửa**: xem `docs/KET_QUA_TEST.md`.

### Chạy lại bộ test (1 lệnh)
```powershell
python simulator/test_suite.py
```
→ in ra `KET QUA: 39/39 PASS`. Bộ test tự bật/tắt simulator nên không cần chuẩn bị gì.
**CI tự động**: `.github/workflows/ci.yml` — mỗi lần push GitHub sẽ tự chạy lại đủ 39 checkpoint.

---

## Việc còn lại (5 phút mỗi việc)

1. **App trên điện thoại**:
   ```powershell
   cd app; npm install; npx expo start
   ```
   → cài Expo Go → quét QR → tab **⚙️ Cài đặt kết nối** → dán
   `https://smart-parking-ltdd2.onrender.com` → chế độ **🌐 Qua Backend**.
   *(Điện thoại và máy tính phải cùng mạng WiFi nếu chạy local; dùng link cloud thì không cần.)*

2. **Báo cáo + slide** (ô #7): file đã sinh sẵn ở `docs/`. Upload Drive → share "Anyone with the link".

3. **Video demo** (ô #8): theo kịch bản `docs/MINH_CHUNG.md`.

4. **Kiểm tra link Wokwi**: bấm **Share** trên Wokwi (đã share sẵn) → chắc chắn "Anyone with the link".

> ⏱️ Render free ngủ sau ~15 phút không có request → lần mở đầu tiên có thể chờ 30–60 giây.
