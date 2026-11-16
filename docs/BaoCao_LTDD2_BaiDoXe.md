# BÁO CÁO ĐỒ ÁN LTDD2 – BÃI ĐỖ XE THÔNG MINH (SMART PARKING)
Nhóm: ............ | Lớp: ............ | GVHD: ............

## 1. Đặt vấn đề
Bãi xe thủ công khó biết ô trống, dễ tranh chỗ giờ cao điểm. Đề tài xây dựng hệ thống giám sát 6 ô P1..P6 realtime, đặt giữ chỗ từ xa, barrier RFID, tính phí tự động qua MQTT.

## 2. Mục tiêu (khớp phiếu chấm)
- Lab1 ESP32: đọc 6 IR, RFID RC522, Servo barrier, LCD1602, buzzer; WiFi + MQTT reconnect, LWT.
- Lab2 Broker: Mosquitto Docker (1883 TCP + 9001 WebSocket), user esp32/app, ACL phân quyền, QoS1 + retain cho snapshot/booking/gate, log CONNECT/PUBLISH.
- Lab3 App React Native Expo: sơ đồ 6 ô realtime, đặt/hủy (requestId chống trùng), mở barrier, popup thanh toán, banner ONLINE/OFFLINE + tự nối lại, timeout 5s.

## 3. Kiến trúc & Topic
ESP32/simulator <-> Mosquitto <-> App/Backend. Xem README.md bảng topic.
Luật chống trùng: ESP32/sim là nguồn duy nhất; App gửi `booking/<ID>/set` kèm requestId, chỉ khi `booking/<ID>/state` trả về cùng requestId + ok=true mới thành công. Giữ chỗ 5 phút, miễn phí 30 phút đầu, sau đó 3000đ/giờ.

## 4. Thiết kế phần cứng (giả lập 100%)
- ESP32 DevKit, 6 nút IR -> GPIO 13,12,14,27,26,25 (LOW=có xe), Servo GPIO18, Buzzer GPIO23, RFID SDA5/RST22, LCD I2C 0x27 (SDA21/SCL22).
- Wokwi: diagram.json + wokwi.toml, bấm nút IR giả xe, gõ Serial `RFID:xxxx` giả quẹt thẻ.
- Simulator Python giả đúng firmware: demo/quiet/chaos, expire 5 phút, tính phí, barrier, heartbeat 15s.

## 5. Broker/Server
- `broker/docker-compose.yml`, mosquitto.conf (2 listener), passwd (esp32/esp32123, app/app123), acl.conf.
- Backend `server.js`: cache slots/gate, REST GET /api/status, /api/receipts, /api/rfid, POST /api/booking, /api/gate.
- Deploy: backend lên Render, broker dùng HiveMQ Cloud/EMQX hoặc Mosquitto local (xem DEPLOY.md).

## 6. App
- `app/src/parkingMqtt.js`: connect MQTT WebSocket, subscribe 8 topic, publish booking/gate.
- `app/src/App.js`: grid 6 ô (xanh trống/đỏ có xe/vàng bạn đặt/cam đã đặt), mở/đóng barrier, cài đặt IP + mã user, nhật ký, Alert thanh toán.
- Xử lý lỗi: banner offline, timeout booking 5s, try/catch JSON, reconnect 2s.

## 7. Kiểm thử (đã chạy thật local ngày 16/11/2026)
1. Broker Up: `docker compose ps` Up, log `mosquitto version 2.0.22 running`, mở 1883+9001.
2. Simulator nối: log `Received PUBLISH parking/slot/P*/status`, snapshot retain.
3. Backend GET /api/status -> 6 ô FREE, gate CLOSED, online true.
4. Đặt P3 SV01 -> status reservedBy SV01; đặt trùng SV02 -> state `ok:false "O da duoc dat boi SV01"` (ảnh log Python).
5. Hủy đặt + OPEN/CLOSE barrier OK.
6. Tắt broker 10s -> App banner OFFLINE, bật lại tự nối (mục ổn định 0.5đ).

## 8. Kết quả & Hạn chế
Đã chạy liên thông broker+backend+simulator, App Expo Go sẵn sàng quét QR. Chưa có phần cứng thật nên IR/RFID/Servo bằng Wokwi + simulator; khi có ESP32 chỉ cần đổi MQTT_HOST là chạy.
Hướng phát triển: thanh toán QR, camera biển số, dự báo chỗ trống.

## Phụ lục: Link nộp (dán sau khi push/deploy)
Xem LINK_NOP_BAI.md – 8 ô: repo, Arduino, Wokwi, backend, server cloud, App, báo cáo+slide, video.
