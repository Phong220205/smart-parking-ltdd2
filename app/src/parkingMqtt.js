import 'react-native-url-polyfill/auto';
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
};

// Suy ra địa chỉ MQTT WebSocket từ cấu hình
export function resolveMqttUrl(cfg) {
  if (cfg.mode === 'broker' && cfg.brokerWs) return cfg.brokerWs.trim();
  const base = (cfg.base || '').trim().replace(/\/$/, '');
  if (!base) return '';
  const u = base.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
  return `${u}/mqtt`;
}

// Suy ra địa chỉ REST từ cấu hình
export function resolveApiBase(cfg) {
  return (cfg.base || '').trim().replace(/\/$/, '');
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
  const client = mqtt.connect(url, {
    username: undefined, password: undefined,
    reconnectPeriod: 2000, connectTimeout: 8000,
    clientId: 'app-' + cfg.myId + '-' + Math.random().toString(16).slice(2, 6),
    protocolVersion: 4,
  });
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
