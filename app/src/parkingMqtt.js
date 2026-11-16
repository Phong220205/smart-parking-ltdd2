import 'react-native-url-polyfill/auto';
import mqtt from 'mqtt';
import AsyncStorage from '@react-native-async-storage/async-storage';

const DEFAULT_CFG = { host: 'ws://192.168.1.10:9001', user: 'app', pass: 'app123', myId: 'SV01' };

export async function loadCfg() {
  try {
    const s = await AsyncStorage.getItem('parking_cfg');
    return s ? { ...DEFAULT_CFG, ...JSON.parse(s) } : DEFAULT_CFG;
  } catch { return DEFAULT_CFG; }
}
export async function saveCfg(c) { await AsyncStorage.setItem('parking_cfg', JSON.stringify(c)); }

// Kết nối MQTT WebSocket + tự reconnect, subscribe đầy đủ topic.
// onEvent(type, data): status | snapshot | bookingState | gate | rfid | receipt | conn
export function connectParking(cfg, onEvent) {
  const client = mqtt.connect(cfg.host, {
    username: cfg.user, password: cfg.pass,
    reconnectPeriod: 2000, connectTimeout: 5000,
    clientId: 'app-' + cfg.myId + '-' + Math.random().toString(16).slice(2, 6),
  });
  client.on('connect', () => {
    onEvent('conn', true);
    client.subscribe([
      'parking/slot/+/status', 'parking/slots/snapshot', 'parking/booking/+/state',
      'parking/gate/barrier/state', 'parking/gate/rfid', 'parking/billing/receipt',
      'parking/system/heartbeat', 'parking/system/status',
    ], { qos: 1 });  });
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
