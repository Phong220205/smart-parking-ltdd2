# Deploy Backend lên cloud — lấy "Link Server cloud"

Tài liệu này mô tả cách deploy **chuẩn** để lấy link `https://xxx.onrender.com`
dùng cho ô #5 trong phiếu chấm, và cách kết nối App React Native + ESP32
vào server đó bằng **một URL duy nhất**.

---

## 0. Kiến trúc sau khi deploy (giải quyết vấn đề WebSocket)

```
┌──────────────┐  MQTT 1883   ┌─────────────────────┐
│ ESP32/Wokwi  ├─────────────>│  test.mosquitto.org │
│ Simulator    │              │  (broker public)    │
└──────────────┘              └──────────┬──────────┘
                                          │ mqtt://
                                          v
                        ┌──────────────────────────────────┐
   App React Native     │  Render: smart-parking-ltdd2     │
   ──wss://…/mqtt──────>│  • REST API  /api/*              │
                        │  • SSE       /api/stream         │
   Dashboard (web)      │  • MQTT-WS BRIDGE  /mqtt  <──────┼── 1 ket noi MQTT
   ──https://…/api/…───>│  • JSON store /tmp/parking.json  │   duy nhat xuong
                        └──────────────────────────────────┘   broker
```

**Van de duoc giai quyet:** App React Native **chi** noi duoc MQTT qua
WebSocket (`ws://`/`wss://`). Broker public `test.mosquitto.org` mo cong
**1883** va **443** nhung **khong bat WebSocket 8084** → App khong ket noi
duoc broker cloud.

→ Backend dong vai tro **MQTT-over-WebSocket bridge** (`backend/mqttWsBridge.js`):
App noi vao `wss://<server>/mqtt`, bridge noi xuong broker bang `mqtt://`.
**Chi 1 ket noi MQTT duy nhat** xuong broker dung cho N App, va **App chi can
1 URL HTTPS duy nhat** — khong phai mo port broker, khong can IP may.

---

## 1. Deploy len Render.com (khuyen dung — free)

### Buoc 1 — Tao Web Service
1. Vao https://render.com → **Sign Up** (co tai khoan GitHub la du).
2. **New +** → **Web Service** → chon repo `Phong220205/smart-parking-ltdd2`.
3. Dien cau hinh:

| O | Gia tri |
|---|---|
| Name | `smart-parking-ltdd2` |
| Region | **Singapore** (gan VN nhat) |
| Branch | `master` |
| **Root Directory** | `backend` ← **quan trong** |
| Language | Node |
| Build Command | `npm install` |
| Start Command | `npm start` |
| Health Check Path | `/api/health` |

### Buoc 2 — Environment Variables

| Key | Value | Ghi chu |
|---|---|---|
| `MQTT_URL` | `mqtt://test.mosquitto.org:1883` | broker public, khong can user/pass |
| `MQTT_USER` | *(de trong)* | broker public cho anonymous |
| `MQTT_PASS` | *(de trong)* | |
| `MQTT_WS_PATH` | `/mqtt` | duong dan WebSocket bridge |
| `JWT_SECRET` | *Generate Value* | Render tu sinh chuoi ngau nhien |
| `ADMIN_PASS` | *Generate Value* | |
| `DATA_FILE` | `/tmp/parking.json` | Render free khong giu file lau dai |

> **Hoac dung Blueprint**: file `render.yaml` o thu muc goc da chua san toan bo
> cau hinh tren → Render doc tu dong khi tao Blueprint.

### Buoc 3 — Lay link
Sau khi deploy thanh cong (2–4 phut):
```
https://smart-parking-ltdd2.onrender.com
```
→ Day chinh la **link server cloud** dien vao o #5.

### Buoc 4 — Kiem tra
```powershell
# 1. Backend song?
curl https://smart-parking-ltdd2.onrender.com/api/health
# {"ok":true,"mqtt":true,"online":false,"slots":6,"ts":...}

# 2. Bridge MQTT-WS san sang?
curl https://smart-parking-ltdd2.onrender.com/api/bridge
# {"ok":true,"path":"/mqtt","clients":0,...}

# 3. Dashboard web
# mo https://smart-parking-ltdd2.onrender.com  -> giao dien 5 tab
```

> ⚠️ **Render free ngu sau ~15 phut khong co request** → lan truy cap dau tien
> co the mat **30–60 giay** de khoi dong lai. App da co tu reconnect 2 giay
> nen se tu ket noi lai sau khi server thuc day.

---

## 2. Ket noi App React Native vao server cloud

Mo App → tab **🅿️ Bai** → **⚙️ Cai dat ket noi (nhap link server)**:

| O | Nhap |
|---|---|
| Link server | `https://smart-parking-ltdd2.onrender.com` |
| Ma sinh vien | `SV01` (hoac `SV02` de demo 2 may) |
| Che do | **🌐 Qua Backend** (mac dinh) |

App tu suy ra:
- REST API → `https://smart-parking-ltdd2.onrender.com/api/...`
- MQTT WebSocket → `wss://smart-parking-ltdd2.onrender.com/mqtt`

> **Che do 📡 Thang Broker**: dung khi ban tu chay Broker co bat WebSocket
> (`ws://<IP-may>:9001`) — vi du khi demo offline trong lop.

---

## 3. Ket noi ESP32 (Wokwi) vao broker cloud

Firmware mac dinh da tro san broker public:

```cpp
const char* MQTT_HOST = "test.mosquitto.org";
const int   MQTT_PORT = 1883;
```

Chi can nap lai `esp32/parking_firmware.ino` len Wokwi → ESP32, Simulator va
Backend cloud deu dung chung mot broker → du lieu hien thi dong bo tren
Dashboard cloud.

Simulator tren may local cung chi can doi broker:
```powershell
python simulator/parking_simulator.py --mode demo --host test.mosquitto.org --user "" --password ""
```

---

## 4. Broker public dung cho do an

| Dich vu | Free tier | Ghi chu |
|---|---|---|
| **test.mosquitto.org** | khong gioi han (cong cong) | 1883 + 443, **khong co WebSocket** → dung bridge |
| HiveMQ Cloud | 100 client | Co WebSocket + TLS, quan ly tai khoan |
| EMQX Cloud Serverless | 1M session/phut | Dashboard dep, chup anh bao cao |
| Mosquitto tren VPS/Oracle Free | tu quan | Giong `broker/docker-compose.yml` trong repo |

---

## 5. Neu muon tu host broker (khong dung broker cong cong)

```powershell
cd broker
docker compose up -d
```
- ESP32/Simulator → `mqtt://<IP-may>:1883`
- App (che do *Thang Broker*) → `ws://<IP-may>:9001`
- Backend cloud → `MQTT_URL = mqtt://<IP-may>:1883`
  (can mo port 1883 tren router — hoac dung `ngrok tcp 1883`)

---

## 6. Bang so sanh cac phuong an "link server cloud"

| Phuong an | Uu | Nhuoc | Link |
|---|---|---|---|
| **Render.com** (khuyen dung) | Link `.onrender.com` lau dai, HTTPS, mien phi, co badge CI | Ngu 15 phut khong request | `https://<ten>.onrender.com` |
| Cloudflare Tunnel | Mien phi, link `*.trycloudflare.com` | **Chi song khi may ban bat** | tam |
| localtunnel (`loca.lt`) | Nhanh, khong can dang nhap | Tat may la mat link | tam |
| VPS / Oracle Cloud | Kiem soat hoan toan | Ton cong cau hinh | `https://<IP>` |