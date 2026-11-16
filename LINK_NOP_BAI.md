# CHECKLIST 8 LINK NỘP (điền dần, link nào cũng phải "Anyone with the link")

| # | Ô trong hình GV | Lấy ở đâu | Link của nhóm (dán vào đây) |
|---|---|---|---|
| 1 | Link Github Project | Tạo repo `smart-parking-ltdd2`, push toàn bộ thư mục này | https://github.com/.../smart-parking-ltdd2 |
| 2 | Link github source Arduino | Cùng repo, thư mục `esp32/parking_firmware.ino` (mở file → Copy link) | .../blob/main/esp32/parking_firmware.ino |
| 3 | Link Wokwi | Mở wokwi.com → New ESP32 → copy `esp32/diagram.json` + `parking_firmware.ino` → Share → Copy link | https://wokwi.com/projects/... |
| 4 | Link source code Backend | Cùng repo thư mục `backend/` (có `server.js`) | .../tree/main/backend |
| 5 | Link Server cloud | Deploy `backend/` lên Render (xem `backend/DEPLOY.md`) → URL `https://....onrender.com/api/status` | https://....onrender.com |
| 6 | Link Source Code App | Cùng repo thư mục `app/` + file APK: `cd app && eas build -p android --profile preview` → link expo/build | .../tree/main/app + https://expo.dev/... |
| 7 | Link báo cáo + slide | Google Drive: `docs/BaoCao_LTDD2_BaiDoXe.docx(pdf)` + `docs/Slide_ThuyetTrinh.pptx` | https://drive.google.com/... |
| 8 | Link phần mềm / video demo | Quay màn hình: App đặt chỗ + simulator xe ra vào + barrier → up YouTube unlisted / Drive | https://youtu.be/... hoặc drive |

## Trình tự làm 30 phút có đủ 8 link
1. `git init && git add . && git commit -m init && gh repo create smart-parking-ltdd2 --public --source=. --push` → có ngay link 1,2,4,6.
2. Copy code lên Wokwi → Share → có link 3.
3. Push backend lên Render → có link 5 (xem backend/DEPLOY.md).
4. Chạy simulator + Expo Go, quay video 3 phút → up Drive/YouTube → có link 8.
5. Xuất báo cáo + slide từ `docs/` ra docx/pptx → up Drive → có link 7.
