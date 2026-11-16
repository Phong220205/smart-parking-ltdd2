from pptx import Presentation
from pptx.util import Inches, Pt
prs = Presentation()
prs.slide_width = Inches(13.333)
prs.slide_height = Inches(7.5)
def add_slide(title, bullets):
    sl = prs.slides.add_slide(prs.slide_layouts[1])
    sl.shapes.title.text = title
    tf = sl.placeholders[1].text_frame
    tf.clear()
    for i,b in enumerate(bullets):
        p = tf.add_paragraph() if i>0 else tf.paragraphs[0]
        p.text = b
        p.level = 0
slides = [
 ("BÃI ĐỖ XE THÔNG MINH (SMART PARKING)", ["Đồ án LTDD2 – React Native + MQTT + ESP32", "Nhóm: ... | Lớp: ... | GVHD: ...", "Mô phỏng 100% – không cần phần cứng"]),
 ("Vấn đề & Mục tiêu", ["Bãi xe thủ công: không biết ô trống, tranh chỗ giờ cao điểm", "6 ô P1..P6 realtime + đặt giữ chỗ từ xa + barrier RFID + tính phí tự động", "Khớp phiếu chấm: App 6đ – Broker 2đ – ESP32 2đ"]),
 ("Kiến trúc hệ thống", ["ESP32 / simulator <--MQTT 1883--> Mosquitto <--WebSocket 9001--> App Expo + Backend REST", "Backend: GET /api/status, POST /api/booking, /api/gate", "App Expo Go quét QR, sửa host ws://<IP>:9001"]),
 ("Topic MQTT + Chống trùng", ["slot/+/status, slots/snapshot, booking/+/set/state, gate/barrier/cmd/state, billing/receipt", "QoS1 + retain cho snapshot/booking/gate", "Luật: App gửi requestId, chỉ state cùng requestId + ok=true mới thành công; giữ chỗ 5 phút"]),
 ("Phần cứng & Giả lập (Lab1)", ["ESP32 + 6 IR (13,12,14,27,26,25) + Servo 18 + Buzzer 23 + RFID + LCD I2C", "Wokwi: diagram.json – bấm nút IR giả xe, Serial RFID:xxxx giả quẹt thẻ", "Simulator Python 3 mode demo/quiet/chaos – BOM ~400-500k khi mua thật"]),
 ("Broker & Server (Lab2)", ["Mosquitto 2.0.22 Docker: 1883 TCP + 9001 WebSocket", "User esp32/app + ACL phân quyền topic", "Log CONNECT/PUBLISH; nhiều client đồng thời; test mất mạng tự nối"]),
 ("App React Native (Lab3)", ["Lưới 6 ô: xanh trống / đỏ có xe / vàng bạn đặt / cam đã đặt", "Đặt/hủy chỗ, mở/đóng barrier, popup thanh toán 3000đ/giờ (free 30 phút đầu)", "Banner ONLINE/OFFLINE, timeout booking 5s, nhật ký realtime"]),
 ("Kiểm thử đã PASS 16/11", ["Broker Up + sim nối + /api/status online true", "Đặt P3 SV01 OK; SV02 đặt trùng bị từ chối 'O da duoc dat boi SV01'", "Hủy đặt + barrier OPEN/CLOSE OK; tắt broker App báo OFFLINE rồi tự nối"]),
 ("Kết luận & Link", ["Đã chạy liên thông broker+backend+simulator; có ESP32 chỉ đổi MQTT_HOST", "Hướng phát triển: QR payment, camera biển số, dự báo chỗ trống", "Repo: github.com/Phong220205/smart-parking-ltdd2 | Video + báo cáo: xem LINK_NOP_BAI.md"]),
]
for t,b in slides: add_slide(t,b)
prs.save(r'd:\LTDD2\docs\Slide_ThuyetTrinh.pptx')
print('PPTX OK')
