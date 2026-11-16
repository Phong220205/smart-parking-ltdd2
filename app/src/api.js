// ============================================================================
//  API REST - App React Native <-> Backend Smart Parking
//  Backend chay may ban (Node) hoac Render cloud. App goi REST de:
//    - thong ke doanh thu, lich su hoa don
//    - dang ky / dang nhap tai khoan
//  MQTT van la kenh realtime chinh (xem parkingMqtt.js)
// ============================================================================

const DEFAULT_API = '';   // rong = dung cung host voi backend

export function apiBase() {
  return (global.__PARKING_API__ || DEFAULT_API).replace(/\/$/, '');
}

async function req(path, opts = {}) {
  const base = apiBase();
  const res = await fetch(base + path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { ok: false, error: text }; }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// --------------------------- Trang thai / thong ke --------------------------
export const getStatus  = () => req('/api/status');
export const getStats   = () => req('/api/stats');
export const getReceipts = (limit = 50) => req(`/api/receipts?limit=${limit}`);
export const getBookings = (limit = 50) => req(`/api/bookings?limit=${limit}`);
export const getUsers   = () => req('/api/users');

// --------------------------- Hanh dong --------------------------------------
export const postBooking = (slot, user, action) =>
  req('/api/booking', { method: 'POST', body: { slot, user, action, requestId: newRequestId() } });
export const postGate = (cmd, by) =>
  req('/api/gate', { method: 'POST', body: { cmd, by, requestId: newRequestId() } });
export const postEnter = (slot, user) =>
  req('/api/enter', { method: 'POST', body: { slot, user, requestId: newRequestId() } });
export const postExit = (slot, user) =>
  req('/api/exit', { method: 'POST', body: { slot, user, requestId: newRequestId() } });

// --------------------------- Tai khoan --------------------------------------
export const register = (username, password, name, plate) =>
  req('/api/auth/register', { method: 'POST', body: { username, password, name, plate } });
export const login = (username, password) =>
  req('/api/auth/login', { method: 'POST', body: { username, password } });
export const getMe = (token) =>
  req('/api/auth/me', { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } });
export const topUpBalance = (token, amount) =>
  req('/api/balance', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: { amount },
  });

export function newRequestId() {
  return Date.now().toString(36) + Math.random().toString(16).slice(2, 6);
}
