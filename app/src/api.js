// ============================================================================
//  API REST - App React Native <-> Backend Smart Parking
//  Backend chạy máy bản (Node) hoặc Render cloud. App gọi REST để:
//    - thống kê doanh thu, lịch sử hóa đơn
//    - đăng ký / đăng nhập tài khoản
//  MQTT realtime đi qua bridge WebSocket của Backend (xem parkingMqtt.js)
// ============================================================================

import { resolveApiBase } from './parkingMqtt';

// Được App.js set sau khi nạp cấu hình (base URL của Backend cloud/local)
let CURRENT_BASE = '';

export function setApiBase(base) { CURRENT_BASE = (base || '').replace(/\/$/, ''); }
export function apiBase() { return CURRENT_BASE; }

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

// --------------------------- Trạng thái / thống kê --------------------------
export const getStatus   = () => req('/api/status');
export const getStats    = () => req('/api/stats');
export const getReceipts = (limit = 50) => req(`/api/receipts?limit=${limit}`);
export const getBookings = (limit = 50) => req(`/api/bookings?limit=${limit}`);
export const getUsers    = () => req('/api/users');
export const getBridge   = () => req('/api/bridge');

// --------------------------- Hành động --------------------------------------
export const postBooking = (slot, user, action) =>
  req('/api/booking', { method: 'POST', body: { slot, user, action, requestId: newRequestId() } });
export const postGate = (cmd, by) =>
  req('/api/gate', { method: 'POST', body: { cmd, by, requestId: newRequestId() } });
export const postEnter = (slot, user) =>
  req('/api/enter', { method: 'POST', body: { slot, user, requestId: newRequestId() } });
export const postExit = (slot, user) =>
  req('/api/exit', { method: 'POST', body: { slot, user, requestId: newRequestId() } });

// --------------------------- Tài khoản --------------------------------------
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
