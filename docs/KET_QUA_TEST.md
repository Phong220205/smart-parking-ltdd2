# KẾT QUẢ TEST THẬT NGÀY 16/11/2026 (máy SV, không phần cứng)

## Môi trường
- Docker Desktop 28.5.1, Mosquitto 2.0.22, Node v24.19.0, Python 3.13.9, paho-mqtt.

## 1. Broker (Lab2) – PASS
```
parking-mosquitto Up 0.0.0.0:1883->1883, 0.0.0.0:9001->9001
mosquitto version 2.0.22 running
Opening ipv4 listen socket on port 1883
Opening websockets listen socket on port 9001
```
User: esp32/esp32123, app/app123. File `broker/passwd` + `broker/config/passwd` đã tạo, gitignore nên không lộ lên GitHub.

## 2. Simulator thay ESP32 (Lab1) – PASS
```
[SIM] Chay mode=quiet - Broker localhost:1883
Received PUBLISH parking/slot/P1..P6/status
Received PUBLISH parking/slots/snapshot
Received PUBLISH parking/gate/barrier/state
```

## 3. Backend REST (Lab2/Server) – PASS
`GET http://localhost:3100/api/status`:
```json
{"slots":{"P1":{"occupied":false,"reservedBy":null},"P3":{"occupied":false,"reservedBy":null}},"gate":"CLOSED","online":true}
```

## 4. Đặt chỗ + chống trùng (Lab2+Lab3) – PASS
- POST /api/booking P3 user SV01 requestId test1 -> forwarded, status P3 reservedBy=SV01.
- POST /api/booking P3 user SV02 requestId test2 -> retained state:
```json
{"slot":"P3","state":"RESERVED","user":"SV02","requestId":"test2","ok":false,"msg":"O da duoc dat boi SV01"}
```
- POST /api/booking cancel P3 SV01 -> OK.
- POST /api/gate OPEN/CLOSE -> OK, log broker thấy barrier/cmd -> barrier/state.

## 5. App (Lab3) – sẵn sàng
- `node --check App.js` OK, `node --check parkingMqtt.js` OK.
- Chạy: `cd app && npm install && npx expo start`, sửa host thành `ws://<IP-may-broker>:9001`.

## Việc còn lại để đủ 8 link
1. `gh repo create smart-parking-ltdd2 --public --source=. --push` (có link 1,2,4,6).
2. Wokwi Share (link 3), Render deploy backend (link 5).
3. Quay video simulator+App (link 8), xuất báo cáo/slide Drive (link 7).
