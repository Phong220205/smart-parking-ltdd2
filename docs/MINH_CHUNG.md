# KỊCH BẢN QUAY VIDEO + ẢNH MINH CHỨNG (dán vào báo cáo Lab1/2/3)

## A. Ảnh cần chụp (mỗi ảnh 1 điểm minh chứng)
1. Wokwi chạy firmware: LCD hiện "Trong: x/6", bấm nút IR P1 -> App đỏ ô P1. (Lab1+Lab3)
2. `docker compose logs` Mosquitto: thấy CONNECT của esp32 + app. (Lab2)
3. MQTT Explorer subscribe `parking/#`: thấy retain snapshot + slot status. (Lab2)
4. App Expo Go: sơ đồ 6 ô + banner ONLINE. (Lab3)
5. Hai điện thoại cùng đặt P2: 1 thành công, 1 báo "đã được đặt". (chống trùng - Lab2+3)
6. Log simulator xe ra vào + receipt tính phí. (Lab1+2)

## B. Kịch bản video 3 phút
0:00 Sơ đồ Wokwi + simulator demo mode đang chạy xe ra vào.
0:30 Mở App: 6 ô nhảy realtime, mở/đóng barrier.
1:00 Đặt chỗ P3 từ App -> simulator/ESP32 giữ chỗ -> xe vào -> LCD đổi.
1:40 Dùng máy 2 đặt trùng P3 -> bị từ chối (quay rõ popup).
2:10 Xe ra -> popup thanh toán + receipt MQTT.
2:30 Tắt Broker 10s -> App báo OFFLINE -> bật lại tự nối (ăn điểm ổn định).
