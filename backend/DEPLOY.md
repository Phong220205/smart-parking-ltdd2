# Backend chạy local + deploy free để lấy "Link Server cloud"
# Chọn 1 trong 2:

## Cách A: Render.com (khuyên dùng, free)
1. Push thư mục backend/ lên GitHub repo riêng hoặc cùng repo.
2. Vào render.com -> New Web Service -> chọn repo -> Root Directory: backend
   - Build Command: npm install
   - Start Command: npm start
   - Environment:
     - MQTT_URL = mqtt://<IP-public-cua-broker>:1883   (dùng broker free bên dưới)
     - MQTT_USER = esp32
     - MQTT_PASS = esp32123
3. Sau deploy có URL https://xxx.onrender.com -> GET /api/status kiểm tra.
4. URL này điền vào "Link Server cloud".

## Cách B: Broker public free (không cần Docker, để demo nhanh)
- Dùng test.mosquitto.org:1883 (không user/pass) HOẶC tạo free tại HiveMQ Cloud / EMQX Cloud.
- Sửa MQTT_HOST trong firmware + simulator + app cho khớp.
- Ghi lại thông tin broker vào báo cáo Lab2 (ăn điểm "cài đặt và cấu hình").

## Broker public gợi ý cho đồ án (khi GV hỏi "server đâu?")
| Dịch vụ | Free tier | Ghi chú |
|---|---|---|
| HiveMQ Cloud | 100 client free | Có WebSocket + TLS, hợp App Expo |
| EMQX Cloud Serverless | 1M session/min free | Dashboard đẹp, chụp ảnh báo cáo |
| Mosquitto trên VPS/Oracle free | tự quản | Giống docker-compose trong repo nhất |
