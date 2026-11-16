# LINK NỘP BÀI – BÃI ĐỖ XE THÔNG MINH (đã có link thật, còn 3 link làm sau)

| # | Ô trong hình GV | Link |
|---|---|---|
| 1 | Link Github Project | https://github.com/Phong220205/smart-parking-ltdd2 |
| 2 | Link github source Arduino | https://github.com/Phong220205/smart-parking-ltdd2/blob/master/esp32/parking_firmware.ino |
| 3 | Link Wokwi | Chưa có – mở https://wokwi.com → New ESP32 → copy `esp32/diagram.json` + `esp32/parking_firmware.ino` → Share → dán link vào đây |
| 4 | Link source code Backend | https://github.com/Phong220205/smart-parking-ltdd2/tree/master/backend |
| 5 | Link Server cloud | Chưa có – deploy `backend/` lên Render theo `backend/DEPLOY.md` → dán URL `https://....onrender.com/api/status` |
| 6 | Link Source Code App | https://github.com/Phong220205/smart-parking-ltdd2/tree/master/app (chạy: `cd app && npx expo start`, sửa host `ws://<IP-may-broker>:9001`) |
| 7 | Link báo cáo + slide | Chưa có – xuất `docs/BaoCao_LTDD2_BaiDoXe.md` + `docs/Slide_ThuyetTrinh.md` ra docx/pptx → up Drive share Anyone → dán link |
| 8 | Link phần mềm / video demo | Chưa có – chạy `python simulator/parking_simulator.py --mode demo` + App đặt chỗ/mở barrier, quay 3 phút up YouTube unlisted/Drive → dán link |

Đã test thật 16/11/2026: broker Up (1883+9001), simulator nối, backend `/api/status` online true, đặt P3 SV01 thành công + SV02 bị từ chối `O da duoc dat boi SV01`, barrier OPEN/CLOSE OK. Chi tiết `docs/KET_QUA_TEST.md`.
