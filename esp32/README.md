# Lab1 - ESP32 (chay that duoc, mo phong duoc)

## File
- `parking_firmware.ino` : code chinh (Arduino IDE / PlatformIO / Wokwi đều nạp được)
- `diagram.json` + `wokwi.toml` : mo phong Wokwi
- Thu vien can: PubSubClient, ArduinoJson (>=6), ESP32Servo, LiquidCrystal_I2C, MFRC522

## So do mach (de ve lai bao cao)
- ESP32 DevKit V1
- 6 nut nhan (gia lap cam bien IR hong ngoai) -> GPIO 13,12,14,27,26,25 (INPUT_PULLUP, LOW = co xe)
- Servo barrier -> GPIO 18, nguon 5V rieng
- Coi buzzer -> GPIO 23
- RFID RC522: SDA=5, SCK=18(shared? nen doi sang 19 khi lap that), MOSI=23, MISO=19, RST=22
  - Luu y lap that: doi chan SPI tranh trung voi Servo/Buzzer (da chu thich trong code)
- LCD1602 I2C: SDA=21, SCL=22, dia chi 0x27

## Mo Wokwi
1. Cai extension Wokwi for VS Code hoac len wokwi.com
2. Open folder esp32/ -> Start simulation
3. Bam nut IR de gia lap xe vao/ra, go Serial `RFID:A1B2C3` de gia lap quet the
4. LCD hien so o trong + barrier, giong App

## Doi Broker khi chay that
Sua trong .ino:
```cpp
const char* MQTT_HOST = "192.168.1.10"; // IP may chay docker broker
```
