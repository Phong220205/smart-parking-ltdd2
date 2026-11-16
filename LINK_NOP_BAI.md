# LINK NỘP BÀI – BÃI ĐỖ XE THÔNG MINH (bản 2.0)

| # | Ô trong hình GV | Link | Trạng thái |
|---|---|---|---|
| 1 | Link Github Project | https://github.com/Phong220205/smart-parking-ltdd2 | ✅ có |
| 2 | Link github source Arduino | https://github.com/Phong220205/smart-parking-ltdd2/blob/master/esp32/parking_firmware.ino | ✅ có |
| 3 | Link Wokwi | https://wokwi.com/projects/480840614046528513 | ✅ có (firmware V2 + debounce đã nạp, build OK) |
| 4 | Link source code Backend | https://github.com/Phong220205/smart-parking-ltdd2/tree/master/backend | ✅ có |
| 5 | Link Server cloud | https://clear-plants-smile.loca.lt (tunnel tạm – tắt máy là mất) | ⚠️ cần deploy lâu dài, xem `backend/DEPLOY.md` |
| 6 | Link Source Code App | https://github.com/Phong220205/smart-parking-ltdd2/tree/master/app | ✅ có |
| 7 | Link báo cáo + slide | Chưa có | ⬜ xuất `docs/BaoCao_LTDD2_BaiDoXe.docx` + `docs/Slide_ThuyetTrinh.pptx` → up Drive share Anyone → dán link |
| 8 | Link phần mềm / video demo | Chưa có | ⬜ quay theo `docs/MINH_CHUNG.md` → up YouTube unlisted/Drive → dán link |

---

## Đã test thật ngày 16/11/2026 (máy SV, không phần cứng)

**Môi trường**: Docker 28.5.1 · Mosquitto 2.0.22 · Node 24.19.0 · Python 3.13.9 · Chrome.

| Hạng mục | Kết quả |
|---|---|
| Broker | ✅ Up, mở 1883 + 9001, user `esp32`/`app` + ACL |
| Simulator (thay ESP32) | ✅ nối broker, 3 mode, 6 lệnh console |
| Backend REST | ✅ 18 endpoint, lưu JSON bền vững, SSE realtime |
| Đặt chỗ + **chống trùng** | ✅ SV01 đặt P5 OK; SV02 đặt trùng → `ok:false "O da duoc dat boi SV01"` |
| Xe vào / xe ra | ✅ `ENTERED` → `FREE` + publish receipt |
| **Tính phí** | ✅ 95 phút → **6000đ**; 1 phút → 0đ |
| **Thống kê** | ✅ doanh thu 7 ngày, theo giờ, top user |
| **Tài khoản** | ✅ đăng ký / đăng nhập (JWT) / sai mật khẩu → 401 / nạp tiền ví |
| **Dashboard 5 tab** | ✅ 3 biểu đồ Chart.js, 3 bảng lịch sử, quản lý user |
| **Firmware V2 trên Wokwi** | ✅ build OK, OLED hiển thị 6 dòng (đọc pixel canvas xác nhận), MQTT OK, tự reconnect |
| **App React Native** | ✅ bundle Android thành công (552 modules, 2.17 MB) |
| **Bộ test tự động E2E** | ✅ `simulator/test_suite.py` — **32/32 PASS** |

Chi tiết đầy đủ + **6 bug đã tìm & sửa**: xem `docs/KET_QUA_TEST.md`.

### Chạy lại bộ test (1 lệnh)
```powershell
python simulator/test_suite.py
```
→ in ra `KET QUA: 32/32 PASS`. Bộ test tự bật/tắt simulator nên không cần chuẩn bị gì.

---

## Việc còn lại (5 phút mỗi việc)

1. **App trên điện thoại**:
   ```powershell
   cd app; npm install; npx expo start
   ```
   → cài Expo Go → quét QR → tab Cài đặt, sửa `ws://<IP-máy>:9001`.

2. **Server cloud lâu dài** (link ô #5): theo `backend/DEPLOY.md` → deploy `backend/` lên Render (free) → lấy URL `*.onrender.com`.

3. **Báo cáo + slide** (ô #7): file đã sinh sẵn ở `docs/`. Upload Drive → share "Anyone with the link".

4. **Video demo** (ô #8): theo kịch bản `docs/MINH_CHUNG.md`.

5. **Kiểm tra link Wokwi**: bấm **Share** trên Wokwi (đã share sẵn) → chắc chắn "Anyone with the link".
