# LAB 3 — ỨNG DỤNG DI ĐỘNG (REACT NATIVE EXPO) BÃI ĐỖ XE THÔNG MINH

> **Tài liệu hướng dẫn đầy đủ**: kiến trúc · source code · cách hoạt động · cách chạy trên điện thoại · kiểm thử · xử lý lỗi.
>
> Repo: https://github.com/Phong220205/smart-parking-ltdd2 · Thư mục: `app/`
> Phiên bản: 2.0 — cập nhật 23/11/2026

---

## MỤC LỤC

1. [Lab 3 làm gì?](#1-lab-3-làm-gì)
2. [Cấu trúc dự án](#2-cấu-trúc-dự-án)
3. [Source code — giải thích chi tiết](#3-source-code--giải-thích-chi-tiết)
   - 3.1 [`App.js` — chỉ điều phối](#31-appjs--chỉ-điều-phối)
   - 3.2 [`hooks/useParking.js` — logic trung tâm](#32-hooksuseparkingjs--logic-trung-tâm)
   - 3.3 [`parkingMqtt.js` — service MQTT](#33-parkingmqttjs--service-mqtt)
   - 3.4 [`api.js` — service REST](#34-apijs--service-rest)
   - 3.5 [`components/Tabs.js` — view](#35-componentstabsjs--view)
   - 3.6 [`constants.js` & `utils.js`](#36-constantsjs--utilsjs)
4. [4 tab giao diện](#4-4-tab-giao-diện)
5. [Cách chạy trên điện thoại](#5-cách-chạy-trên-điện-thoại)
6. [Kiểm thử](#6-kiểm-thử)
7. [Bug đã tìm & sửa](#7-bug-đã-tìm--sửa)
8. [Xử lý lỗi thường gặp](#8-xử-lý-lỗi-thường-gặp)

---

## 1. Lab 3 làm gì?

**Lab 3 xây dựng tầng giao diện (presentation layer)** — app React Native Expo cho người dùng:

| Chức năng | Mô tả |
|---|---|
| **Sơ đồ bãi realtime** | Lưới 6 ô, màu theo trạng thái, cập nhật tức thì qua MQTT |
| **Đặt / huỷ chỗ** | Gửi lệnh MQTT, chờ phản hồi khớp `requestId` |
| **Điều khiển barrier** | Mở / đóng cổng |
| **Lịch sử** | Hoá đơn tính phí, lịch sử đặt chỗ |
| **Thống kê** | 4 KPI + 3 biểu đồ (vẽ bằng `View`, không cần thư viện chart) |
| **Tài khoản** | Đăng ký / đăng nhập, JWT, ví nạp tiền |

**Yêu cầu phiếu chấm → hiện thực:**

| Yêu cầu | Hiện thực |
|---|---|
| App chạy được trên điện thoại | Expo SDK 58 + Expo Go (không cần build APK) |
| Giao diện tách component/service rõ ràng | 7 file, 4 tầng (View / Logic / Service / Shared) |
| Kết nối MQTT | `mqtt` package qua **WebSocket** (App RN không nối được TCP thường) |
| Realtime | MQTT push + REST fallback + `AsyncStorage` lưu cấu hình |
| Xử lý lỗi mạng | Banner ONLINE/OFFLINE, timeout 5s, tự reconnect 2s, `try/catch` payload |

---

## 2. Cấu trúc dự án

```
app/src/
├── App.js                  (66 dòng)   – màn hình chính, CHỈ điều phối
├── components/
│   └── Tabs.js            (430 dòng)   – Header, TabBar + 4 tab + StyleSheet
├── hooks/
│   └── useParking.js      (166 dòng)   – hook gom logic MQTT realtime + REST + trạng thái
├── services/
│   ├── parkingMqtt.js     (201 dòng)   – kết nối MQTT WebSocket, subscribe/publish
│   └── api.js              (57 dòng)   – gọi REST API cho Backend
├── constants.js            (27 dòng)   – hằng số dùng chung
└── utils.js                (63 dòng)   – hàm tiện ích (format, tính phí)
```

> **Tổng: 1010 dòng** (trước đây 1 file 584 dòng → đã tách thành 7 file).

### 2.1 4 tầng kiến trúc

| Tầng | File | Trách nhiệm | Nguyên tắc |
|---|---|---|---|
| **View** | `components/Tabs.js` | Chỉ render, nhận `props`, gọi `props.onXxx()` | Không chứa logic nghiệp vụ, **không tự gọi mạng** |
| **Logic** | `hooks/useParking.js` | Kết nối MQTT, parse event, quản lý state, timeout, chống trùng `requestId` | Không biết mặt giao diện (view-agnostic) |
| **Service** | `parkingMqtt.js`, `api.js` | Giao tiếp mạng (MQTT / REST), lưu cấu hình | Trả về dữ liệu thuần, không phụ thuộc React |
| **Shared** | `constants.js`, `utils.js` | Hằng số & hàm thuần dùng chung | Không có side-effect, dễ test |

**Lợi ích cụ thể:**
- Đổi giao diện (thêm tab, đổi màu) **không** đụng logic
- Test logic MQTT không cần render UI
- `App.js` chỉ còn 66 dòng → dễ đọc khi GV hỏi

---

## 3. Source code — giải thích chi tiết

### 3.1 `App.js` — chỉ điều phối

```jsx
import React, { useState, useCallback } from 'react';
import { View, ScrollView, RefreshControl } from 'react-native';
import { useParking } from './hooks/useParking';
import { Header, TabBar, ParkingTab, HistoryTab, StatsTab, AccountTab, st } from './components/Tabs';

export default function App() {
  const [tab, setTab] = useState('parking');
  const [refreshing, setRefreshing] = useState(false);

  // Toan bo logic MQTT + REST + trang thai nam trong hook -> App.js gon nhe
  const p = useParking();

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([p.refreshRemote(), p.loadStats()]);
    setRefreshing(false);
  }, [p.refreshRemote, p.loadStats]);

  const freeCount = Object.values(p.slots).filter((s) => !s.occupied).length;

  return (
    <View style={st.root}>
      <Header online={p.online} gate={p.gate} freeCount={freeCount} myId={p.cfg.myId} />
      <TabBar tab={tab} onChange={setTab} />

      <ScrollView
        style={st.body}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {tab === 'parking' && (
          <ParkingTab
            slots={p.slots} gate={p.gate} cfg={p.cfg} log={p.log}
            pending={p.pending} mqttUrl={p.mqttUrl}
            onReserve={p.doReserve}
            onCancel={p.doCancel}
            onGate={p.doGate}
            onEnter={p.doEnter}
            onExit={p.doExit}
            onCfg={p.applyCfg}
          />
        )}

        {tab === 'history' && <HistoryTab receipts={p.receipts} bookings={p.bookings} />}
        {tab === 'stats' && <StatsTab stats={p.stats} onRefresh={p.loadStats} />}
        {tab === 'account' && (
          <AccountTab user={p.user} token={p.token} cfg={p.cfg}
            onLogin={p.login} onLogout={p.logout} onCfg={p.applyCfg} />
        )}

        <View style={{ height: 30 }} />
      </ScrollView>
    </View>
  );
}
```

**Phân tích:**

| Dòng | Ý nghĩa |
|---|---|
| `const p = useParking();` | **1 dòng** gom toàn bộ logic → App.js chỉ còn render |
| `Object.values(p.slots).filter((s) => !s.occupied).length` | Tính số ô trống → Header hiển thị "Trống: 5/6" |
| `onRefresh` | Kéo để làm mới → gọi **song song** REST (`Promise.all`) |
| `refreshing` | State của `RefreshControl` → hiện vòng xoay khi đang tải |
| `{tab === 'x' && <XTab .../>}` | Render có điều kiện — chỉ mount tab đang xem (tiết kiệm bộ nhớ) |
| `<View style={{ height: 30 }} />` | Padding đáy để nội dung không bị TabBar che |

**Quy tắc "dữ liệu đi xuống, hành động đi lên":**
- Xuống: `p.slots`, `p.gate`, `p.log`, `p.stats` → truyền qua `props`
- Lên: `onReserve`, `onCancel`, `onGate` → gọi qua `props`

### 3.2 `hooks/useParking.js` — logic trung tâm

```jsx
import { useEffect, useRef, useState, useCallback } from 'react';
import { Alert } from 'react-native';
import {
  connectParking, loadCfg, saveCfg, reserveSlot, cancelSlot, gateCmd,
  DEFAULT_CFG, resolveMqttUrl,
} from '../parkingMqtt';
import * as API from '../api';
import { BOOKING_TIMEOUT_MS } from '../constants';
import { formatNumber } from '../utils';

export function useParking() {
  const [cfg, setCfg] = useState({ ...DEFAULT_CFG });
  const [online, setOnline] = useState(false);
  const [slots, setSlots] = useState({});
  const [gate, setGate] = useState('CLOSED');
  const [log, setLog] = useState([]);
  const [pending, setPending] = useState({});
  const [stats, setStats] = useState(null);
  const [receipts, setReceipts] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [users, setUsers] = useState([]);
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);

  const client = useRef(null);
  const pendingRef = useRef({});
```

#### 3.2.1 Vì sao dùng `useRef` cho `pending`?

```jsx
  const client = useRef(null);      // giữ client MQTT qua các lần render
  const pendingRef = useRef({});     // giữ map requestId -> callback
```

| `useState` | `useRef` |
|---|---|
| Dữ liệu **hiển thị** → cần re-render | Giá trị **nội bộ** → không cần render |
| `slots`, `log`, `online`… | `client`, `pendingRef` |

> **Quan trọng:** `pendingRef` phải là `useRef` vì nếu dùng `useState`, mỗi lần setState sẽ tạo object mới → closure cũ trong callback MQTT giữ lại map rỗng → **không match được `requestId`** → timeout giả.

#### 3.2.2 Log realtime (giới hạn 40 dòng)

```jsx
  const pushLog = useCallback((m) => {
    setLog((l) => [`${new Date().toLocaleTimeString()} ${m}`, ...l].slice(0, 40));
  }, []);
```

| Kỹ thuật | Ý nghĩa |
|---|---|
| `setLog((l) => ...)` | Dùng **functional update** → luôn có `l` mới nhất, không bị stale closure |
| `[...newMsg, ...old]` | Tin mới lên **đầu** → dễ đọc |
| `.slice(0, 40)` | Giới hạn 40 dòng → không phình bộ nhớ với app chạy lâu |

#### 3.2.3 Tải dữ liệu REST song song

```jsx
  const refreshRemote = useCallback(async () => {
    try {
      const [s, r, b, u] = await Promise.all([
        API.getStatus().catch(() => null),
        API.getReceipts(50).catch(() => []),
        API.getBookings(50).catch(() => []),
        API.getUsers().catch(() => []),
      ]);
      if (s) setStats(s);
      setReceipts(r || []); setBookings(b || []); setUsers(u || []);
    } catch { /* backend chua chay -> bo qua */ }
  }, []);
```

| Kỹ thuật | Ý nghĩa |
|---|---|
| `Promise.all` | 4 request chạy **đồng thời** thay vì tuần tự (nhanh hơn ~4×) |
| `.catch(() => null)` **riêng từng promise** | Một endpoint lỗi **không** làm hỏng cả batch — `Promise.all` sẽ reject nếu 1 promise reject |
| `if (s) setStats(s)` | Chỉ set khi có dữ liệu → không ghi đè bằng `null` |
| `catch { }` rỗng | Backend chưa chạy → app vẫn dùng được (chỉ mất phần lịch sử) |

#### 3.2.4 Kết nối MQTT & xử lý event

```jsx
  const start = useCallback((c) => {
    try { client.current?.end(); } catch {}
    const cl = connectParking(c, (type, d) => {
      if (type === 'conn') {
        setOnline(d);
        pushLog(d ? 'Đã kết nối Broker' : 'Mất kết nối Broker');
        ...
```

**8 loại event MQTT:**

| `type` | Dữ liệu | Xử lý |
|---|---|---|
| `conn` | `boolean` | Banner ONLINE/OFFLINE |
| `status` | `{ id, occupied, reservedBy, currentUser }` | Cập nhật 1 ô |
| `snapshot` | `{ slots: [...], gate }` | Cập nhật **toàn bộ** bãi (App mới vào) |
| `bookingState` | `{ slot, state, user, requestId, ok, msg }` | Khớp `requestId` → báo thành công/thất bại |
| `gate` | `{ gate, openedBy }` | Cập nhật trạng thái cổng |
| `rfid` | `{ card, slot, event }` | Log "Quét thẻ ..." |
| `receipt` | `{ slot, user, minutes, fee }` | Popup hoá đơn |

#### 3.2.5 Timeout 5 giây cho đặt chỗ

```jsx
import { BOOKING_TIMEOUT_MS } from '../constants';
```

**Cơ chế:**

```
1. App bấm "Đặt chỗ"  → sinh requestId = "r-<timestamp>-<random>"
2. Lưu vào pendingRef.current[requestId] = { slot, t0 }
3. setPending(prev => ({...prev, [requestId]: true}))    → hiện spinner
4. publish booking/<ID>/set kèm requestId
5. setTimeout(BOOKING_TIMEOUT_MS = 5000):
     - nếu requestId VẪN còn trong pendingRef → không có phản hồi
     → Alert "Timeout – kiểm tra IP Broker"
     → xoá khỏi pending
6. Khi nhận bookingState có requestId khớp → xoá khỏi pendingRef, bật/tắt spinner
```

**Vì sao cần `requestId`?**

> Nếu không có, App không phân biệt được phản hồi của lệnh **vừa gửi** với phản hồi **đến trễ** của lệnh trước. Ví dụ: user bấm đặt P1 (mất mạng, timeout), rồi bấm đặt P2 → phản hồi của P1 đến muộn → App tưởng P2 thành công. **Chống trùng bằng `requestId` là bắt buộc.**

### 3.3 `parkingMqtt.js` — service MQTT

#### 3.3.1 Cấu hình mặc định

```javascript
export const DEFAULT_CFG = {
  base: '',                 // VD: https://smart-parking-ltdd2.onrender.com  (rỗng = cùng host)
  myId: 'SV01',
  mode: 'bridge',           // 'bridge' = ws(s)://host/mqtt  |  'broker' = ws://broker:9001
  brokerWs: '',             // chỉ dùng khi mode = 'broker'
  brokerUser: 'app',        // user/password broker (ACL phân quyền)
  brokerPass: 'app123',
  brokerTls: false,         // true = dùng wss:// (ma hoa SSL/TLS) thay vì ws://
  rejectUnauthorized: true, // xác thực chứng thư CA của broker
};
```

#### 3.3.2 Suy ra URL từ 1 Base URL

```javascript
export function resolveMqttUrl(cfg) {
  if (cfg.mode === 'broker' && cfg.brokerWs) {
    let u = cfg.brokerWs.trim();
    // Bật TLS -> ép scheme wss:// (giữ nguyên host:port)
    if (cfg.brokerTls && u.startsWith('ws://')) u = 'wss://' + u.slice(5);
    if (cfg.brokerTls && u.startsWith('http://')) u = 'wss://' + u.slice(7);
    return u;
  }
  const base = (cfg.base || '').trim().replace(/\/$/, '');
  if (!base) return '';
  const u = base.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
  return `${u}/mqtt`;
}
```

**Điểm nhấn kỹ thuật:**

> 🔑 **Trong App chỉ cần nhập 1 dòng** `https://smart-parking-ltdd2.onrender.com` → App tự suy ra:
> - REST API: `https://.../api/...`
> - MQTT-WS: `wss://.../mqtt`
>
> Người dùng không phải biết 2 địa chỉ khác nhau, cũng không sửa scheme tay.

| Input | → REST | → MQTT |
|---|---|---|
| `https://server.com` | `https://server.com/api/...` | `wss://server.com/mqtt` |
| `http://192.168.1.5:3000` | `http://192.168.1.5:3000/api/...` | `ws://192.168.1.5:3000/mqtt` |

#### 3.3.3 Parse URL thủ công (fix bug "Could not determine host")

```javascript
export function parseWsUrl(rawUrl) {
  const u = String(rawUrl || '').trim();
  const m = /^([a-zA-Z][a-zA-Z0-9+.-]*):\/\/([^/?#]*)([^?#]*)(\?[^#]*)?/.exec(u);
  if (!m) return null;
  const [, scheme, authority, path = '/', search = ''] = m;
  // authority co thể chua user:pass@host:port
  let hostPart = authority;
  const at = hostPart.lastIndexOf('@');
  let auth = '';
  if (at >= 0) {
    auth = hostPart.slice(0, at);
    hostPart = hostPart.slice(at + 1);
  }
  // IPv6 [::1]:8081
  let hostname = hostPart;
  let port = '';
  if (hostPart.startsWith('[')) {
    const close = hostPart.indexOf(']');
    hostname = hostPart.slice(1, close);
    const rest = hostPart.slice(close + 1);
    if (rest.startsWith(':')) port = rest.slice(1);
  } else {
    const colon = hostPart.lastIndexOf(':');
    if (colon >= 0) {
      hostname = hostPart.slice(0, colon);
      port = hostPort.slice(colon + 1);
    }
  }
  if (!hostname) return null;
  const defaultPort = scheme === 'wss' || scheme === 'https' ? 443 : 80;
  return {
    protocol: scheme,
    hostname,
    port: port ? Number(port) : defaultPort,
    path: (path || '/') + (search || ''),
    auth,
  };
}
```

**Vì sao phải tự parse?**

> **Nguyên nhân gốc:** `mqtt` v5 gọi `require('url').parse(url, true)` để tách `hostname`/`port`/`path`.
> Trên React Native, module `url` được Metro map về `react-native/Libraries/Blob/URL.js` — một WHATWG `URL` class **không có static `.parse()`** (đó là API Node legacy).
> → `parsedUrl` = `undefined` → `mqtt` fallback sang `document.URL` (React Native **không có DOM**) → throw:
> **"Could not determine host. Specify host manually."**
>
> **Giải pháp:** tự tách URL bằng **regex** (không phụ thuộc module nào), rồi truyền **object** `{ protocol, hostname, port, path }` vào `mqtt.connect()`.
> Khi truyền **OBJECT**, `mqtt` bỏ hoàn toàn nhánh parse URL string.

#### 3.3.4 Fix triệt để: truyền MỘT object duy nhất

```javascript
// NGUYÊN NHÂN THẬT (mqtt v5, build/lib/connect/index.js):
//   function connect(brokerUrl, opts) {
//     if (typeof brokerUrl === 'object' && !opts) {   // <-- CHỈ khi KHÔNG có opts
//       opts = brokerUrl;
//       brokerUrl = '';
//     }
//     ...
//     if (brokerUrl && typeof brokerUrl === 'string') {
//       const parsedUrl = url.parse(brokerUrl, true);  // nhánh parse URL string
//       parsedOptions.host = parsedUrl.hostname;
//       ...
//     }
//   }
//
// => Nếu gọi mqtt.connect(target, opts) với HAI tham số:
//    - '!opts' = false  => KHÔNG gán opts = target => object target bị BỎ QUA
//    - opts (của ta) không có hostname
//    => mqtt fallback sang document.URL (RN không có DOM)
//    => throw "Could not determine host. Specify host manually."
//
// => CHỈ khi truyền MỘT object duy nhất (mqtt.connect(target)) thì mqtt mới
//    lấy hostname/port/path từ target.
```

**Fix cuối cùng:**

```javascript
// gop TOAN BO opts + URL đã parse vào MỘT object, truyền mqtt.connect(target)
// - thêm cả 'host' (mqtt fallback opts.host) và 'wsOptions' cho TLS
// - bỏ tham số thứ hai khỏi mqtt.connect()
client.connect(target);
```

> ⚠️ **Bài học:** khi thư viện có API nhận 2 tham số, việc truyền `undefined`/`null` cho tham số thứ 2 **không giống** việc không truyền. `!opts` phân biệt `undefined` (truthy check → `!undefined = true`) — nhưng nếu truyền object rỗng `{}` thì `!{} = false` → lại rơi vào nhánh sai. Phải truyền **đúng 1 argument**.

### 3.4 `api.js` — service REST

Gọi REST API của Backend:

| Hàm | Endpoint | Dùng ở |
|---|---|---|
| `getStatus()` | `GET /api/status` | Tab Thống kê |
| `getStats()` | `GET /api/stats` | Tab Thống kê (doanh thu 7 ngày, theo giờ, top user) |
| `getReceipts(50)` | `GET /api/receipts?limit=50` | Tab Lịch sử |
| `getBookings(50)` | `GET /api/bookings?limit=50` | Tab Lịch sử |
| `getUsers()` | `GET /api/users` | Tab Tài khoản |
| `login()` | `POST /api/auth/login` | Tab Tài khoản |
| `register()` | `POST /api/auth/register` | Tab Tài khoản |
| `topup()` | `POST /api/wallet/topup` | Tab Tài khoản |

**Token:** sau khi đăng nhập, JWT được lưu vào `AsyncStorage` → gắn vào header `Authorization: Bearer <token>` cho các request sau.

### 3.5 `components/Tabs.js` — view

Chứa 5 component export:

| Component | Nhiệm vụ |
|---|---|
| `Header` | Tiêu đề + banner ONLINE/OFFLINE + số ô trống + trạng thái cổng |
| `TabBar` | 4 nút tab |
| `ParkingTab` | Lưới 6 ô + nút thao tác + log realtime + cài đặt kết nối |
| `HistoryTab` | KPI + 2 bảng (hoá đơn, lịch sử đặt chỗ) |
| `StatsTab` | 4 KPI + 3 biểu đồ |
| `AccountTab` | Đăng ký / đăng nhập / thông tin / đăng xuất / cài đặt |

**Nguyên tắc của View:**

```jsx
// Tabs.js chỉ nhận props và gọi props.onXxx().
// KHÔNG import mqtt, KHÔNG gọi fetch, KHÔNG chứa state nghiệp vụ.
```

**Màu sắc ô đỗ:**

| Trạng thái | Màu | Ý nghĩa |
|---|---|---|
| Trống | 🟢 xanh | Có thể đặt |
| Có xe | 🔴 đỏ | Đang có xe thật |
| Bạn đặt | 🟡 vàng | Chờ xe vào |
| Đã đặt (người khác) | 🟠 cam | Người khác giữ chỗ |

**Biểu đồ vẽ bằng `View` (không cần thư viện):**
- Biểu đồ cột (doanh thu 7 ngày): mỗi cột = 1 `<View>` với `height` theo % → co giãn theo màn hình
- Biểu đồ đường: `<View>` với `transform: [{ rotate }]` cho từng đoạn
- Biểu đồ tròn (top user): dùng `borderWidth` + `borderColor` tạo vòng cung

### 3.6 `constants.js` & `utils.js`

**`constants.js`** — hằng số dùng chung:
```javascript
export const BOOKING_TIMEOUT_MS = 5000;   // timeout đặt chỗ
export const MAX_LOG = 40;               // số dòng log realtime
// màu, kích thước, tên topic...
```

**`utils.js`** — hàm thuần:
```javascript
export function formatNumber(n) { ... }   // 12345 → "12,345"
export function calcFee(minutes) { ... }   // 95 → 6000
```

> Vì là **hàm thuần** (cùng input → cùng output, không side-effect) → dễ unit test, dễ tái sử dụng.

---

## 4. 4 tab giao diện

### 4.1 🅿️ Bãi (tab chính)

| Thành phần | Mô tả |
|---|---|
| Lưới 6 ô | Màu theo trạng thái, nhấn giữ để mở menu ô |
| Nút thao tác mỗi ô | Đặt · Huỷ · Vào · Ra |
| Điều khiển barrier | Mở / đóng |
| Nhật ký realtime | 40 dòng, timestamp |
| Cài đặt kết nối | Backend URL, broker URL, user/pass, TLS, mã SV |

### 4.2 🧾 Lịch sử

| KPI | Bảng |
|---|---|
| Tổng phí | Hoá đơn (ô, user, phút, phí, giờ) |
| Lượt xe | Lịch sử đặt chỗ (có tag ✅ OK / ❌ LỖI) |

### 4.3 📊 Thống kê

| KPI | Biểu đồ |
|---|---|
| Doanh thu 7 ngày | Cột (7 ngày) |
| Doanh thu theo giờ | Đường (24 mốc) |
| Top người dùng | Tròn |

> Tất cả vẽ bằng `View` — **không cần `react-native-chart-kit`** → app nhẹ hơn, không có dependency native.

### 4.4 👤 Tài khoản

- Đăng ký / đăng nhập (JWT)
- Xem thông tin tài khoản + số dư ví
- Nạp tiền ví
- Lịch sử cá nhân
- Đăng xuất

---

## 5. Cách chạy trên điện thoại

### 5.1 Yêu cầu

| Thứ | Yêu cầu |
|---|---|
| Node.js | 18+ |
| Expo Go | Cài trên điện thoại (Android / iOS) |
| Mạng | Điện thoại + máy tính **cùng WiFi** (nếu chạy local) |

### 5.2 Chạy Metro

```powershell
cd app
npm install
npx expo start
```

**Hiện QR trong terminal:**

```
  ╭──────────────────────────────────────────╮
  │                                          │
  │   Metro waiting on exp://192.168.1.100:8081  │
  │                                          │
  ╰──────────────────────────────────────────╯
```

### 5.3 Mở app trên điện thoại

| Cách | Hướng dẫn |
|---|---|
| **Expo Go** (khuyến nghị) | Cài Expo Go → quét QR → mở |
| **Dev Client** | `npx expo start --dev-client` (build sẵn app) |

### 5.4 Cấu hình kết nối trong app

Tab **⚙️ Cài đặt kết nối** (nằm trong tab Bãi):

**Chế độ 🌐 Qua Backend (khuyến nghị — không cần cùng mạng):**
```
Backend URL: https://smart-parking-ltdd2.onrender.com
```

**Chế độ 🔌 Broker trực tiếp (cần cùng WiFi):**
```
Broker:      ws://192.168.1.100:9001/mqtt
User/Pass:   app / app123
TLS:         tắt (hoặc bật nếu broker có TLS → wss://...:9002/mqtt)
Mã SV:       SV01
```

### 5.5 Demo 2 điện thoại (kịch bản trình bày)

```
1. Điện thoại A: mã SV01, điện thoại B: mã SV02
2. Cả 2 đặt chỗ ô P3
   → A: "Đặt thành công, giữ cho 5 phút"
   → B: "Ô đã được đặt bởi SV01"
3. Mở Web Dashboard tab Thống kê → thấy doanh thu tăng
```

### 5.6 Lưu ý về `npx expo start --lan`

| Chế độ | Khi nào dùng |
|---|---|
| `--lan` | Điện thoại cùng WiFi (khuyến nghị) |
| `--tunnel` | Qua mạng công cộng (chậm hơn, cần Internet) |
| (mặc định) | Tự động dò, đôi khi chọn sai interface → bấm `s` để đổi |

---

## 6. Kiểm thử

### 6.1 Kiểm tra syntax trong CI

Job `app-syntax` của `.github/workflows/ci.yml` kiểm tra **7 file JSX** app → phát hiện lỗi cú pháp **trước khi merge**.

### 6.2 Kiểm thử tích hợp

```powershell
# Bộ test E2E đầy đủ — bao gồm kiểm tra bridge App → Broker → App
python simulator/test_suite.py
# KET QUA: 39/39 PASS
```

**Checkpoint liên quan Lab 3:**

| Checkpoint | Nội dung |
|---|---|
| Bridge WS 2 chiều | App → Broker → App, đúng `requestId` |
| Chống trùng | SV02 đặt trùng SV01 → `ok:false` |
| Tính phí | 95 phút → 6000đ, ≤30 phút → 0đ |
| Xác thực | Đăng ký/đăng nhập · nạp tiền · sai mật khẩu → 401 |

### 6.3 Checklist thủ công

| # | Kiểm tra | Mong đợi |
|---|---|---|
| 1 | Mở app | Banner **ONLINE** (xanh), số ô trống đúng |
| 2 | Bấm nút IR ở Wokwi | Ô đổi màu **ngay** (không cần refresh) |
| 3 | Đặt chỗ ô trống | "Đặt thành công", ô chuyển màu **vàng** |
| 4 | Đặt chỗ ô đã có người | "Ô đã được đặt bởi SV01" |
| 5 | Tắt broker rồi đặt chỗ | Sau **5 giây** popup Timeout |
| 6 | Bật lại broker | Tự reconnect trong **2 giây**, banner ONLINE |
| 7 | Mở tab Thống kê | 4 KPI + 3 biểu đồ vẽ đúng |
| 8 | Kéo màn hình xuống | Refresh dữ liệu REST |

---

## 7. Bug đã tìm & sửa

| # | Lỗi | Nguyên nhân | Sửa |
|---|---|---|---|
| 1 | `Could not determine host. Specify host manually.` | `mqtt` gọi `url.parse()` — RN không có static `.parse()` | Tự parse URL bằng regex, truyền **object** |
| 2 | *(vẫn lỗi sau fix #1)* | `mqtt.connect(target, opts)` — 2 tham số → `opts` bị **bỏ qua**, target cũng bị bỏ qua | Truyền **MỘT** object duy nhất |
| 3 | `Cannot read property 'decode' of undefined` | `react-native-url-polyfill` thay global `URL` bằng bản không parse được `file://` | **Bỏ** polyfill — Hermes RN 0.88 đã có WHATWG URL chuẩn |
| 4 | `StyleSheet is not defined` | Thiếu import `StyleSheet` | Thêm import + fallback `Intl` cho RN 0.88 |
| 5 | App không chạy được trên Expo Go iOS | SDK cũ | Nâng lên **Expo SDK 58** |

> **Bài học chung:** với thư viện có API nhận nhiều tham số, hãy **đọc source** để hiểu chính xác điều kiện phân nhánh. Sửa "đại" (thêm tham số thứ 3) là sai hướng; sửa đúng là hiểu logic bên trong.

---

## 8. Xử lý lỗi thường gặp

| Triệu chứng | Nguyên nhân | Cách sửa |
|---|---|---|
| "Could not determine host" | Truyền 2 tham số cho `mqtt.connect` | Truyền 1 object duy nhất |
| "Cannot read property 'decode' of undefined" | Còn `react-native-url-polyfill` | Xoá import polyfill |
| Banner luôn OFFLINE | Sai URL / không có mạng | Kiểm tra Backend URL, ping thử |
| MQTT không kết nối tới broker cloud | Broker không bật WebSocket | Dùng chế độ **Qua Backend** (bridge) |
| Timeout 5s khi đặt chỗ | Broker chậm / sai topic | Kiểm tra log broker có `PUBLISH` không |
| Vòng xoay không tắt | `requestId` không khớp | Kiểm tra `requestId` giống nhau giữa gửi & nhận |
| App trắng màn hình | Lỗi JS | Xem log Metro (Terminal) |
| Metro không tìm thấy điện thoại | Khác mạng / firewall | Dùng `--tunnel` hoặc `--lan` |
| Chart không hiện | Dữ liệu rỗng | Kéo để refresh, kiểm tra backend |

---

## PHỤ LỤC — File liên quan

| File | Vai trò |
|---|---|
| `app/src/App.js` | Điều phối (66 dòng) |
| `app/src/components/Tabs.js` | Toàn bộ view (430 dòng) |
| `app/src/hooks/useParking.js` | Logic (166 dòng) |
| `app/src/parkingMqtt.js` | Service MQTT (201 dòng) |
| `app/src/api.js` | Service REST (57 dòng) |
| `app/src/constants.js` | Hằng số (27 dòng) |
| `app/src/utils.js` | Hàm thuần (63 dòng) |
| `app/package.json` | Dependencies (Expo SDK 58, mqtt, AsyncStorage) |
| `app/app.json` | Cấu hình Expo |

---

> **Tài liệu Lab 3 — Smart Parking LTDD2** · cập nhật 23/11/2026
> Repo: https://github.com/Phong220205/smart-parking-ltdd2
