# Simulator thay ESP32 that (khong can phan cung)

## Chay nhanh
```powershell
pip install -r requirements.txt
# Mode demo: tu co xe ra vao
python parking_simulator.py --mode demo
# Mode quiet: dung yen cho App dieu khien, go "P1 in" / "P1 out"
python parking_simulator.py --mode quiet
# Mode chaos: test mat mang / dat trung (de viet bao cao on dinh)
python parking_simulator.py --mode chaos
```

## Neu dung broker public (khong Docker)
```powershell
python parking_simulator.py --host test.mosquitto.org --port 1883 --user "" --password "" --mode demo
```
Luu y: test.mosquitto.org khong can user/pass, sua code bo dong username_pw_set neu can.

## Kiem tra
- Mosquitto log phai thay CONNECT sim-esp32
- MQTT Explorer subscribe `parking/#` thay snapshot retain
- App thay 6 o nhay realtime la OK
