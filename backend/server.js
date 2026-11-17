// ============================================================================
//  BACKEND - SMART PARKING (Server trung gian)
//  Vai tro: lau cai MQTT -> REST API + Web Dashboard + App, luu du lieu
//
//  Nhanh:
//    - Nhan MQTT tu ESP32 / simulator (realtime trang thai bai)
//    - Luu lich su: booking, hoa don (receipt), the RFID, su kien
//    - REST API cho App React Native va Web Dashboard
//    - SSE (Server-Sent Events) day du lieu realtime cho Dashboard
//    - Bao dam chong trung dat cho: moi yeu cau co requestId, tra ve
//      trang thai khop requestId
// ============================================================================

import express from "express";
import mqtt from "mqtt";
import cors from "cors";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import http from "http";
import { fileURLToPath } from "url";
import { createMqttWsBridge } from "./mqttWsBridge.js";
import { createAuthBroker } from "./mqttAuthBroker.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(rateLimit);

// Request logger gọn (bỏ qua /api/health và /api/stream để khỏi nhiễu)
app.use((req, res, next) => {
  if (req.path === "/api/health" || req.path === "/api/stream") return next();
  const t0 = Date.now();
  res.on("finish", () => {
    console.log(`[HTTP] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${Date.now() - t0}ms)`);
  });
  next();
});

const MQTT_URL  = process.env.MQTT_URL  || "mqtt://localhost:1883";
const MQTT_HOST_FOR_INFO = (() => {
  try { return new URL(MQTT_URL).hostname; } catch { return "localhost"; }
})();
const MQTT_USER = process.env.MQTT_USER === undefined ? "esp32" : process.env.MQTT_USER;
const MQTT_PASS = process.env.MQTT_PASS === undefined ? "esp32123" : process.env.MQTT_PASS;
const PORT      = process.env.PORT      || 3000;
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, "..", "data", "parking.json");
const SECRET    = process.env.JWT_SECRET || "smart-parking-ltdd2-secret";
const ADMIN_PW  = process.env.ADMIN_PASS || "admin123";

// ============================ LUU DU LIEU ===================================
// Luu JSON de khong can cai database - de submit, de chay tren Render free
const db = {
  slots: {},              // P1..P6 -> trang thai hien tai
  bookings: [],           // lich su dat cho
  receipts: [],           // lich su hoa don (tinh phi)
  rfidLog: [],            // lich su quet the
  users: [],              // tai khoan dang ky
  events: [],             // log su kien chung
  counters: { revenue: 0, totalBookings: 0, totalSessions: 0 },
};

function ensureDir(p) {
  const d = path.dirname(p);
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}
function loadDb() {
  ensureDir(DATA_FILE);
  if (fs.existsSync(DATA_FILE)) {
    try {
      const raw = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
      Object.assign(db, raw);
      for (let i = 1; i <= 6; i++) {
        if (!db.slots["P" + i]) {
          db.slots["P" + i] = { id: "P" + i, occupied: false, reservedBy: null, currentUser: null, updatedAt: Date.now() };
        }
      }
      console.log("[DB] Da tai du lieu tu", DATA_FILE);
    } catch (e) {
      console.error("[DB] Loi doc file, tao moi:", e.message);
    }
  }
  for (let i = 1; i <= 6; i++) {
    if (!db.slots["P" + i]) {
      db.slots["P" + i] = { id: "P" + i, occupied: false, reservedBy: null, currentUser: null, updatedAt: Date.now() };
    }
  }
}
let saveTimer = null;
function saveDb() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      ensureDir(DATA_FILE);
      fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
    } catch (e) { console.error("[DB] Loi ghi:", e.message); }
  }, 400);
}
loadDb();

// ============================ TIEN ICH ======================================
const now = () => Date.now();

// ---- Rate limiter don gian (sliding window theo IP) ----
const RATE_LIMIT = { windowMs: 60_000, max: 120 };
const rateBuckets = new Map();
function rateLimit(req, res, next) {
  const ip = req.ip || req.socket?.remoteAddress || "unknown";
  const t = now();
  let b = rateBuckets.get(ip);
  if (!b || t - b.start > RATE_LIMIT.windowMs) {
    b = { start: t, count: 0 };
    rateBuckets.set(ip, b);
  }
  b.count += 1;
  if (b.count > RATE_LIMIT.max) {
    res.set("Retry-After", String(Math.ceil(RATE_LIMIT.windowMs / 1000)));
    return res.status(429).json({ ok: false, error: "Qua gioi han truy cap, thu lai sau" });
  }
  next();
}
// Dọn rác bucket định kỳ để không rò rỉ bộ nhớ
setInterval(() => {
  const t = now();
  for (const [ip, b] of rateBuckets) if (t - b.start > RATE_LIMIT.windowMs * 4) rateBuckets.delete(ip);
}, 120_000).unref?.();

// ---- Validate input ----
function cleanStr(v, max = 64) {
  return String(v ?? "").replace(/[<>]/g, "").trim().slice(0, max);
}
function isValidSlot(s) { return /^P[1-6]$/.test(String(s || "").toUpperCase()); }

function pushLog(arr, item, max = 500) {
  arr.unshift({ ...item, ts: item.ts || now() });
  if (arr.length > max) arr.length = max;
}
function b64url(buf) { return Buffer.from(buf).toString("base64url"); }
function sign(payload) {
  const h = b64url(crypto.createHash("sha256").update(SECRET).digest());
  const body = b64url(JSON.stringify(payload));
  return `${body}.${h}`;
}
function verifyToken(token) {
  if (!token || !token.includes(".")) return null;
  const [body, h] = token.split(".");
  const expect = b64url(crypto.createHash("sha256").update(SECRET).digest());
  if (h !== expect) return null;
  try { return JSON.parse(Buffer.from(body, "base64url").toString()); } catch { return null; }
}function auth(req, res, next) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : req.query.token;
  const u = verifyToken(token);
  if (!u) return res.status(401).json({ ok: false, error: "Unauthorized" });
  req.user = u;
  next();
}
function freeCount() {
  return Object.values(db.slots).filter((s) => !s.occupied).length;
}
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ============================ SSE REALTIME ==================================
const sseClients = new Set();
function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) {
    try { res.write(payload); } catch { sseClients.delete(res); }
  }
}
app.get("/api/stream", (req, res) => {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders?.();
  res.write(`event: hello\ndata: ${JSON.stringify({ ok: true, ts: now() })}\n\n`);
  sseClients.add(res);
  const ka = setInterval(() => { try { res.write(": ping\n\n"); } catch {} }, 15000);
  req.on("close", () => { clearInterval(ka); sseClients.delete(res); });
});

// ============================ MQTT ==========================================
// [LAB2 - Bảo mật & phân quyền] Backend có thể TỰ LÀM BROKER MQTT có xác thực.
// Lý do: broker Mosquitto (Docker) chỉ mở cổng TCP, mà nền tảng deploy
// (Render) chỉ expose được cổng HTTP công khai. Nên ta nhúng broker aedes
// vào chính tiến trình backend và expose nó qua MQTT-over-WebSocket (/mqtt).
// -> ESP32 (Wokwi) và App (React Native) cùng dùng broker này, CÓ user/pass
//    và ACL phân quyền theo topic (đúng tiêu chí "Bảo mật và phân quyền").
// Mặc định BẬT broker nội bộ (trừ khi người dùng chủ động tắt bằng
// EMBED_BROKER=false). Nhờ vậy, chỉ cần deploy là hệ thống có sẵn broker
// MQTT có xác thực + ACL, không phụ thuộc biến môi trường của hosting.
const EMBED_BROKER = process.env.EMBED_BROKER !== "false";
const EMBED_TCP_PORT = parseInt(process.env.EMBED_BROKER_PORT || "1883", 10);
const EMBED_WS_PORT = parseInt(process.env.EMBED_BROKER_WS_PORT || "9001", 10);

let embeddedBroker = null;
const authEvents = [];   // nhật ký các lần đăng nhập (minh chứng cho báo cáo)

if (EMBED_BROKER) {
  embeddedBroker = createAuthBroker({
    tcpPort: EMBED_TCP_PORT,
    wsPort: EMBED_WS_PORT,
    onLog: (m) => console.log(m),
    onAuth: (e) => {
      authEvents.push({ ...e, at: Date.now() });
      if (authEvents.length > 100) authEvents.shift();
    },
  });
  console.log("[BROKER] Broker MQTT noi bo da bat - co xac thuc user/pass + ACL");
}

// Kết nối MQTT của backend: nếu có broker nội bộ thì nối vào chính nó,
// ngược lại nối broker ngoài theo MQTT_URL.
// [FIX] Broker nội bộ có thể phải dùng cổng KHÁC 1883 nếu 1883 đã bị chiếm
// (Mosquitto Docker, hay project Node khác của người dùng). Trước đây backend
// nối ngay vào 1883 -> có thể nối NHẦM sang broker lạ (sai user/pass), mất
// trạng thái và làm test bridge FAIL. Nay ta CHỜ broker báo cổng thực tế
// rồi mới nối, và nếu broker sau đó phải đổi cổng thì nối lại cho đúng.
let MQTT_TARGET = EMBED_BROKER
  ? `mqtt://127.0.0.1:${EMBED_TCP_PORT}`
  : MQTT_URL;

const MC_OPTS = {
  username: MQTT_USER || undefined, password: MQTT_PASS || undefined,
  reconnectPeriod: 2000,
  clientId: `backend-${process.pid}-${Date.now().toString(36)}`,
  clean: true,
};

// Tạo client nhưng chưa nối ngay (để tránh nối nhầm cổng).
// Với broker nội bộ: ta tạo client với `manual connect` (không tự nối),
// chờ broker báo cổng thực tế rồi mới nối đúng 1 lần.
let mc;
if (EMBED_BROKER && embeddedBroker) {
  mc = mqtt.connect(`mqtt://127.0.0.1:${EMBED_TCP_PORT}`, {
    ...MC_OPTS,
    reconnectPeriod: 0,
    manualConnect: true,   // chưa nối cho tới khi biết cổng đúng
  });
  embeddedBroker.whenReady(10000).then((port) => {
    mc.options.reconnectPeriod = MC_OPTS.reconnectPeriod;
    if (port !== EMBED_TCP_PORT) {
      console.log(`[MQTT] Broker noi bo chay o cong ${port} (${EMBED_TCP_PORT} dang bi chiem)`);
      mc.options.port = port;
      mc.options.host = "127.0.0.1";
    }
    MQTT_TARGET = `mqtt://127.0.0.1:${mc.options.port}`;
    mc.connect();
  }).catch((e) => {
    console.error("[BROKER] Loi khi cho broker noi bo:", e.message);
    mc.options.reconnectPeriod = MC_OPTS.reconnectPeriod;
    mc.connect();
  });
} else {
  mc = mqtt.connect(MQTT_TARGET, MC_OPTS);
}

mc.on("connect", () => {
  console.log("[MQTT] Backend connected", MQTT_TARGET);
  mc.subscribe([
    "parking/slot/+/status",
    "parking/slots/snapshot",
    "parking/gate/barrier/state",
    "parking/gate/rfid",
    "parking/billing/receipt",
    "parking/booking/+/state",
    "parking/system/status",
    "parking/system/heartbeat",
  ], { qos: 1 });
});
let systemOnline = false;

// [N3] Chuan hoa moc thoi gian ve epoch (mili-giay).
// Firmware ESP32 phien ban 3.0 gui kem truong "clock" = gio thuc te da dong bo NTP.
// Truong "ts" cu van la millis() (dem tu luc boot) nen KHONG dung de hien thi.
// Neu ESP32 chua kip dong bo NTP thi lay thoi gian cua Server.
const stampOf = (d) => d.clock || d.epoch || now();

mc.on("message", (topic, buf) => {
  let d;
  try { d = JSON.parse(buf.toString()); } catch { return; }

  if (/^parking\/slot\/.+\/status$/.test(topic)) {
    db.slots[d.id] = {
      id: d.id,
      occupied: !!d.occupied,
      reservedBy: d.reservedBy || null,
      currentUser: d.currentUser || null,
      updatedAt: stampOf(d),
    };
    saveDb(); broadcast("slots", db.slots);
  }
  else if (topic === "parking/slots/snapshot") {
    for (const s of d.slots || []) {
      db.slots[s.id] = {
        id: s.id, occupied: !!s.occupied,
        reservedBy: s.reservedBy || null, currentUser: s.currentUser || null,
        updatedAt: now(),
      };
    }
    saveDb(); broadcast("slots", db.slots);
    db.gate = d.gate || db.gate;
    broadcast("gate", { gate: db.gate });
  }
  else if (topic === "parking/gate/barrier/state") {
    db.gate = d.gate || db.gate;
    saveDb();
    broadcast("gate", { gate: db.gate, openedBy: d.openedBy, ts: stampOf(d) });
  }
  else if (topic === "parking/gate/rfid") {
    pushLog(db.rfidLog, { ...d, ts: stampOf(d) });
    saveDb(); broadcast("rfid", d);
  }
  else if (topic === "parking/billing/receipt") {
    pushLog(db.receipts, { ...d, ts: stampOf(d) });
    db.counters.revenue += Number(d.fee || 0);
    db.counters.totalSessions += 1;
    pushLog(db.events, { type: "BILLING", slot: d.slot, user: d.user, fee: d.fee, minutes: d.minutes, ts: stampOf(d) });
    saveDb(); broadcast("receipt", d);
  }
  else if (/^parking\/booking\/.+\/state$/.test(topic)) {
    const st = d.state;
    if (st === "RESERVED" && d.ok) {
      pushLog(db.bookings, { slot: d.slot, user: d.user, action: "reserve", ok: true, requestId: d.requestId, ts: now() });
      db.counters.totalBookings += 1;
    } else if (st === "FREE" || st === "EXPIRED" || st === "ENTERED") {
      pushLog(db.bookings, { slot: d.slot, user: d.user, action: st.toLowerCase(), ok: !!d.ok, requestId: d.requestId, ts: now() });
    }
    saveDb(); broadcast("booking", d);
  }
  else if (topic === "parking/system/status") {
    systemOnline = !!d.online;
    broadcast("system", d);
  }
  else if (topic === "parking/system/heartbeat") {
    broadcast("heartbeat", d);
  }
});
mc.on("error", (e) => console.error("[MQTT] error:", e.message));

// ============================ REST API ======================================
app.get("/api/health", (req, res) => res.json({
  ok: true, mqtt: mc.connected, online: systemOnline,
  slots: Object.keys(db.slots).length, ts: now(),
  // [FIX] Cổng broker nội bộ thực tế. Nếu 1883 bị chiếm bởi broker khác,
  // broker nội bộ tự chuyển sang cổng trống -> simulator/App phải biết cổng
  // này mới nối đúng (nếu không sẽ nối nhầm sang broker lạ và mất trạng thái).
  brokerPort: embeddedBroker ? embeddedBroker.tcpPort : null,
  brokerHost: embeddedBroker ? "127.0.0.1" : MQTT_HOST_FOR_INFO,
}));

// GET /api/status -> toan bo trang thai realtime
app.get("/api/status", (req, res) => res.json({
  slots: db.slots,
  gate: db.gate || "CLOSED",  free: freeCount(),
  total: Object.keys(db.slots).length,
  revenue: db.counters.revenue,
  online: mc.connected && systemOnline,
  snapshot: db.lastSnapshot || null,
  ts: now(),
}));

app.get("/api/slots", (req, res) => res.json(db.slots));

// GET /api/receipts?limit=50 -> lich su hoa don
app.get("/api/receipts", (req, res) => {
  const limit = Math.min(500, parseInt(req.query.limit || "50", 10));
  res.json(db.receipts.slice(0, limit));
});

// GET /api/bookings?limit=50 -> lich su dat cho
app.get("/api/bookings", (req, res) => {
  const limit = Math.min(500, parseInt(req.query.limit || "50", 10));
  res.json(db.bookings.slice(0, limit));
});

// GET /api/rfid -> log the RFID
app.get("/api/rfid", (req, res) => res.json(db.rfidLog.slice(0, 100)));

// GET /api/events -> log su kien
app.get("/api/events", (req, res) => res.json(db.events.slice(0, 200)));

// GET /api/stats -> thong ke doanh thu + su dung
app.get("/api/stats", (req, res) => {
  const today = todayStr();
  const receiptsToday = db.receipts.filter((r) => new Date(r.ts).toISOString().slice(0, 10) === today);
  const revenueToday = receiptsToday.reduce((s, r) => s + Number(r.fee || 0), 0);

  // Doanh thu 7 ngay gan nhat
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const sum = db.receipts
      .filter((r) => new Date(r.ts).toISOString().slice(0, 10) === key)
      .reduce((s, r) => s + Number(r.fee || 0), 0);
    const cnt = db.receipts.filter((r) => new Date(r.ts).toISOString().slice(0, 10) === key).length;
    days.push({ date: key, revenue: sum, sessions: cnt });
  }

  // Thong ke theo gio trong ngay
  const byHour = Array(24).fill(0);
  receiptsToday.forEach((r) => { byHour[new Date(r.ts).getHours()] += Number(r.fee || 0); });

  // Ty le trong / trong theo gio
  const occupancy = Array(24).fill(0);
  db.receipts.forEach((r) => {
    const h = new Date(r.ts).getHours();
    occupancy[h] = Math.min(100, occupancy[h] + 1);
  });

  const users = {};
  db.receipts.forEach((r) => { users[r.user || "KHACH"] = (users[r.user || "KHACH"] || 0) + 1; });
  const topUsers = Object.entries(users).map(([u, c]) => ({ user: u, sessions: c }))
    .sort((a, b) => b.sessions - a.sessions).slice(0, 10);

  res.json({
    totalRevenue: db.counters.revenue,
    revenueToday,
    totalBookings: db.counters.totalBookings,
    totalSessions: db.counters.totalSessions,
    today,
    days,
    byHour,
    occupancy,
    topUsers,
    slotUsage: Object.values(db.slots).map((s) => ({
      id: s.id, occupied: s.occupied, reserved: !!s.reservedBy,
    })),
    free: freeCount(),
    total: Object.keys(db.slots).length,
  });
});

// POST /api/booking {slot, user, action} -> chuyen tiep MQTT
const BOOK_ACTIONS = ["reserve", "cancel", "enter", "exit", "stay"];
app.post("/api/booking", (req, res) => {
  const { slot: rawSlot, user: rawUser, action = "reserve", requestId = String(now()) } = req.body || {};
  const slot = cleanStr(rawSlot, 8).toUpperCase();
  const user = cleanStr(rawUser, 32);
  if (!slot || !user) return res.status(400).json({ ok: false, error: "Thieu slot/user" });
  if (!isValidSlot(slot)) return res.status(400).json({ ok: false, error: "Ma o chi P1..P6" });
  if (!BOOK_ACTIONS.includes(action)) {
    return res.status(400).json({ ok: false, error: `action phai la: ${BOOK_ACTIONS.join(", ")}` });
  }
  mc.publish(`parking/booking/${slot}/set`,
    JSON.stringify({ slot, user, action, requestId }), { qos: 1 });
  res.json({ ok: true, forwarded: true, requestId, slot, action });
});

// POST /api/gate {cmd, by}
app.post("/api/gate", (req, res) => {
  const { cmd = "OPEN", by: rawBy = "api", requestId = String(now()) } = req.body || {};
  const by = cleanStr(rawBy, 32) || "api";
  mc.publish("parking/gate/barrier/cmd",
    JSON.stringify({ cmd: cmd === "OPEN" ? "OPEN" : "CLOSE", by, requestId }), { qos: 1 });
  res.json({ ok: true, cmd, requestId });
});

// POST /api/enter {slot, user} - App xac nhan xe vao
app.post("/api/enter", (req, res) => {
  const { slot: rawSlot, user: rawUser = "KHACH", requestId = String(now()) } = req.body || {};
  const slot = cleanStr(rawSlot, 8).toUpperCase();
  const user = cleanStr(rawUser, 32) || "KHACH";
  if (!isValidSlot(slot)) return res.status(400).json({ ok: false, error: "Ma o chi P1..P6" });
  mc.publish(`parking/booking/${slot}/set`,
    JSON.stringify({ slot, user, action: "enter", requestId }), { qos: 1 });
  res.json({ ok: true, forwarded: true, requestId });
});

// POST /api/exit {slot, user} - App xac nhan xe ra -> tinh phi
app.post("/api/exit", (req, res) => {
  const { slot: rawSlot, user: rawUser = "KHACH", requestId = String(now()) } = req.body || {};
  const slot = cleanStr(rawSlot, 8).toUpperCase();
  const user = cleanStr(rawUser, 32) || "KHACH";
  if (!isValidSlot(slot)) return res.status(400).json({ ok: false, error: "Ma o chi P1..P6" });
  mc.publish(`parking/booking/${slot}/set`,
    JSON.stringify({ slot, user, action: "exit", requestId }), { qos: 1 });
  res.json({ ok: true, forwarded: true, requestId });
});

// ------------------------- Nguoi dung (dang ky / dang nhap) ------------------
app.post("/api/auth/register", (req, res) => {
  const { username: rawU, password, name: rawName, plate: rawPlate } = req.body || {};
  const username = cleanStr(rawU, 32);
  const name = cleanStr(rawName, 64);
  const plate = cleanStr(rawPlate, 16);
  if (!username || !password) return res.status(400).json({ ok: false, error: "Thieu ten/dinh mat khau" });
  if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(username)) {
    return res.status(400).json({ ok: false, error: "Ten dang nhap 3-32 ky tu (chu, so, _ . -)" });
  }
  if (String(password).length < 4) return res.status(400).json({ ok: false, error: "Mat khau >= 4 ky tu" });
  if (db.users.find((u) => u.username === username)) {
    return res.status(409).json({ ok: false, error: "Ten dang dang ky" });
  }
  const u = {
    id: "u" + now().toString(36),
    username, name: name || username, plate,
    password: crypto.createHash("sha256").update(password).digest("hex"),
    role: "user", createdAt: now(), balance: 0,
  };
  db.users.push(u); saveDb();
  res.json({ ok: true, user: { id: u.id, username: u.username, name: u.name, plate: u.plate, role: u.role } });
});

app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body || {};
  const u = db.users.find((x) => x.username === username);
  const hash = crypto.createHash("sha256").update(String(password || "")).digest("hex");
  if (!u || u.password !== hash) return res.status(401).json({ ok: false, error: "Sai ten hoac mat khau" });
  const token = sign({ id: u.id, username: u.username, role: u.role, exp: now() + 7 * 864e5 });
  res.json({ ok: true, token, user: { id: u.id, username: u.username, name: u.name, plate: u.plate, role: u.role } });
});

app.get("/api/auth/me", auth, (req, res) => {
  const u = db.users.find((x) => x.id === req.user.id);
  if (!u) return res.status(404).json({ ok: false, error: "Khong tim thay user" });
  res.json({ ok: true, user: { id: u.id, username: u.username, name: u.name, plate: u.plate, role: u.role, balance: u.balance } });
});

app.get("/api/users", (req, res) => {
  res.json(db.users.map((u) => ({
    id: u.id, username: u.username, name: u.name, plate: u.plate,
    role: u.role, createdAt: u.createdAt,
    sessions: db.receipts.filter((r) => r.user === u.username).length,
    spent: db.receipts.filter((r) => r.user === u.username).reduce((s, r) => s + Number(r.fee || 0), 0),
  })));
});

// POST /api/balance {amount} - nap tien cho user
app.post("/api/balance", auth, (req, res) => {
  const u = db.users.find((x) => x.id === req.user.id);
  if (!u) return res.status(404).json({ ok: false, error: "Khong tim thay user" });
  const amount = Math.max(0, Math.min(10000000, Number(req.body?.amount || 0)));
  u.balance = Number(u.balance || 0) + amount;
  saveDb();
  res.json({ ok: true, balance: u.balance });
});

// POST /api/logout - no-op token client-side
app.post("/api/logout", (req, res) => res.json({ ok: true }));

// GET /api/health/deep - kiem tra suc khoe toan he thong
app.get("/api/health/deep", (req, res) => {
  res.json({
    ok: true,
    uptimeSec: Math.floor(process.uptime()),
    node: process.version,
    mqtt: { connected: mc.connected, url: MQTT_URL, online: systemOnline },
    data: {
      file: DATA_FILE,
      slots: Object.keys(db.slots).length,
      bookings: db.bookings.length,
      receipts: db.receipts.length,
      users: db.users.length,
      rfidLog: db.rfidLog.length,
      events: db.events.length,
    },
    counters: db.counters,
    memory: process.memoryUsage().heapUsed,
    ts: now(),
  });
});

// ============================ MQTT-over-WEBSOCKET BRIDGE ====================
// App React Native chi noi duoc MQTT qua WebSocket. Bridge nay lam proxy:
//   App --wss://<server>/mqtt--> BRIDGE --mqtt://<broker>--> Broker
// => App chi can 1 duong dan HTTPS, khong phai mo port broker public.
//
// [LAB2] Khi co broker noi bo (EMBED_BROKER=true), ta KHONG dung proxy:
// /mqtt tro thang vao broker aedes -> client duoc xac thuc + ACL that
// (khong qua trung gian). App/ESP32 phai gui user/pass khi ket noi.
const BRIDGE_PATH = process.env.MQTT_WS_PATH || "/mqtt";
const bridge = EMBED_BROKER
  ? null
  : createMqttWsBridge({
      mqtt,
      path: BRIDGE_PATH,
      brokerUrl: MQTT_TARGET,
      username: MQTT_USER || undefined,
      password: MQTT_PASS || undefined,
      onLog: (m) => console.log(m),
    });

// GET /api/bridge - thong tin trang thai bridge (App + GV xem duoc)
app.get("/api/bridge", (req, res) => res.json({
  ok: true,
  path: BRIDGE_PATH,
  broker: embeddedBroker ? "embedded-aedes" : MQTT_URL,
  mode: embeddedBroker ? "embedded" : "proxy",
  ...(bridge ? bridge.stats() : { clients: 0, subscriptions: [] }),
  ...(embeddedBroker ? { embedded: embeddedBroker.stats() } : {}),
}));

// GET /api/broker/auth-log - NHẬT KÝ xác thực của broker (minh chứng Lab 2)
// Giảng viên / sinh viên xem được ai đã đăng nhập, đúng hay sai mật khẩu,
// và topic nào bị ACL chặn -> dùng làm bằng chứng cho tiêu chí "bảo mật".
app.get("/api/broker/auth-log", (req, res) => res.json({
  ok: true,
  embedded: EMBED_BROKER,
  users: embeddedBroker ? embeddedBroker.users : [],
  events: authEvents.slice(-50).reverse(),
}));

// GET /api/version - PHIÊN BẢN ĐANG CHẠY (dùng để xác nhận deploy thành công)
// "build" là mã commit của bản build trên Render -> thay đổi "build" nghĩa là
// đã deploy code mới (hữu ích khi thầy giáo / nhóm kiểm tra hệ thống đang chạy).
app.get("/api/version", (req, res) => res.json({
  ok: true,
  build: process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT || "local",
  aedes: embeddedBroker ? embeddedBroker.aedes.version : null,
  adapter: "mqttWsAdapter-v2",
  node: process.version,
  uptimeSec: Math.floor(process.uptime()),
  ts: now(),
}));

// 404 JSON cho API
app.use("/api", (req, res) => res.status(404).json({ ok: false, error: "Khong tim thay endpoint" }));

// Error handler toan cuc
app.use((err, req, res, next) => {
  console.error("[ERROR]", err.message);
  if (res.headersSent) return next(err);
  res.status(500).json({ ok: false, error: "Loi may chu" });
});

app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.use(express.static(path.join(__dirname, "public")));

const server = http.createServer(app);
// Khi co broker noi bo -> /mqtt tro thang vao broker (co xac thuc + ACL)
// Khi khong co -> /mqtt la proxy sang broker ngoai
if (embeddedBroker) embeddedBroker.handleUpgrade(server, BRIDGE_PATH);
else bridge.handleUpgrade(server);

server.listen(PORT, () => {
  console.log("=========================================");
  console.log(" Backend Smart Parking");
  console.log(" HTTP : http://localhost:" + PORT);
  console.log(" MQTT : " + MQTT_TARGET + (embeddedBroker ? "  (broker noi bo)" : ""));
  console.log(" WS   : ws://localhost:" + PORT + BRIDGE_PATH + "  (MQTT over WebSocket)");
  console.log(" DATA : " + DATA_FILE);
  console.log("=========================================");
});

// [FIX] In cổng broker THỰC TỄ (có thể khác 1883 nếu 1883 bị chiếm) để
// người dùng biết simulator/App phải cấu hình cổng nào.
if (embeddedBroker) {
  embeddedBroker.whenReady(10000).then((port) => {
    if (port !== EMBED_TCP_PORT) {
      console.log(`[BROKER] Luu y: cong ${EMBED_TCP_PORT} dang bi chiem, broker noi bo chay o cong ${port}.`);
      console.log(`[BROKER] Simulator/App phai tro toi cong ${port} (xem /api/health -> brokerPort).`);
    }
  }).catch(() => {});
}
