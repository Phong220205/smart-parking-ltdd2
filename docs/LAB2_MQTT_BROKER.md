# LAB 2 — MQTT BROKER (MOSQUITTO) BÃI ĐỖ XE THÔNG MINH

> **Tài liệu hướng dẫn đầy đủ**: cấu trúc · cấu hình · source code · cách hoạt động từng bước · cách chạy · cách kiểm thử · xử lý lỗi.
>
> Repo: https://github.com/Phong220205/smart-parking-ltdd2 · Thư mục: `broker/`
> Phiên bản: 2.0 — cập nhật 23/11/2026

---

## MỤC LỤC

1. [Lab 2 làm gì?](#1-lab-2-làm-gì)
2. [Yêu cầu phiếu chấm → cách hiện thực](#2-yêu-cầu-phiếu-chấm--cách-hiện-thực)
3. [Kiến trúc tổng quan](#3-kiến-trúc-tổng-quan)
4. [Cấu trúc thư mục `broker/`](#4-cấu-trúc-thư-mục-broker)
5. [Source code — giải thích chi tiết](#5-source-code--giải-thích-chi-tiết)
   - 5.1 [`docker-compose.yml`](#51-docker-composeyml--4-cổng-listen)
   - 5.2 [`config/mosquitto.conf`](#52-configmosquittoconf--bản-có-tls)
   - 5.3 [`config/acl.conf`](#53-configaclconf--phân-quyền-topic)
   - 5.4 [`entrypoint.sh`](#54-entrypointsh--tự-sinh-file-passwd)
   - 5.5 [`Dockerfile`](#55-dockerfile)
   - 5.6 [`make_certs.py`](#56-make_certspy--sinh-chứng-thư-tls)
   - 5.7 [`make-passwd.bat`](#57-make-passwdbat)
6. [Cơ chế bảo mật 4 lớp](#6-cơ-chế-bảo-mật-4-lớp)
7. [MQTT-over-WebSocket Bridge (mở rộng cho Lab 3)](#7-mqtt-over-websocket-bridge-mở-rộng-cho-lab-3)
8. [Source code demo — chạy được ngay](#8-source-code-demo--chạy-được-ngay)
9. [Hướng dẫn cài đặt & chạy từng bước](#9-hướng-dẫn-cài-đặt--chạy-từng-bước)
10. [Kiểm thử](#10-kiểm-thử)
11. [Bảng topic đầy đủ](#11-bảng-topic-đầy-đủ)
12. [Xử lý lỗi thường gặp](#12-xử-lý-lỗi-thường-gặp)
13. [Câu hỏi GV có thể hỏi](#13-câu-hỏi-gv-có-thể-hỏi)

---

## 1. Lab 2 làm gì?

**Lab 2 xây dựng tầng truyền tải (transport layer)** của hệ thống — **MQTT Broker Mosquitto** chạy trong Docker, làm trung gian giữa thiết bị ESP32 và ứng dụng React Native.

```
   ESP32 / Simulator                BROKER MOSQUITTO                App React Native
  (thiết bị, nhận lệnh)      (trung gian, kiểm soát)        (người dùng, xem + đặt chỗ)
        │                              │                                │
        │──── MQTT/TCP :1883 ────────▶│                                │
        │                              │                                │
        │◀─── publish trạng thái ──────│                                │
        │                              │                                │
        │                         ◀────│──── subscribe / publish ──────│
        │                              │         WebSocket :9001        │
```

**4 chức năng chính đạt được:**

| # | Chức năng | Hiện thực | Minh chứng |
|---|---|---|---|
| 1 | **Broker MQTT** chạy trong Docker | `eclipse-mosquitto:2.0`, 4 listener | `docker compose ps` + log CONNECT/PUBLISH |
| 2 | **Xác thực người dùng** | `allow_anonymous false` + `password_file` | 2 user `esp32` / `app` |
| 3 | **Phân quyền topic (ACL)** | `acl_file` — App không giả mạo được cảm biến | App publish trạng thái ô → **bị từ chối** |
| 4 | **Mã hoá SSL/TLS** | 2 listener TLS + chứng thư tự ký có CA | `test_tls.py` → **5/5 PASS**, TLSv1.3 |

---

## 2. Yêu cầu phiếu chấm → cách hiện thực

| Yêu cầu trong phiếu chấm | Cách hiện thực trong repo | File chứng minh |
|---|---|---|
| Cài đặt & cấu hình MQTT Broker | Docker Compose, image `eclipse-mosquitto:2.0` | `broker/docker-compose.yml` |
| Broker chạy nhiều cổng (TCP + WebSocket) | 4 listener: 1883, 9001, 8883, 9002 | `broker/config/mosquitto.conf` |
| **Xác thực** user/password | `allow_anonymous false` + `password_file` | `broker/config/passwd` |
| **Phân quyền** (ACL) theo topic | `acl_file` với rule `read`/`write`/`readwrite` | `broker/config/acl.conf` |
| **Mã hoá** (TLS/SSL) | `cafile`/`certfile`/`keyfile`, `tls_version tlsv1.2` | `broker/make_certs.py` |
| **Nhật ký** (log) | `log_type all` + `connection_messages true` | Log container stdout |
| Nhiều client kết nối đồng thời | `max_connections 100` (WebSocket) | `simulator/test_suite.py` |
| QoS & Retain | QoS 1 cho lệnh & trạng thái, retain cho snapshot | `esp32/parking_firmware.ino` |
| Chứng thư có SAN + AKI | `make_certs.py` tự sinh SAN/AKI | `broker/config/certs/` |

---

## 3. Kiến trúc tổng quan

```
┌─────────────────────────────────────────────────────────────────────┐
│                        BROKER MOSQUITTO 2.0                        │
│                      (container: parking-mosquitto)                │
│                                                                     │
│  ┌───────────────┐ ┌───────────────┐ ┌──────────────┐ ┌──────────┐ │
│  │ :1883         │ │ :9001         │ │ :8883        │ │ :9002    │ │
│  │ protocol mqtt │ │ protocol ws   │ │ protocol mqtt│ │ protocol │ │
│  │ (TCP thường)  │ │ (WebSocket)   │ │ + TLS        │ │ ws + TLS │ │
│  └───────┬───────┘ └───────┬───────┘ └──────┬───────┘ └────┬─────┘ │
│          │                 │                │              │       │
│          └────────────┬────┴────────────────┴──────────────┘       │
│                       │                                            │
│        ┌──────────────▼───────────────┐                            │
│        │  allow_anonymous false        │  ← BẮT kết nối ẩn danh    │
│        │  password_file → passwd      │  ← xác thực user/pass      │
│        │  acl_file → acl.conf         │  ← phân quyền theo topic  │
│        │  log_type all                │  ← nhật ký đầy đủ          │
│        └──────────────┬───────────────┘                            │
└───────────────────────┼─────────────────────────────────────────────┘
                        │
        ┌───────────────┴──────────────┐
        │                              │
   user esp32                     user app
   readwrite parking/#            read  parking/slot/+/status
   (thiết bị — toàn quyền)         read  parking/slots/snapshot
                                  read  parking/booking/+/state
                                  read  parking/gate/barrier/state
                                  read  parking/gate/rfid
                                  read  parking/billing/receipt
                                  read  parking/system/heartbeat
                                  write parking/booking/+/set
                                  write parking/gate/barrier/cmd
                                  (KHÔNG được publish trạng thái ô)
```

### Vì sao thiết kế như vậy?

**a) Vì sao `esp32` có toàn quyền?**
ESP32 là **nguồn sự thật duy nhất** cho trạng thái vật lý của 6 ô đỗ. Nó phải publish được trạng thái ô, xuất hoá đơn, báo heartbeat. Nếu giới hạn, thiết bị sẽ không hoạt động.

**b) Vì sao `app` bị hạn chế?**
App là **giao diện người dùng** — chỉ cần *xem* trạng thái và *gửi lệnh*. Nếu App có thể publish `parking/slot/P1/status`, thì một máy tính bị hack (hoặc một App cố tình phá) có thể **giả mạo trạng thái cảm biến** → mọi tính toán tiền và logic nghiệp vụ trở nên không đáng tin.

Đây là **điểm cốt lõi về mặt bảo mật** của Lab 2 và là ý tưởng chính cần trình bày trước GV.

**c) Vì sao dùng `allow_anonymous false`?**
Nếu cho phép ẩn danh, bất kỳ ai biết địa chỉ broker đều có thể đọc/ghi topic → ACL vô nghĩa. Bắt buộc đăng nhập là điều kiện tiên quyết để ACL có tác dụng.

---

## 4. Cấu trúc thư mục `broker/`

```
broker/
├── docker-compose.yml      # Định nghĩa container + 4 cổng + volume
├── Dockerfile               # Image tự build (cho Render deploy)
├── entrypoint.sh            # Tự sinh passwd lúc start → chạy broker foreground
├── mosquitto.conf           # Bản config KHÔNG TLS (dùng cho Render deploy)
├── acl.conf                 # ACL bản root (không TLS)
├── passwd                   # HASH mật khẩu (KHÔNG commit - .gitignore)
├── passwd.example           # File mẫu để người khác tạo passwd riêng
├── make-passwd.bat          # Script Windows tạo user cho broker
├── make_certs.py            # Sinh chứng thư TLS tự ký (CA + server)
├── config/                  # ← Cấu hình dùng khi chạy LOCAL
│   ├── mosquitto.conf       #   Bản ĐẦY ĐỦ có TLS (1883/9001/8883/9002)
│   ├── acl.conf             #   ACL bản đầy đủ (thêm rule system/status)
│   ├── ci-mosquitto.conf    #   Bản riêng cho CI (không nhúng broker)
│   ├── passwd               #   Hash mật khẩu (mount read-only vào container)
│   └── certs/
│       ├── ca.crt           #   CA dùng để client xác thực server
│       ├── ca.key           #   Khoá CA (KHÔNG commit)
│       ├── server.crt       #   Chứng thư server (CN=broker.local)
│       └── server.key       #   Khoá server (KHÔNG commit)
```

> **Phân biệt quan trọng:**
> - `broker/config/` → dùng `docker-compose.yml` mount `./config` vào container → **bản có TLS**, chạy local
> - `broker/*.conf` (root) → dùng `Dockerfile` COPY vào image → **bản không TLS**, deploy Render (đơn giản hơn, không cần chứng thư)

---

## 5. Source code — giải thích chi tiết

### 5.1 `docker-compose.yml` — 4 cổng listen

```yaml
services:
  mosquitto:
    image: eclipse-mosquitto:2.0
    container_name: parking-mosquitto-ci
    user: root
    restart: unless-stopped
    ports:
      - "1883:1883"   # MQTT TCP cho ESP32 / simulator
      - "9001:9001"   # WebSocket cho App React Native
      - "8883:8883"   # MQTT TLS (mã hoá) cho ESP32 / simulator
      - "9002:9002"   # WebSocket TLS (wss://) cho App React Native
    volumes:
      - ./config:/mosquitto/config:ro
      - mosquitto-data:/mosquitto/data
      - mosquitto-log:/mosquitto/log
volumes:
  mosquitto-data:
  mosquitto-log:
```

**Giải thích từng dòng:**

| Dòng | Ý nghĩa |
|---|---|
| `image: eclipse-mosquitto:2.0` | Image chính thức của Eclipse Mosquitto phiên bản 2.0. Dùng image chính thức thay vì tự build → ít rủi ro, được cập nhật bảo mật. |
| `container_name` | Tên cố định để dễ `docker logs parking-mosquitto-ci`. |
| `user: root` | Image chính thức chạy user `mosquitto` (uid 1883). Khi mount volume từ host (Windows/macOS) cần quyền ghi → tạm đặt `root`. Trên Linux production nên bỏ dòng này. |
| `restart: unless-stopped` | Broker tự khởi động lại sau khi máy khởi động lại — tránh tình trạng "máy tính bật lại là hệ thống chết". |
| `ports: "1883:1883"` | Cổng **host** : cổng **container**. ESP32/simulator/backend kết nối `mqtt://<IP-máy>:1883`. |
| `ports: "9001:9001"` | App React Native kết nối `ws://<IP-máy>:9001/mqtt`. |
| `ports: "8883:8883"` | Kênh **đã mã hoá** cho ESP32/simulator: `mqtts://<IP-máy>:8883`. |
| `ports: "9002:9002"` | Kênh **đã mã hoá** cho App: `wss://<IP-máy>:9002/mqtt`. |
| `./config:/mosquitto/config:ro` | Mount thư mục cấu hình từ máy host vào container ở chế độ **chỉ đọc** (`:ro`) → broker không thể sửa file cấu hình. Sửa config trên host → `docker compose restart` là áp dụng. |
| `mosquitto-data:/mosquitto/data` | Volume ảo lưu **session & retain message** → broker restart không mất trạng thái. |
| `mosquitto-log:/mosquitto/log` | Volume ảo lưu log broker (khi đổi `log_dest` sang file). |

> **Vì sao mount read-only mà broker vẫn chạy?**
> Vì broker chỉ cần **đọc** `mosquitto.conf`, `acl.conf`, `passwd`. Dữ liệu ghi được nằm ở `/mosquitto/data` và `/mosquitto/log` — 2 volume riêng.

---

### 5.2 `config/mosquitto.conf` — bản có TLS

```ini
persistence true
persistence_location /mosquitto/data/
log_dest stdout
log_type all
connection_messages true

allow_anonymous false
password_file /mosquitto/config/passwd
acl_file /mosquitto/config/acl.conf

# ------------------------------- MQTT / TCP ---------------------------------
listener 1883
protocol mqtt
max_queued_messages 500
max_inflight_messages 20

# ---------------------------- MQTT / WebSocket -----------------------------
listener 9001
protocol websockets
max_connections 100

# ------------------------------ MQTT / TLS ---------------------------------
listener 8883
protocol mqtt
cafile /mosquitto/config/certs/ca.crt
certfile /mosquitto/config/certs/server.crt
keyfile /mosquitto/config/certs/server.key
tls_version tlsv1.2
require_certificate false
max_queued_messages 500

# ------------------------- MQTT / WebSocket / TLS --------------------------
listener 9002
protocol websockets
cafile /mosquitto/config/certs/ca.crt
certfile /mosquitto/config/certs/server.crt
keyfile /mosquitto/config/certs/server.key
tls_version tlsv1.2
require_certificate false
max_connections 100
```

#### Giải thích nhóm "Cấu hình chung"

| Chỉ thị | Tác dụng | Vì sao cần |
|---|---|---|
| `persistence true` | Lưu session + retain message xuống đĩa | App đóng app rồi mở lại vẫn nhận được trạng thái ô hiện tại mà không cần chờ ESP32 gửi lại. |
| `persistence_location /mosquitto/data/` | Nơi lưu file persist | Trỏ vào volume `mosquitto-data` → không mất khi container xoá. |
| `log_dest stdout` | Ghi log ra stdout của container | `docker logs parking-mosquitto-ci` xem được ngay. Với Docker, đây là cách chuẩn để thu thập log (12-factor). |
| `log_type all` | Bật **toàn bộ** loại log: error, warning, notice, information, debug, subscribe, unsubscribe, websockets, security | Bắt được cả thông báo **từ chối xác thực** (`Connection from ... denied`) → đây chính là log dùng để minh chứng "ACL chặn App giả mạo cảm biến". |
| `connection_messages true` | Log mỗi lần client kết nối | Minh chứng "nhiều client kết nối đồng thời". |

#### Giải thích nhóm "Bảo mật"

```ini
allow_anonymous false
password_file /mosquitto/config/passwd
acl_file /mosquitto/config/acl.conf
```

| Chỉ thị | Tác dụng |
|---|---|
| `allow_anonymous false` | **Từ chối** mọi kết nối không có username/password. Client buộc phải đăng nhập. |
| `password_file` | File chứa username + hash mật khẩu. Mosquitto dùng PBKDF2-SHA512 (`$7$101$...`) — hash này là **một chiều**, lộ ra cũng không suy ra được mật khẩu gốc. |
| `acl_file` | File chứa quy tắc phân quyền topic cho từng user. |

> ⚠️ **Cơ chế quan trọng:** Mosquitto chặn `PUBLISH` khi **không có rule nào khớp** topic. Không cần liệt kê "topic bị cấm" — chỉ cần khai báo cái được phép, tất cả phần còn lại tự động bị chặn. Đây là mô hình **allow-list** (danh sách cho phép) — an toàn hơn deny-list.

#### Giải thích nhóm "Listener"

| Listener | `protocol` | Dùng cho | Ghi chú |
|---|---|---|---|
| `1883` | `mqtt` | ESP32 (Wokwi), simulator, backend | TCP thường. ESP32 dùng port này khi chạy local (không bật TLS). |
| `9001` | `websockets` | App React Native | App RN **chỉ** nối được WebSocket, không nối được TCP thường từ điện thoại. |
| `8883` | `mqtt` + TLS | ESP32/simulator khi bật mã hoá | `mqtts://` |
| `9002` | `websockets` + TLS | App qua `wss://` | Kết hợp "App cần WebSocket" + "cần mã hoá". |

**Giải thích các tham số chuyên sâu:**

| Tham số | Giá trị | Ý nghĩa sâu |
|---|---|---|
| `max_queued_messages 500` | 500 | Số message tối đa xếp hàng chờ gửi cho 1 client khi client đang bận hoặc mạng chậm. Broker có giới hạn bộ nhớ → tránh bị client chậm làm cạn RAM broker (DoS). |
| `max_inflight_messages 20` | 20 | Số gói QoS>0 đang chờ xác nhận đồng thời (cửa sổ cửa — "window"). Giới hạn băng thông và bộ nhớ. |
| `max_connections 100` | 100 | Số client WebSocket tối đa đồng thời trên 1 listener. |
| `cafile` | đường dẫn CA | CA dùng để **client** xác thực chứng thư server. Broker cũng dùng nó để kiểm tra chuỗi chứng thư client nếu bật `require_certificate true`. |
| `certfile` | server.crt | Chứng thư server trình bày cho client. |
| `keyfile` | server.key | Khoá riêng tư tương ứng (phải khớp `server.crt`). |
| `tls_version tlsv1.2` | TLS 1.2+ | Chặn TLS 1.0/1.1 đã lỗi thời. Khi client hỗ trợ TLS 1.3 (Python 3.11+ / OpenSSL 3.x) thì **thực tế dùng TLS 1.3** — vì `tls_version` là mức tối thiểu. |
| `require_certificate false` | | Broker **không** bắt client phải trình chứng thư (client certificate). Vẫn dùng user/password. Nếu bật `true` thì phải cấp chứng thư cho từng client — phức tạp hơn, không cần cho đồ án. |

---

### 5.3 `config/acl.conf` — phân quyền topic

```ini
# ------------------------------- ESP32 --------------------------------------
user esp32
topic readwrite parking/#
topic readwrite parking/system/#

# -------------------------------- APP ---------------------------------------
user app
topic read parking/slot/+/status
topic read parking/slots/snapshot
topic read parking/booking/+/state
topic read parking/gate/barrier/state
topic read parking/gate/rfid
topic read parking/billing/receipt
topic read parking/system/heartbeat
topic write parking/booking/+/set
topic write parking/gate/barrier/cmd
```

#### Giải thích cú pháp wildcard MQTT

| Ký hiệu | Ý nghĩa | Ví dụ |
|---|---|---|
| `+` | khớp **đúng 1** cấp | `parking/slot/+/status` → `parking/slot/P1/status`, `parking/slot/P2/status` ✅ nhưng KHÔNG khớp `parking/slot/P1/x/status` |
| `#` | khớp **0 hoặc nhiều** cấp (chỉ ở cuối) | `parking/#` → `parking/a`, `parking/a/b/c` ✅ |
| `*` | khớp đúng 1 cấp, **chỉ trong `topic` filter** | giống `+` nhưng không dùng được trong ACL filter |

#### Bảng ý nghĩa từng rule

| User | Rule | Cho phép làm gì | Chặn điều gì |
|---|---|---|---|
| `esp32` | `readwrite parking/#` | Đọc + ghi **mọi** topic trong `parking/` | Topic ngoài `parking/` (vd `admin/#`) |
| `app` | `read parking/slot/+/status` | Đọc trạng thái 6 ô | — |
| `app` | `read parking/slots/snapshot` | Đọc ảnh chụp toàn bộ bãi | — |
| `app` | `read parking/booking/+/state` | Đọc kết quả đặt/hủy chỗ | — |
| `app` | `read parking/gate/barrier/state` | Đọc trạng thái barrier | — |
| `app` | `read parking/gate/rfid` | Đọc sự kiện quét thẻ | — |
| `app` | `read parking/billing/receipt` | Đọc hoá đơn | — |
| `app` | `read parking/system/heartbeat` | Đọc heartbeat | — |
| `app` | `write parking/booking/+/set` | **Gửi lệnh** đặt/hủy chỗ | — |
| `app` | `write parking/gate/barrier/cmd` | **Gửi lệnh** mở/đóng barrier | — |
| `app` | *(không có rule write cho topic trạng thái)* | — | ❌ **Không publish được** `parking/slot/P1/status` |

#### Minh chứng ACL hoạt động (chạy thật)

```powershell
# Publish trạng thái ô GIẢ (App không được phép) → phải bị từ chối
python -c "import paho.mqtt.client as mqtt,json,time; c=mqtt.Client(); c.username_pw_set('app','app123'); c.connect('127.0.0.1',1883,10); c.loop_start(); time.sleep(1); c.publish('parking/slot/P1/status', json.dumps({'id':'P1','occupied':True}), qos=1); time.sleep(2); print('da gui - xem log broker')"
```

```powershell
# Xem log broker → sẽ thấy dòng bị chặn
docker logs parking-mosquitto-ci 2>&1 | Select-String "denied|ACL"
```

> Trong `log_type all`, Mosquitto ghi rõ: `Denied PUBLISH from app (d7, q1, r0, m0, 'parking/slot/P1/status')`.
> Đây là **ảnh chụp log** đắt giá nhất để đưa vào báo cáo Lab 2.

---

### 5.4 `entrypoint.sh` — tự sinh file passwd

Đây là điểm **bảo mật quan trọng** trong thiết kế: file `passwd` chứa hash mật khẩu **không được commit lên GitHub**.

```sh
set -e

# --- 1) Chuẩn bị thư mục ---
mkdir -p /mosquitto/data /mosquitto/log /mosquitto/config
chown -R mosquitto:mosquitto /mosquitto 2>/dev/null || true

# --- 2) Tạo file passwd từ hash (nếu chưa có) ---
ESP32_PASS_HASH='$7$101$tGtDkXyxvfM1Ml6C$gSE5qHobzrWEsR2KffuRJK+/cnymyZNlDJjMEdSkIJ03VhzrwORkI00pDpTX4Go591ShhTrifBXvsMVRI3YwTA=='
APP_PASS_HASH='$7$101$LC+kiLBxixUYKPvA$TeCTqGrPO03KkWfyhdRshOB7lKpD6I+SDMk17BNIQvizYfQ0Xm//G2s4K/0Zt7VBYe8g8FxyA63WNbjO8bRBLQ=='

if [ ! -f /mosquitto/config/passwd ]; then
  printf 'esp32:%s\napp:%s\n' "$ESP32_PASS_HASH" "$APP_PASS_HASH" > /mosquitto/config/passwd
  echo "[entrypoint] Da tao /mosquitto/config/passwd voi 2 tai khoan (esp32, app)"
fi

chown mosquitto:mosquitto /mosquitto/config/passwd /mosquitto/config/acl.conf
chmod 0700 /mosquitto/config/passwd /mosquitto/config/acl.conf 2>/dev/null || true

# --- 4) Khởi động broker ở foreground ---
echo "[entrypoint] Khoi dong Mosquitto (foreground)..."
exec mosquitto -c /mosquitto/config/mosquitto.conf -v
```

**Giải thích từng bước:**

| Bước | Lệnh | Tác dụng & lý do |
|---|---|---|
| 1 | `mkdir -p /mosquitto/data /mosquitto/log` | Đảm bảo thư mục tồn tại (image chính thức đã có, nhưng mount volume có thể ghi đè thành rỗng). |
| 1 | `chown -R mosquitto:mosquitto /mosquitto` | File mount từ host thuộc user host → broker (user `mosquitto`) không ghi được. Lệnh này **bỏ qua lỗi** (`|| true`) vì trên Windows/macOS `chown` không có tác dụng. |
| 2 | `printf 'esp32:%s\napp:%s\n'` | Ghi file `passwd` đúng định dạng Mosquitto: `username:hash` mỗi dòng. `\n` = xuống dòng. |
| 2 | `if [ ! -f ... ]` | Chỉ tạo nếu chưa có → nếu bạn mount `passwd` riêng (đã tạo sẵn) thì **giữ nguyên** file của bạn. Đây là cơ chế "ưu tiên config người dùng". |
| 3 | `chmod 0700` | Mosquitto **cảnh báo** nếu file passwd/acl quyền rộng hơn 0700 ("Warning: file ... permissions too open"). Lệnh này giữ log sạch. |
| 4 | `exec mosquitto -c ... -v` | `exec` thay thế tiến trình shell bằng tiến trình mosquitto → container nhận đúng tín hiệu `SIGTERM`/`SIGKILL` từ Docker → **graceful shutdown** (đóng kết nối, ghi file persist). Nếu không có `exec`, container sẽ bị kill sau 10s. |
| 4 | `-v` (verbose) | In log mức debug ra stdout → debug dễ hơn. |

**Về dạng hash `$7$101$...`:**

| Thành phần | Ý nghĩa |
|---|---|
| `$7$` | Thuật toán PBKDF2-SHA512 (Mosquitto 2.0 hỗ trợ) |
| `101` | Số vòng lặp (iteration count) |
| `salt` | Chuỗi ngẫu nhiên 16 byte, base64 |
| `hash` | Kết quả băm, base64 |

> **Đổi mật khẩu:**
> ```sh
> docker run --rm -it eclipse-mosquitto:2.0 \
>   mosquitto_passwd -c /mosquitto/config/passwd esp32
> # nhập mật khẩu mới 2 lần
> docker run --rm -it eclipse-mosquitto:2.0 \
>   mosquitto_passwd -b /mosquitto/config/passwd app newpass123
> ```

---

### 5.5 `Dockerfile`

```dockerfile
FROM eclipse-mosquitto:2.0

RUN mkdir -p /mosquitto/data /mosquitto/log && \
    chown -R mosquitto:mosquitto /mosquitto

COPY mosquitto.conf /mosquitto/config/mosquitto.conf
COPY acl.conf        /mosquitto/config/acl.conf
COPY entrypoint.sh   /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
```

| Lệnh | Giải thích |
|---|---|
| `FROM eclipse-mosquitto:2.0` | Base image chính thức. |
| `RUN mkdir -p ... && chown -R ...` | Tạo thư mục & trao quyền cho user `mosquitto`. Dùng `&&` để chỉ chạy `chown` khi `mkdir` thành công. |
| `COPY mosquitto.conf` | Copy bản config **không TLS** (root) — dùng cho deploy Render. |
| `COPY acl.conf` | Copy ACL tương ứng. |
| `COPY entrypoint.sh` | Copy script khởi động. |
| `RUN chmod +x` | Làm script thực thi được. |
| `ENTRYPOINT ["/entrypoint.sh"]` | Dạng **exec form** (mảng JSON) → không qua shell → tín hiệu truyền thẳng tới script. |

> **Vì sao KHÔNG `COPY passwd`?**
> Vì `passwd` chứa hash mật khẩu. Nếu COPY vào image → image chứa bí mật → push image lên registry = lộ mật khẩu. `entrypoint.sh` sinh file lúc runtime từ hash nhúng sẵn trong script (cũng là demo, nhưng tốt hơn là commit file binary).
> Trong `docker-compose.yml` (chạy local) ta mount `./config` read-only nên `passwd` có sẵn từ host — entrypoint sẽ **không** ghi đè (nhờ `if [ ! -f ]`).

---

### 5.6 `make_certs.py` — sinh chứng thư TLS

```python
DAYS = 3650  # 10 nam

def gen_key():
    return rsa.generate_private_key(public_exponent=65537, key_size=2048)
```

#### Chứng thư CA

```python
ca_cert = (
    x509.CertificateBuilder()
    .subject_name(ca_name)
    .issuer_name(ca_name)              # <- CA tự ký: subject = issuer
    .public_key(ca_key.public_key())
    .serial_number(x509.random_serial_number())
    .not_valid_before(now - datetime.timedelta(days=1))
    .not_valid_after(now + datetime.timedelta(days=DAYS))
    .add_extension(x509.BasicConstraints(ca=True, path_length=0), critical=True)
    .add_extension(x509.KeyUsage(
        digital_signature=True, content_commitment=False,
        key_encipherment=False, data_encipherment=False,
        key_agreement=False, key_cert_sign=True, crl_sign=True,
        encipher_only=False, decipher_only=False,
    ), critical=True)
    .add_extension(x509.SubjectKeyIdentifier.from_public_key(ca_key.public_key()), critical=False)
    .add_extension(x509.AuthorityKeyIdentifier.from_issuer_public_key(ca_key.public_key()), critical=False)
    .sign(ca_key, hashes.SHA256())
)
```

| Extension | Vì sao cần |
|---|---|
| `BasicConstraints(ca=True)` | Đánh dấu đây là **CA** → client dùng nó để cấp chứng thư con. `path_length=0` = CA này **không** cấp được CA con (đúng vai trò). |
| `KeyUsage(key_cert_sign=True)` | Cho phép ký chứng thư. `critical=True` → client bắt buộc phải hiểu extension này. |
| `SubjectKeyIdentifier` | "Mã định danh" của khoá công khai subject → giúp xây chuỗi. |
| `AuthorityKeyIdentifier` | "Mã định danh" của CA đã ký → **bắt buộc** để chuỗi xác thực hợp lệ. *(Đây chính là 1 trong 9 bug đã sửa: thiếu AKI → client báo lỗi xác thực.)* |

#### Chứng thư server + SAN

```python
srv_name = x509.Name([
    x509.NameAttribute(NameOID.COMMON_NAME, "broker.local"),
    x509.NameAttribute(NameOID.ORGANIZATION_NAME, "Smart Parking Lab2"),
])

ips = {ipaddress.ip_address("127.0.0.1"), ipaddress.ip_address("::1")}
try:
    ips.add(ipaddress.ip_address(host_ip))   # IP nội bộ của máy
except ValueError:
    pass

san = x509.SubjectAlternativeName([
    x509.DNSName("broker.local"),
    x509.DNSName("localhost"),
    x509.DNSName(socket.gethostname()),
    *[x509.IPAddress(i) for i in ips],
])
```

| Thành phần | Vì sao cần |
|---|---|
| `CN=broker.local` | Common Name — tên "thân thiện" của broker. |
| **SAN (Subject Alternative Name)** | **Bắt buộc** trong chuẩn hiện đại: `CN` đã bị bỏ qua, client chỉ tin SAN. |
| `DNSName("broker.local")` | Cho phép client kết nối bằng tên `broker.local` mà **không cần sửa `/etc/hosts`**. |
| `IPAddress(127.0.0.1)` + IP nội bộ | Cho phép kết nối bằng IP. |
| `ExtendedKeyUsage(serverAuth)` | Chứng thư dùng để **xác thực server** (OID 1.3.6.1.5.5.7.3.1). |

#### Thuật toán chữ ký

```python
.sign(ca_key, hashes.SHA256())
```

- **RSA-2048** — khoá đủ mạnh, hỗ trợ rộng.
- **SHA-256** — hàm băm hiện hành (SHA-1 đã lỗi thời).
- `not_valid_before = now - 1 day` — chống lỗi **đồng hồ lệch** (client và server lệch vài phút sẽ không bị từ chối).

**Output:**
```
broker/config/certs/
├── ca.crt      # Đưa cho client để xác thực server
├── ca.key      # Khoá CA (KHÔNG commit)
├── server.crt  # Broker dùng
└── server.key  # Broker dùng (KHÔNG commit)
```

---

### 5.7 `make-passwd.bat`

```bat
@echo off
REM Tao user cho broker (chay 1 lan)
docker run --rm -v "%cd%:/work" eclipse-mosquitto:2.0 mosquitto_passwd -c /work/passwd esp32
docker run --rm -v "%cd%:/work" eclipse-mosquitto:2.0 mosquitto_passwd -b /work/passwd app app123
echo Xong. Kiem tra file passwd roi chay: docker compose up -d
```

| Tham số | Ý nghĩa |
|---|---|
| `docker run --rm` | Chạy container 1 lần rồi **xoá** (`--rm`). |
| `-v "%cd%:/work"` | Mount thư mục hiện tại của Windows vào container tại `/work`. Nhờ đó file `passwd` được ghi ra **máy host**. |
| `mosquitto_passwd -c /work/passwd esp32` | `-c` = **tạo file mới** (ghi đè). Không có `-c` thì lệnh sẽ hỏi mật khẩu 2 lần (tương tác). |
| `mosquitto_passwd -b /work/passwd app app123` | `-b` = **batch mode**: mật khẩu nằm ngay trên dòng lệnh (không tương tác). `app123` là mật khẩu. |

> ⚠️ `-b` lộ mật khẩu trong **history của shell & process list**. Chỉ dùng cho tài khoản demo. Với môi trường thật: bỏ `-b`, để lệnh hỏi nhập ẩn.

---

## 6. Cơ chế bảo mật 4 lớp

```
        ┌──────────────────────────────────────────┐
Lớp 4   │  Phân quyền topic (ACL)                  │  ← app KHÔNG giả mạo được cảm biến
        │  acl.conf                                │
        ├──────────────────────────────────────────┤
Lớp 3   │  Xác thực user/password                  │  ← không đăng nhập = không vào được
        │  allow_anonymous false + password_file   │
        ├──────────────────────────────────────────┤
Lớp 2   │  Mã hoá kênh truyền (TLS)                │  ← không ai nghe lén được
        │  8883 (mqtts) · 9002 (wss://)            │
        ├──────────────────────────────────────────┤
Lớp 1   │  Mạng riêng / Docker network             │  ← port chỉ mở trong container
        │  volumes · internal network              │
        └──────────────────────────────────────────┘
```

| Lớp | Chống được | Minh chứng |
|---|---|---|
| 4 – ACL | Client hợp pháp nhưng hành vi sai (publish giả trạng thái) | Log `Denied PUBLISH from app` |
| 3 – Xác thực | Bất kỳ ai không có tài khoản | `Connection from ... denied` |
| 2 – TLS | Nghe lén đường truyền, chặn đường truyền | `test_tls.py` kịch bản 2 |
| 1 – Network | Truy cập trực tiếp từ Internet | Chỉ mở port qua `render.yaml` / firewall |

---

## 7. MQTT-over-WebSocket Bridge (mở rộng cho Lab 3)

Broker Mosquitto mở cổng WebSocket ở `:9001`, nhưng **App React Native trên điện thoại** cần kết nối tới broker **trên cloud**. Broker public `test.mosquitto.org` mở 1883 + 443 nhưng **không bật WebSocket 8084** → App không nối được.

**Giải pháp:** Backend đóng vai **MQTT-over-WebSocket proxy**.

```javascript
// backend/mqttWsBridge.js (rút gọn)
export function createMqttWsBridge({ mqtt, path = "/mqtt", brokerUrl, username, password, onLog = () => {} }) {
  const wss = new WebSocketServer({ noServer: true });

  // Ket noi MQTT duy nuc xuong broker (chia se cho tat ca App client)
  const upstream = mqtt.connect(brokerUrl, {
    username: username || undefined,
    password: password || undefined,
    clientId: `bridge-${process.pid}-${Date.now().toString(36)}`,
    reconnectPeriod: 2000,
    clean: false,
  });

  // Topic -> Set<client> (client da subscribe topic do)
  const subscriptions = new Map();
  // Cache message cuoi cung theo topic
  const cache = new Map();
  ...
}
```

**Cơ chế bridge hoạt động:**

```
App1 ─┐                                    ┌─► App1 (chỉ topic đã subscribe)
App2 ─┼─► wss://server/mqtt ─► BRIDGE ──┼─► App2
App3 ─┘         (WebSocket)      │      └─► App3
                                  │
                                  └──────► 1 kết nối MQTT duy nhất ──► Broker
```

| Đặc điểm | Cách hiện thực |
|---|---|
| 1 kết nối MQTT duy nhất | `upstream` được tạo 1 lần, chia sẻ cho N App → không quá tải broker |
| Lọc topic theo client | `subscriptions: Map<filter, Set<client>>` → mỗi App chỉ nhận topic **nó đã subscribe** |
| Tự phát lại retain | `cache: Map<topic, payload>` → App mới vào nhận ngay trạng thái hiện tại |
| `clean: false` | Session MQTT bền → không mất retain |
| Xác thực | Bridge gửi `username`/`password` xuống broker — **bắt buộc**, nếu thiếu broker từ chối (`Bad username or password`) |

> ⚠️ **Bug đã gặp & sửa (17/11):** thiếu `username`/`password` → broker nội bộ có ACL từ chối → bridge chết. Sửa bằng cách truyền đúng `app/app123`.

---

## 8. Source code demo — chạy được ngay

### 8.1 Demo 1 — Xác thực: đúng / sai mật khẩu

**File: `simulator/test_broker_direct.py`** (đơn giản, không cần app)

```python
import json, sys, time
import paho.mqtt.client as mqtt

HOST = sys.argv[1] if len(sys.argv) > 1 else "test.mosquitto.org"
PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 1883
SLOT = "P5"
REQ = "direct-test-" + str(int(time.time()))

msgs = []

def on_message(c, u, m):
    try:
        d = json.loads(m.payload.decode())
    except Exception:
        return
    msgs.append((m.topic, d))
    print("[MSG]", m.topic, json.dumps(d)[:100])

c = mqtt.Client(client_id="direct-test-" + str(int(time.time())))
c.on_message = on_message
c.connect(HOST, PORT, 30)
c.loop_start()
c.subscribe("parking/booking/+/state", qos=1)
c.subscribe("parking/system/status", qos=1)
time.sleep(2)

print("[ACT] publish reserve", SLOT, "requestId=" + REQ)
c.publish(f"parking/booking/{SLOT}/set", json.dumps({
    "slot": SLOT, "user": "DIRECT01", "action": "reserve", "requestId": REQ}), qos=1)

found = None
for _ in range(24):
    time.sleep(1)
    for t, d in msgs:
        if d.get("requestId") == REQ:     # <-- khớp requestId
            found = (t, d)
            break
    if found:
        break

c.loop_stop()
c.disconnect()

if found:
    print("[OK] Nhan phan hoi khop requestId:", json.dumps(found[1])[:120])
    sys.exit(0)
print("[FAIL] Khong nhan phan hoi khop requestId sau 24s")
```

**Giải thích luồng:**

| Bước | Code | Mục đích |
|---|---|---|
| 1 | `c.connect(HOST, PORT, 30)` | Mở kết nối MQTT tới broker (timeout 30s). |
| 2 | `c.loop_start()` | Bắt đầu **thread nền** xử lý gói tin đến — bắt buộc trước khi subscribe/publish. |
| 3 | `c.subscribe("parking/booking/+/state", qos=1)` | Đăng ký nhận phản hồi đặt chỗ. Dùng `+` để bắt mọi ô. |
| 4 | `c.publish(... "requestId": REQ)` | Gửi lệnh đặt chỗ kèm **requestId duy nhất**. |
| 5 | vòng lặp chờ 24s | Broker → ESP32 → phản hồi về. |
| 6 | `if d.get("requestId") == REQ` | **Chỉ chấp nhận** phản hồi có đúng requestId → tránh nhận nhầm phản hồi của lệnh trước. |
| 7 | `sys.exit(0)` / `sys.exit(1)` | Mã thoát 0 = PASS, 1 = FAIL → dùng được trong CI. |

**Chạy:**
```powershell
python simulator/test_broker_direct.py 127.0.0.1 1883
```

### 8.2 Demo 2 — Kiểm thử TLS đầy đủ (5 kịch bản)

**File: `simulator/test_tls.py`**

```python
CA = os.path.join(ROOT, "broker", "config", "certs", "ca.crt")
HOST = os.environ.get("BROKER_HOST", "127.0.0.1")
USER = os.environ.get("MQTT_USER", "esp32")
PASS = os.environ.get("MQTT_PASS", "esp32123")

def try_connect(port, use_tls, cafile=None, timeout=8):
    """Tra ve (ok, client, error_msg)."""
    c = mqtt.Client(client_id="tls-test-%d" % (int(time.time() * 1000) % 100000))
    if USER:
        c.username_pw_set(USER, PASS)

    got = []
    c.on_message = lambda cl, u, m: got.append(m.topic)

    if use_tls:
        ctx = ssl.create_default_context(cafile=cafile) if cafile else ssl.create_default_context()
        if not cafile:
            # Client khong tin CA -> khong verify (nen khong fail ngay o keu noi)
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
        c.tls_set_context(ctx)

    try:
        c.connect(HOST, port, timeout)
    except Exception as e:
        return False, c, "connect error: %s" % e

    c.loop_start()
    time.sleep(1.5)
    ok = c.is_connected()
    if ok:
        try:
            c.subscribe("parking/system/status", qos=1)
            time.sleep(1.0)
        except Exception as e:
            ok = False
            c.loop_stop()
            return False, c, "subscribe error: %s" % e
    c.loop_stop()
    try:
        c.disconnect()
    except Exception:
        pass
    return ok, c, ""
```

**Kịch bản 2 — client KHÔNG tin CA phải bị từ chối (quan trọng nhất):**

```python
verify_fail = False
detail = ""
try:
    ctx_bad = ssl.create_default_context()  # khong co CA cua broker
    with socket.create_connection((HOST, 8883), timeout=8) as s:
        with ctx_bad.wrap_socket(s, server_hostname="broker.local") as ss:
            detail = "ket noi THANH CONG (khong mong doi)"
except ssl.SSLCertVerificationError as e:
    verify_fail = True
    detail = "TLS tu choi chung thu khong tin CA: %s" % e.verify_message
except Exception as e:
    verify_fail = True
    detail = "TLS tu choi: %s" % str(e)[:70]
check("MQTT/TLS - client khong tin CA bi tu choi", verify_fail, detail)
```

| Dòng | Giải thích |
|---|---|
| `ssl.create_default_context()` | Context **mặc định** của Python: `check_hostname=True`, `verify_mode=CERT_REQUIRED`, dùng CA hệ thống. Không có CA của broker trong CA hệ thống → **phải** xác thực thất bại. |
| `server_hostname="broker.local"` | Client kiểm tra **tên** trong SAN của chứng thư → phải khớp `DNSName("broker.local")` đã thêm trong `make_certs.py`. |
| `except ssl.SSLCertVerificationError` | Bắt đúng lỗi xác thực chứng thư → đây là kết quả **mong đợi**. |
| `verify_fail = True` | Đảo logic: hệ thống đúng là khi lỗi xảy ra. |

**5 kịch bản kiểm thử:**

| # | Kịch bản | Kỳ vọng |
|---|---|---|
| 1 | MQTT/TLS `:8883` với CA tin cậy | Kết nối thành công + nhận topic |
| 2 | MQTT/TLS client **không** tin CA | **Bị TLS từ chối** |
| 2b | Chuỗi xác thực chạy TLSv1.3 với CA pin | Xác nhựn điều trên là thật |
| 3 | WebSocket/TLS `:9002` (`wss://`) | Bắt tay TLS thành công |
| 4 | MQTT/TCP `:1883` | Vẫn chạy bình thường (không bị ảnh hưởng) |

**Chạy:**
```powershell
python simulator/test_tls.py
# KET QUA TLS: 5/5 PASS
```

### 8.3 Demo 3 — Client MQTT-over-WebSocket (giống hệt App)

**File: `simulator/parking_simulator.py`** (trích đoạn phần WebSocket)

```python
# ---------------------- MQTT-over-WEBSOCKET (giong ESP32) ---------------------
parsed = urlparse(args.ws)
ws_host = parsed.hostname
ws_port = parsed.port or (443 if parsed.scheme == "wss" else 80)
ws_path = parsed.path or "/mqtt"

# paho-mqtt >= 2.0: dung transport "websockets" + ws_set_options
client = mqtt.Client(client_id=args.client_id or f"sim-esp32-{random.randint(0, 99999)}",
                     protocol=mqtt.MQTTv311, transport="websockets")
if args.user and args.password and not args.no_auth:
    client.username_pw_set(args.user, args.password)
client.ws_set_options(path=ws_path)
client.will_set("parking/system/status", json.dumps({"online": False}), qos=1, retain=True)
if args.tls or ws_is_tls:
    client.tls_set()
```

**Giải thích:**

| Dòng | Ý nghĩa |
|---|---|
| `transport="websockets"` | paho-mqtt 2.x yêu cầu khai báo transport. Bản 1.x dùng `WebSocketWrapper` (code có fallback cho cả 2). |
| `client.ws_set_options(path=ws_path)` | Đường dẫn WebSocket (`/mqtt`). Broker Mosquitto chỉ nhận MQTT ở path gốc `/` hoặc path tuỳ chọn. |
| `client.will_set(...)` | **Last Will and Testament** — nếu client chết đột ngột (mất mạng), broker tự publish `{"online": false}` → App biết ESP32 đã offline. |
| `if args.tls or ws_is_tls: client.tls_set()` | **Tự bật TLS khi scheme là `wss://`**. *(Đây chính là bug đã sửa ngày 17/11: simulator không bật TLS → lỗi "WebSocket handshake error" khi nối cloud.)* |

**Chạy 3 chế độ:**

```powershell
# 1) Demo tự động (xe tự ra vào) — kết nối broker local
python simulator/parking_simulator.py --mode demo

# 2) Chế độ đứng yên — để App điều khiển
python simulator/parking_simulator.py --mode quiet

# 3) Kết nối cloud qua wss:// (giống App làm)
python simulator/parking_simulator.py --mode demo `
  --ws wss://smart-parking-ltdd2.onrender.com/mqtt --user esp32 --password esp32123
```

**Lệnh console điều khiển tay (không cần App):**

| Lệnh | Tác dụng |
|---|---|
| `BOOK:P1:SV01` | Đặt chỗ ô P1 cho SV01 |
| `CANCEL:P1:SV01` | Huỷ đặt chỗ |
| `ENTER:P1:SV01` | Xe vào ô P1 |
| `EXIT:P1` | Xe ra ô P1 |
| `STAY:P1:95` | Giả lập xe đã đứng 95 phút → demo tính phí (6000đ) |
| `GATE:OPEN` / `GATE:CLOSE` | Điều khiển barrier |
| `RFID:A1B2C3` | Giả lập quét thẻ RFID |

---

## 9. Hướng dẫn cài đặt & chạy từng bước

### 9.1 Yêu cầu hệ thống

| Phần mềm | Phiên bản | Ghi chú |
|---|---|---|
| Docker Desktop | 28.x | Bắt buộc. Kiểm tra: `docker --version` |
| Python | 3.11+ | Cho `simulator/` (paho-mqtt, cryptography) |
| Node.js | 18+ | Cho backend (không bắt buộc cho Lab 2) |

```powershell
pip install -r simulator/requirements.txt
```

### 9.2 Bước 1 — Sinh chứng thư TLS (chỉ làm 1 lần)

```powershell
python broker/make_certs.py
```

**Output mong đợi:**
```
Da sinh chung thu TLS tai: D:\LTDD2\broker\config\certs
  ca.crt            1334 bytes
  ca.key            1675 bytes
  server.crt       1188 bytes
  server.key       1675 bytes
SAN chua: broker.local, localhost, DESKTOP-XXX, 127.0.0.1, ::1, 192.168.x.x
```

### 9.3 Bước 2 — Tạo file passwd (nếu chưa có)

```powershell
cd broker
.\make-passwd.bat
```

> Repo đã có sẵn `broker/config/passwd` (mount read-only) → **thường không cần làm bước này**.

### 9.4 Bước 3 — Khởi động broker

```powershell
cd D:\LTDD2
docker compose -f broker/docker-compose.yml up -d
```

**Kiểm tra:**
```powershell
docker compose -f broker/docker-compose.yml ps
docker logs parking-mosquitto-ci --tail 30
```

**Log mong đợi:**
```
[entrypoint] Da tao /mosquitto/config/passwd voi 2 tai khoan (esp32, app)
[entrypoint] Khoi dong Mosquitto (foreground)...
1574638800: mosquitto version 2.0.18 starting
1574638800: Opening ipv4 listener on port 1883.
1574638800: Opening ipv4 listener on port 9001.
1574638800: Opening ipv4 listener on port 8883.
1574638800: Opening ipv4 listener on port 9002.
```

### 9.5 Bước 4 — Kiểm tra 4 cổng đang mở

```powershell
# Trong container
docker exec -it parking-mosquitto-ci ss -tlnp
# hoặc từ máy host
netstat -ano | Select-String ":1883|:9001|:8883|:9002"
```

### 9.6 Bước 5 — Chạy kiểm thử

```powershell
# Kiểm thử TLS (5 kịch bản)
python simulator/test_tls.py

# Kết nối trực tiếp broker, đặt chỗ
python simulator/test_broker_direct.py 127.0.0.1 1883
```

### 9.7 Bước 6 — Kết nối ESP32 / App

**ESP32 (Wokwi)** — sửa trong `esp32/parking_firmware.ino`:
```cpp
const char* MQTT_HOST = "192.168.1.100";   // IP máy tính chạy Docker
const char* MQTT_USER = "esp32";
const char* MQTT_PASS = "esp32123";
```

**App React Native** — tab ⚙️ Cài đặt:
- Backend URL: `http://192.168.1.100:3000`
- Chế độ: **🔌 Broker trực tiếp** → Broker: `ws://192.168.1.100:9001/mqtt`

**Kiểm tra nhanh bằng CLI:**
```powershell
docker exec -it parking-mosquitto-ci mosquitto_sub -h 127.0.0.1 -u app -P app123 -t "parking/#" -v
# → in ra mọi message App được đăng ký (chứng minh ACL read hoạt động)
```

### 9.8 Bước 7 — Dừng / xoá

```powershell
docker compose -f broker/docker-compose.yml stop     # dừng, giữ data
docker compose -f broker/docker-compose.yml down -v  # xoá cả volume (xoá session + retain)
```

---

## 10. Kiểm thử

### 10.1 Bộ test tự động E2E (39 checkpoint)

```powershell
python simulator/test_suite.py
```

**Output:**
```
KET QUA: 39/39 PASS
```

Bộ test tự bật/tắt simulator `quiet`, tự sinh tài khoản thử nghiệm không trùng lặp.

### 10.2 Kiểm thử TLS

```powershell
python simulator/test_tls.py
```
```
KET QUA TLS: 5/5 PASS
```

### 10.3 Kiểm thử trên CI (GitHub Actions)

File `.github/workflows/ci.yml` chạy lại toàn bộ mỗi lần push:

| Job | Nội dung |
|---|---|
| `test-e2e` | 39 checkpoint + 5 kịch bản TLS |
| `app-syntax` | Kiểm tra syntax 5 file JS backend, 3 file Python, 7 file JSX |

**Biến môi trường quan trọng trong CI:**
```yaml
EMBED_BROKER: false       # KHÔNG nhúng broker nội bộ → dùng Mosquitto có TLS
MQTT_URL: mqtts://localhost:8883
MQTT_CA: broker/config/certs/ca.crt
```

> ⚠️ **3 lỗi CI đã sửa (quan trọng — nếu GV hỏi về CI):**
> 1. Workflow YAML **không parse** do dấu `:` trong tên step → bọc nháy tên. Hệ quả: **chưa từng chạy checkpoint nào**.
> 2. File `passwd` quyền 600 → `Permission denied` khi đọc → thêm `sudo chmod 644`.
> 3. Backend dùng nhầm broker nội bộ (không có TLS) → bỏ qua test TLS → đặt `EMBED_BROKER=false`.

---

## 11. Bảng topic đầy đủ

| Topic | Hướng | QoS | Retain | `esp32` | `app` |
|---|---|---|---|---|---|
| `parking/slot/<ID>/status` | ESP32 → App | 1 | ✅ | rw | r |
| `parking/slots/snapshot` | ESP32 → App | 1 | ✅ | rw | r |
| `parking/booking/<ID>/set` | App → ESP32 | 1 | ❌ | rw | **w** |
| `parking/booking/<ID>/state` | ESP32 → App | 1 | ✅ | rw | r |
| `parking/gate/barrier/cmd` | App → ESP32 | 1 | ❌ | rw | **w** |
| `parking/gate/barrier/state` | ESP32 → App | 1 | ✅ | rw | r |
| `parking/gate/rfid` | ESP32 → App | 0 | ❌ | rw | r |
| `parking/billing/receipt` | ESP32 → App | 1 | ✅ | rw | r |
| `parking/system/status` | ESP32 → App (LWT) | 1 | ✅ | rw | r |
| `parking/system/heartbeat` | ESP32 → App | 0 | ❌ | rw | r |

**Quy ước:**
- `rw` = readwrite (thiết bị), `r` = read, `w` = write (App)
- Topic **lệnh** (`/set`, `/cmd`) **không retain** → tránh chạy lại lệnh cũ khi App reconnect
- Topic **trạng thái** retain → App mở app là thấy ngay trạng thái hiện tại

---

## 12. Xử lý lỗi thường gặp

| Triệu chứng | Nguyên nhân | Cách sửa |
|---|---|---|
| `Connection refused` khi connect 1883 | Container chưa chạy | `docker compose -f broker/docker-compose.yml ps` → `up -d` |
| `Connection from ... denied` trong log | Sai user/pass, hoặc `allow_anonymous` đang `true` | Kiểm tra `password_file` + `allow_anonymous false` |
| `Bad username or password` | Thiếu/sai `username_pw_set` ở client | Thêm `client.username_pw_set("app","app123")` |
| `Not authorized` khi publish topic trạng thái bằng user `app` | **Đúng như thiết kế** — ACL chặn | Dùng user `esp32` để publish trạng thái |
| `WebSocket handshake error` khi nối `wss://` | Client chưa bật TLS | `client.tls_set()` (paho ≥2.0) hoặc `ssl_context` |
| `CERTIFICATE_VERIFY_FAILED` | Client không có CA của broker | `tls_set_context(ssl.create_default_context(cafile="broker/config/certs/ca.crt"))` |
| `keep alive timeout` | Client im lặng > keepalive | Broker cần `PINGREQ` định kỳ (xem `MqttWsClient` tự quản lý trong firmware) |
| `Address already in use` | Cổng 1883 bị chiếm bởi ứng dụng khác | `netstat -ano \| findstr :1883` → tắt process đó, hoặc đổi cổng |
| File `passwd` cảnh báo "permissions too open" | Quyền file > 0700 | `chmod 0700 broker/config/passwd` |
| `Warning: file ... does not exist` | Thiếu `certs/` khi chạy bản có TLS | Chạy `python broker/make_certs.py` |
| Broker tự tắt khi đóng terminal | Chạy không có `-d` | Thêm `-d` (detach) |

---

## 13. Câu hỏi GV có thể hỏi

**Q1: Vì sao dùng MQTT mà không dùng WebSocket thuần?**
> MQTT là giao thức **pub/sub** với 3 tính chất quan trọng cho bài này:
> 1. **Tách biệt publisher/subscriber** — ESP32 không cần biết App đang online hay không.
> 2. **Retain + QoS 1** — App mở app là thấy ngay trạng thái ô, không cần chờ ESP32 gửi lại; và lệnh không bị mất.
> 3. **Hệ sinh thái** — có broker sẵn (Mosquitto), có ACL sẵn, có thư viện client cho ESP32/React Native/Python/Node.

**Q2: Vì sao App không được publish trạng thái ô?**
> Vì ESP32 là **nguồn sự thật duy nhất** cho trạng thái vật lý. Nếu App publish được `parking/slot/P1/status`, thì bất kỳ ai có mật khẩu `app` (hay bị lộ) có thể giả mạo trạng thái → mọi tính toán tiền và quyết định nghiệp vụ trở nên không đáng tin. Đây là nguyên tắc **thẩm quyền tại nguồn** (authority at the source).

**Q3: `allow_anonymous false` khác gì với ACL?**
> `allow_anonymous false` = **cửa vào** (ai được vào building). ACL = **phòng trong building** (vào được thì được vào phòng nào). Cần cả hai: có ACL mà cho ẩn danh thì không có tác dụng.

**Q4: TLS tự ký có an toàn không?**
> An toàn **về mặt mã hoá** (không ai nghe lén được), nhưng **không tin cậy được** về mặt danh tính nếu CA nằm cùng máy với server. Giải pháp production: CA riêng (offline), chứng thư do CA đó ký, client chỉ giữ `ca.crt`. Ở đồ án, việc dùng CA tự sinh và phân phối `ca.crt` cho client là mô hình đúng — chỉ khác ở chỗ CA và server cùng nằm trên máy dev.

**Q5: Vì sao dùng `exec` trong entrypoint?**
> Để container nhận đúng tín hiệu `SIGTERM` từ Docker. Broker có thể đóng kết nối MQTT gracefully và ghi file persist. Không có `exec`, Docker sẽ chờ 10 giây rồi `SIGKILL` → mất session.

**Q6: Broker có tự động tìm cổng trống không?**
> Bản `docker-compose.yml` **không** tự tìm (cổng cố định). Nhưng backend có cơ chế **tự dò cổng trống** khi nhúng broker: nếu 1883 bị chiếm → chuyển 1884, 1885… và báo cổng thật qua `/api/health → brokerPort`. Đây là fix ngày 17/11 khi backend nối nhầm broker.

**Q7: QoS 0, 1, 2 khác nhau thế nào?**
> - QoS 0: **at most once** — gửi 1 lần, không xác nhận. Rủi ro mất.
> - QoS 1: **at least once** — broker ACK, có thể trùng. Client phải tự xử lý trùng lặp.
> - QoS 2: **exactly once** — 4-way handshake, chậm.
> Bài này dùng **QoS 1** cho lệnh & trạng thái (đủ tin cậy, chấp nhận trùng lặp — đã xử lý bằng `requestId`), QoS 0 cho sự kiện (`gate/rfid`, `heartbeat`) vì mất 1 gói không ảnh hưởng nghiệp vụ.

**Q8: Vì sao topic lệnh không retain?**
> Nếu retain lệnh `parking/booking/P1/set`, thì khi ESP32 reconnect (mất mạng 5 giây rồi vào lại), broker sẽ **gửi lại lệnh cũ** → App đặt chỗ trùng. Retain chỉ dùng cho **trạng thái** (dữ liệu đúng tại thời điểm hiện tại), không dùng cho **lệnh** (sự kiện rời rạc).

---

## PHỤ LỤC A — Lệnh vận hành nhanh

```powershell
# Khởi động
docker compose -f broker/docker-compose.yml up -d

# Xem log
docker logs parking-mosquitto-ci -f

# Theo dõi mọi topic (như user app)
docker exec -it parking-mosquitto-ci mosquitto_sub -h 127.0.0.1 -u app -P app123 -t "parking/#" -v

# Publish lệnh (như user app)
docker exec -it parking-mosquitto-ci mosquitto_pub -h 127.0.0.1 -u app -P app123 `
  -t "parking/booking/P5/set" -m '{"slot":"P5","user":"SV01","action":"reserve","requestId":"demo-1"}' -q 1

# Publish trạng thái GIẢ (như user app) → bị từ chối
docker exec -it parking-mosquitto-ci mosquitto_pub -h 127.0.0.1 -u app -P app123 `
  -t "parking/slot/P1/status" -m '{"id":"P1","occupied":true}' -q 1
docker logs parking-mosquitto-ci 2>&1 | Select-String "Denied"

# Chứng thư
openssl x509 -in broker/config/certs/server.crt -noout -text | Select-String "Subject|SAN|DNS|IP Address|Not After"

# Dừng
docker compose -f broker/docker-compose.yml stop
```

## PHỤ LỤC B — File liên quan

| File | Vai trò |
|---|---|
| `broker/docker-compose.yml` | Định nghĩa container + 4 cổng + volume |
| `broker/Dockerfile` | Image tự build cho Render |
| `broker/entrypoint.sh` | Tự sinh `passwd` → chạy broker foreground |
| `broker/config/mosquitto.conf` | Cấu hình đầy đủ (có TLS) — dùng local |
| `broker/mosquitto.conf` | Cấu hình rút gọn (không TLS) — dùng deploy |
| `broker/config/acl.conf` | Phân quyền topic |
| `broker/config/passwd` | Hash mật khẩu (git-ignored) |
| `broker/make_certs.py` | Sinh chứng thư TLS |
| `broker/make-passwd.bat` | Tạo user cho broker |
| `simulator/test_tls.py` | 5 kịch bản kiểm thử TLS |
| `simulator/test_broker_direct.py` | Kết nối trực tiếp broker, đặt chỗ |
| `simulator/parking_simulator.py` | Client MQTT (TCP + WebSocket + TLS) |
| `backend/mqttWsBridge.js` | Proxy MQTT-over-WebSocket cho App |
| `.github/workflows/ci.yml` | CI chạy lại 39 checkpoint + TLS 5/5 |

---

> **Tài liệu Lab 2 — Smart Parking LTDD2** · cập nhật 23/11/2026
> Repo: https://github.com/Phong220205/smart-parking-ltdd2
