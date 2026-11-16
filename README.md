# ĐỒ ÁN LTDD2 – BÃI ĐỖ XE THÔNG MINH (SMART PARKING)
Mô phỏng 100% – không cần phần cứng thật.

## 1. Kiến trúc

```
[ESP32 thật / Wokwi / simulator Python]  <--MQTT 1883-->  [Mosquitto Broker]  <--MQTT WebSocket 9001-->  [App React Native Expo]
   6 ô P1..P6 (IR), RFID, Servo barrier, LCD                                                            Đặt chỗ, tính phí, sơ đồ realtime
```

## 2. Topic MQTT (thống nhất toàn đồ án)

| Topic | Hướng | Retain | QoS | Payload mẫu |
|---|---|---|---|---|
| `parking/slot/<ID>/status` | ESP32 → App | YES | 1 | `{"id":"P1","occupied":false,"reservedBy":null,"updatedAt":123456}` |
| `parking/slots/snapshot` | ESP32/sim → App | YES | 1 | `{"slots":[...],"gate":"CLOSED","ts":123}` |
| `parking/booking/<ID>/set` | App → ESP32 | NO | 1 | `{"slot":"P1","user":"SV01","action":"reserve","requestId":"abc"}` |
| `parking/booking/<ID>/state` | ESP32 → App | YES | 1 | `{"slot":"P1","state":"RESERVED","user":"SV01","requestId":"abc","ok":true,"msg":"..."}` |
| `parking/gate/barrier/cmd` | App → ESP32 | NO | 1 | `{"cmd":"OPEN","by":"SV01","requestId":"xyz"}` |
| `parking/gate/barrier/state` | ESP32 → App | YES | 1 | `{"gate":"OPEN","openedBy":"SV01","ts":123}` |
| `parking/gate/rfid` | ESP32 → App | NO | 0 | `{"card":"A1B2C3","slot":"P2","event":"ENTER"}` |
| `parking/billing/receipt` | ESP32 → App | NO | 1 | `{"slot":"P2","user":"SV01","minutes":63,"fee":9000}` |
| `parking/system/heartbeat` | ESP32 → App | NO | 0 | `{"uptime":3600,"wifi":-58,"freeHeap":120000}` |

Quy tắc chống trùng đặt chỗ (ăn điểm Lab2 + Lab3):
- ESP32/simulator là nguồn sự thật duy nhất. App chỉ gửi `set`, phải đợi `state` trả về có cùng `requestId` mới coi là thành công.
- Nếu 2 App cùng đặt P1: request đến trước thắng, request sau nhận `{"ok":false,"msg":"Slot already reserved/occupied"}`.
- Booking tự hết hạn sau 5 phút nếu xe không vào (đếm bằng `expiresAt`).

## 3. Chạy nhanh (không phần cứng)

```powershell
# 1) Broker (cần Docker)
cd broker; docker compose up -d; docker compose logs -f

# 2) Giả lập ESP32 + xe ra vào (cần Python)
pip install paho-mqtt
python simulator/parking_simulator.py --mode demo

# 3) App (cần Node + Expo Go trên điện thoại)
cd app; npm install; npx expo start
# Điện thoại quét QR Expo Go, chỉnh IP broker trong Settings
```

## 4. Giả lập thay phần cứng (để nộp Lab1)

- `esp32/parking_firmware.ino` : code thật, nạp là chạy. Có `SIMULATION_TICK` để chạy trên Wokwi.
- `esp32/diagram.json` + `esp32/wokwi.toml` : mở bằng Wokwi (VSCode extension hoặc wokwi.com) → 6 nút IR, RFID RC522, Servo, LCD1602.
- `simulator/parking_simulator.py` : giả lập ESP32 + xe + RFID + barrier y hệt firmware, dùng khi không mở Wokwi. Có 3 mode: `demo` (tự có xe ra vào), `quiet` (đứng yên để App điều khiển), `chaos` (test mất mạng/đặt trùng).
- Ảnh minh chứng Wokwi + log simulator để dán vào báo cáo: xem `docs/MINH_CHUNG.md`.

## 5. Link nộp (điền theo Phiếu chấm – mục I)

| Sản phẩm nộp | Link (sinh viên điền) |
|---|---|
| Mã nguồn React Native (Lab3) | ... |
| Mã nguồn / cấu hình Broker (Lab2) | ... |
| Mã nguồn ESP32 + sơ đồ mạch (Lab1) | ... |
| Mã nguồn Server | ... |
| Báo cáo Word/PDF | ... |
| Slide | ... |
| Video demo | ... |

Nhớ bật share "Anyone with the link".
