from docx import Document
from docx.shared import Pt
doc = Document()
style = doc.styles['Normal']
style.font.name = 'Times New Roman'
style.font.size = Pt(13)

doc.add_heading('BÁO CÁO ĐỒ ÁN LẬP TRÌNH DI ĐỘNG 2', 0)
doc.add_paragraph('Đề tài: BÃI ĐỖ XE THÔNG MINH (SMART PARKING) — Mô phỏng 100%, không cần phần cứng')
doc.add_paragraph('Nhóm: ............  |  Lớp: ............  |  GVHD: ............  |  Năm học 20... – 20...')

doc.add_heading('1. Đặt vấn đề', 1)
doc.add_paragraph('Bãi xe thủ công khó biết ô trống, dễ tranh chỗ giờ cao điểm. Đề tài xây dựng hệ thống giám sát 6 ô P1..P6 realtime, đặt giữ chỗ từ xa, barrier RFID, tính phí tự động qua MQTT.')

doc.add_heading('2. Mục tiêu (khớp phiếu chấm)', 1)
for t in [
 'Lab1 ESP32 (2.0đ): đọc 6 IR, RFID RC522, Servo barrier, LCD1602, buzzer; WiFi + MQTT reconnect, LWT báo offline.',
 'Lab2 Broker (2.0đ): Mosquitto Docker (1883 TCP + 9001 WebSocket), user esp32/app, ACL phân quyền, QoS1 + retain, log CONNECT/PUBLISH, nhiều client đồng thời.',
 'Lab3 App React Native (6.0đ): sơ đồ 6 ô realtime, đặt/hủy kèm requestId chống trùng, mở barrier, popup thanh toán, banner ONLINE/OFFLINE + tự nối lại, timeout 5s, báo cáo + slide.']:
    doc.add_paragraph(t, style='List Bullet')

doc.add_heading('3. Kiến trúc và Topic MQTT', 1)
doc.add_paragraph('ESP32 / simulator <--MQTT 1883--> Mosquitto Broker <--WebSocket 9001--> App React Native Expo + Backend REST.')
table = doc.add_table(rows=1, cols=4)
table.style = 'Table Grid'
hdr = table.rows[0].cells
hdr[0].text='Topic'; hdr[1].text='Hướng'; hdr[2].text='Retain/QoS'; hdr[3].text='Ý nghĩa'
rows = [
 ('parking/slot/<ID>/status','ESP32→App','YES/QoS1','Trạng thái từng ô'),
 ('parking/slots/snapshot','ESP32→App','YES/QoS1','Toàn bãi'),
 ('parking/booking/<ID>/set','App→ESP32','NO/QoS1','Yêu cầu đặt/hủy kèm requestId'),
 ('parking/booking/<ID>/state','ESP32→App','YES/QoS1','Kết quả đặt, chống trùng'),
 ('parking/gate/barrier/cmd','App→ESP32','NO/QoS1','Lệnh mở/đóng barrier'),
 ('parking/gate/barrier/state','ESP32→App','YES/QoS1','Trạng thái barrier'),
 ('parking/billing/receipt','ESP32→App','NO/QoS1','Hóa đơn: phút + phí'),
]
for r in rows:
    c = table.add_row().cells
    for i,v in enumerate(r): c[i].text=v
doc.add_paragraph('Luật chống trùng: ESP32/simulator là nguồn sự thật duy nhất. App gửi set kèm requestId, chỉ khi state trả về cùng requestId + ok=true mới thành công. Giữ chỗ 5 phút, miễn phí 30 phút đầu, sau đó 3000đ/giờ.')

doc.add_heading('4. Phần cứng và giả lập (Lab1)', 1)
doc.add_paragraph('ESP32 DevKit, 6 nút IR -> GPIO 13,12,14,27,26,25 (LOW=có xe), Servo GPIO18, Buzzer GPIO23, RFID SDA=5/RST=22, LCD I2C 0x27 (SDA21/SCL22). File esp32/parking_firmware.ino nạp chạy thật được. Wokwi: diagram.json + wokwi.toml, bấm nút IR giả xe, gõ Serial RFID:xxxx giả quẹt thẻ. Simulator Python giả đúng firmware với 3 mode demo/quiet/chaos.')
doc.add_paragraph('Linh kiện tham khảo: ESP32 ~120k, IR x6 ~90k, RC522 ~65k, Servo ~45k, LCD1602 ~65k, buzzer + nguồn ~60k. Tổng ~400-500k khi mua thật. Hiện tại giả lập 100% nên chưa cần mua.')

doc.add_heading('5. Broker / Server (Lab2)', 1)
doc.add_paragraph('broker/docker-compose.yml chạy Mosquitto 2.0.22, 2 listener 1883 + 9001. passwd có 2 user esp32/esp32123 và app/app123, acl.conf phân quyền: esp32 readwrite parking/#, app chỉ đọc status/snapshot/state/receipt và ghi booking/set + barrier/cmd. Backend server.js cache slots/gate, REST GET /api/status, /api/receipts, /api/rfid, POST /api/booking, /api/gate. Deploy backend lên Render, broker dùng HiveMQ Cloud/EMQX free hoặc Mosquitto local (xem backend/DEPLOY.md).')

doc.add_heading('6. Ứng dụng di động (Lab3)', 1)
doc.add_paragraph('app/src/parkingMqtt.js: kết nối MQTT WebSocket, subscribe 8 topic, publish booking/gate. app/src/App.js: lưới 6 ô (xanh trống/đỏ có xe/vàng bạn đặt/cam đã đặt), mở/đóng barrier, cài đặt IP + mã user, nhật ký, Alert thanh toán. Xử lý lỗi: banner offline, timeout booking 5s, try/catch JSON rác, reconnect 2s.')

doc.add_heading('7. Kiểm thử (chạy thật local ngày 16/11/2026)', 1)
for t in [
 'Broker Up: docker compose ps Up, log mosquitto version 2.0.22 running, mở 1883+9001.',
 'Simulator nối: log Received PUBLISH parking/slot/P*/status + snapshot retain.',
 'Backend GET /api/status -> 6 ô FREE, gate CLOSED, online true.',
 'Đặt P3 SV01 -> reservedBy SV01; đặt trùng SV02 -> state ok:false "O da duoc dat boi SV01".',
 'Hủy đặt + OPEN/CLOSE barrier OK, log broker thấy barrier/cmd -> barrier/state.',
 'Tắt broker 10s -> App banner OFFLINE, bật lại tự nối.']:
    doc.add_paragraph(t, style='List Number')

doc.add_heading('8. Kết quả, hạn chế, hướng phát triển', 1)
doc.add_paragraph('Đã chạy liên thông broker + backend + simulator, App Expo Go sẵn quét QR. Chưa có phần cứng thật nên IR/RFID/Servo bằng Wokwi + simulator; khi có ESP32 chỉ cần đổi MQTT_HOST là chạy. Hướng phát triển: thanh toán QR, camera biển số, dự báo chỗ trống.')
doc.add_paragraph('Link nộp: xem file LINK_NOP_BAI.md (repo, Arduino, Wokwi, backend, server cloud, App, báo cáo+slide, video).')
doc.save(r'd:\LTDD2\docs\BaoCao_LTDD2_BaiDoXe.docx')
print('DOCX OK')
