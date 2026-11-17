// KHONG dung 'react-native-url-polyfill/auto' o day.
//   Hermes (RN 0.88) da co san global URL chuan WHATWG, hop le ca voi scheme
//   file:// cua Expo. Polyfill whatwg-url (v2.0.0) thay the global URL bang
//   ban khong parse duoc file:// -> Expo that bai "Cannot read property
//   'decode' of undefined" va "Could not determine host".
//   MQTT/WebSocket o RN khong can polyfill URL (ws:// duoc xu ly boi module
//   net/tls native cua RN).
import mqtt from 'mqtt';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ============================================================================
//  CẤU HÌNH KẾT NỐI
//  ---------------------------------------------------------------------------
//  Chỉ cần nhập 1 địa chỉ server (Base URL). App tự suy ra:
//    - REST API : <base>/api/...
//    - MQTT WS  : ws(s)://<host>/mqtt   (MQTT over WebSocket qua bridge của Backend)
//
//  Vì sao dùng bridge thay vì nối thẳng broker?
//    App React Native chỉ nối được MQTT qua WebSocket (ws/wss).
//    Broker public test.mosquitto.org mở 1883 + 443 nhưng KHÔNG bật WebSocket 8084.
//    Bridge trong Backend giải quyết đúng vấn đề này: App chỉ cần 1 URL HTTPS.
// ============================================================================

export const DEFAULT_CFG = {
  base: '',                 // VD: https://smart-parking-ltdd2.onrender.com  (rỗng = cùng host)
  myId: 'SV01',
  mode: 'bridge',           // 'bridge' = ws(s)://host/mqtt  |  'broker' = ws://broker:9001
  brokerWs: '',             // chỉ dùng khi mode = 'broker'
  brokerUser: 'app',        // user/password broker (ACL phân quyền)
  brokerPass: 'app123',
  brokerTls: false,         // true = dùng wss:// (ma hoá SSL/TLS) thay vì ws://
  rejectUnauthorized: true, // xác thực chứng thư CA của broker
};

// Suy ra địa chỉ MQTT WebSocket từ cấu hình
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

// Suy ra địa chỉ REST từ cấu hình
export function resolveApiBase(cfg) {
  return (cfg.base || '').trim().replace(/\/$/, '');
}

/**
 * Tách URL WebSocket thành object cho mqtt.connect().
 *
 * LY DO: mqtt v5 goi require('url').parse(url, true) de tach hostname/port/path.
 * Tren React Native, module 'url' duoc Metro map ve
 * react-native/Libraries/Blob/URL.js - mot WHATWG URL class KHONG co static
 * .parse() (do la API Node legacy). => parsedUrl undefined =>
 * "Could not determine host. Specify host manually."
 *
 * Giai phap: tu tach URL bang regex (khong phu thuoc module nao), roi truyền
 * object { protocol, hostname, port, path } vao mqtt.connect().
 * Khi truyen OBJECT, mqtt bo qua hoan toan nhanh parse URL string
 * (xem mqtt/build/lib/connect/index.js: "if (typeof brokerUrl === 'object')").
 */
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
      port = hostPart.slice(colon + 1);
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

export async function loadCfg() {
  try {
    const s = await AsyncStorage.getItem('parking_cfg');
    return s ? { ...DEFAULT_CFG, ...JSON.parse(s) } : { ...DEFAULT_CFG };
  } catch { return { ...DEFAULT_CFG }; }
}
export async function saveCfg(c) { await AsyncStorage.setItem('parking_cfg', JSON.stringify(c)); }

// Kết nối MQTT WebSocket + tự reconnect, subscribe đầy đủ topic.
// onEvent(type, data): status | snapshot | bookingState | gate | rfid | receipt | conn
export function connectParking(cfg, onEvent) {
  const url = resolveMqttUrl(cfg);
  // Khi noi thang toi broker: can user/pass theo ACL + tuy chon TLS
  const direct = cfg.mode === 'broker' && !!cfg.brokerWs;
  const opts = {
    reconnectPeriod: 2000, connectTimeout: 8000,
    clientId: 'app-' + cfg.myId + '-' + Math.random().toString(16).slice(2, 6),
    protocolVersion: 4,
  };
  // [LAB2 - Bảo mật & phân quyền]
  // Backend của đồ án đã nhúng broker MQTT CÓ xác thực user/password.
  // Vì vậy, kể cả khi App nối qua đường dẫn /mqtt của backend, App cũng
  // phải gửi kèm tài khoản "app" (quyền CHỈ ĐỌC + gửi lệnh điều khiển).
  if (direct || cfg.brokerUser) {
    opts.username = cfg.brokerUser || undefined;
    opts.password = cfg.brokerPass || undefined;
  }
  if (direct) {
    if (cfg.brokerTls) {
      opts.rejectUnauthorized = cfg.rejectUnauthorized !== false;
    }
  }
  // Parse URL thu cong va truyenn OBJECT vao mqtt.connect().
  // Ly do: xem parseWsUrl() - module 'url' cua RN khong co static .parse()
  // ma mqtt v5 phai dung de tach hostname/port/path tu URL string.
  const parsed = parseWsUrl(url);
  const target = parsed
    ? { protocol: parsed.protocol, hostname: parsed.hostname, port: parsed.port, path: parsed.path }
    : url;

  const client = mqtt.connect(target, opts);
  client.on('connect', () => {
    onEvent('conn', true);
    client.subscribe([
      'parking/slot/+/status', 'parking/slots/snapshot', 'parking/booking/+/state',
      'parking/gate/barrier/state', 'parking/gate/rfid', 'parking/billing/receipt',
      'parking/system/heartbeat', 'parking/system/status',
    ], { qos: 1 });
  });
  client.on('reconnect', () => onEvent('conn', false));
  client.on('close', () => onEvent('conn', false));
  client.on('error', () => onEvent('conn', false));
  client.on('message', (topic, buf) => {
    try {
      const d = JSON.parse(buf.toString());
      if (topic.startsWith('parking/slot/')) onEvent('status', d);
      else if (topic === 'parking/slots/snapshot') onEvent('snapshot', d);
      else if (topic.includes('/booking/')) onEvent('bookingState', { topic, ...d });
      else if (topic === 'parking/gate/barrier/state') onEvent('gate', d);
      else if (topic === 'parking/gate/rfid') onEvent('rfid', d);
      else if (topic === 'parking/billing/receipt') onEvent('receipt', d);
      else if (topic.startsWith('parking/system/')) onEvent('sys', { topic, ...d });
    } catch (e) { /* bỏ payload rác, ăn điểm xử lý lỗi */ }
  });
  return client;
}

export function reserveSlot(client, slot, user) {
  const requestId = Date.now().toString(36) + Math.random().toString(16).slice(2, 6);
  client.publish(`parking/booking/${slot}/set`, JSON.stringify({ slot, user, action: 'reserve', requestId }), { qos: 1 });
  return requestId;
}
export function cancelSlot(client, slot, user) {
  const requestId = Date.now().toString(36) + Math.random().toString(16).slice(2, 6);
  client.publish(`parking/booking/${slot}/set`, JSON.stringify({ slot, user, action: 'cancel', requestId }), { qos: 1 });
  return requestId;
}
export function gateCmd(client, cmd, by) {
  const requestId = Date.now().toString(36) + Math.random().toString(16).slice(2, 6);
  client.publish('parking/gate/barrier/cmd', JSON.stringify({ cmd, by, requestId }), { qos: 1 });
  return requestId;
}
