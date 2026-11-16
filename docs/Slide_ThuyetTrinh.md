# SLIDE THUYẾT TRÌNH – BÃI ĐỖ XE THÔNG MINH (8-10 phút)

Slide 1 – Bìa: Tên đề tài, nhóm, lớp, GVHD, học kỳ.
Slide 2 – Vấn đề: bãi xe thủ công, tranh chỗ, không biết ô trống.
Slide 3 – Mục tiêu: 6 ô realtime, đặt giữ chỗ, barrier RFID, tính phí tự động.
Slide 4 – Kiến trúc: ESP32/sim <-> Mosquitto (1883+9001) <-> App Expo + Backend REST. Chèn sơ đồ.
Slide 5 – Topic MQTT + luật chống trùng requestId + retain/QoS1 (bảng).
Slide 6 – Phần cứng & giả lập: ảnh Wokwi (6 nút IR, RFID, Servo, LCD) + BOM ~400-500k.
Slide 7 – Broker Lab2: docker-compose, user/ACL, log CONNECT/PUBLISH. Chèn ảnh `docker compose ps` + log.
Slide 8 – Demo App Lab3: ảnh sơ đồ 6 ô, đặt chỗ, mở barrier, popup thanh toán 9000đ.
Slide 9 – Kiểm thử: bảng 6 case đã pass (Up broker, sim nối, /api/status, đặt trùng bị từ chối, hủy+mở barrier, offline tự nối).
Slide 10 – Kết luận & hướng phát triển: QR payment, camera biển số. Link repo + video QR.

Lưu ý trình bày: mỗi slide 1 hình + 3-5 dòng, demo live 2 điện thoại đặt trùng P3.
