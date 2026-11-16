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
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const MQTT_URL  = process.env.MQTT_URL  || "mqtt://localhost:1883";
const MQTT_USER = process.env.MQTT_USER || "esp32";
const MQTT_PASS = process.env.MQTT_PASS || "esp32123";
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
const mc = mqtt.connect(MQTT_URL, {
  username: MQTT_USER, password: MQTT_PASS, reconnectPeriod: 2000,
});
mc.on("connect", () => {
  console.log("[MQTT] Backend connected", MQTT_URL);
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
mc.on("message", (topic, buf) => {
  let d;
  try { d = JSON.parse(buf.toString()); } catch { return; }

  if (/^parking\/slot\/.+\/status$/.test(topic)) {
    db.slots[d.id] = {
      id: d.id,
      occupied: !!d.occupied,
      reservedBy: d.reservedBy || null,
      currentUser: d.currentUser || null,
      updatedAt: d.updatedAt || now(),
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
    broadcast("gate", { gate: d.gate });
  }
  else if (topic === "parking/gate/barrier/state") {
    broadcast("gate", { gate: d.gate, openedBy: d.openedBy, ts: d.ts });
  }
  else if (topic === "parking/gate/rfid") {
    pushLog(db.rfidLog, { ...d });
    saveDb(); broadcast("rfid", d);
  }
  else if (topic === "parking/billing/receipt") {
    pushLog(db.receipts, { ...d });
    db.counters.revenue += Number(d.fee || 0);
    db.counters.totalSessions += 1;
    pushLog(db.events, { type: "BILLING", slot: d.slot, user: d.user, fee: d.fee, minutes: d.minutes });
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
}));

// GET /api/status -> toan bo trang thai realtime
app.get("/api/status", (req, res) => res.json({
  slots: db.slots,
  gate: db.gate || "CLOSED",
  free: freeCount(),
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
app.post("/api/booking", (req, res) => {
  const { slot, user, action = "reserve", requestId = String(now()) } = req.body || {};
  if (!slot || !user) return res.status(400).json({ ok: false, error: "Thieu slot/user" });
  mc.publish(`parking/booking/${slot}/set`,
    JSON.stringify({ slot, user, action, requestId }), { qos: 1 });
  res.json({ ok: true, forwarded: true, requestId, slot, action });
});

// POST /api/gate {cmd, by}
app.post("/api/gate", (req, res) => {
  const { cmd = "OPEN", by = "api", requestId = String(now()) } = req.body || {};
  mc.publish("parking/gate/barrier/cmd",
    JSON.stringify({ cmd: cmd === "OPEN" ? "OPEN" : "CLOSE", by, requestId }), { qos: 1 });
  res.json({ ok: true, cmd, requestId });
});

// POST /api/enter {slot, user} - App xac nhan xe vao
app.post("/api/enter", (req, res) => {
  const { slot, user = "KHACH", requestId = String(now()) } = req.body || {};
  mc.publish(`parking/booking/${slot}/set`,
    JSON.stringify({ slot, user, action: "enter", requestId }), { qos: 1 });
  res.json({ ok: true, forwarded: true, requestId });
});

// POST /api/exit {slot, user} - App xac nhan xe ra -> tinh phi
app.post("/api/exit", (req, res) => {
  const { slot, user = "KHACH", requestId = String(now()) } = req.body || {};
  mc.publish(`parking/booking/${slot}/set`,
    JSON.stringify({ slot, user, action: "exit", requestId }), { qos: 1 });
  res.json({ ok: true, forwarded: true, requestId });
});

// ------------------------- Nguoi dung (dang ky / dang nhap) ------------------
app.post("/api/auth/register", (req, res) => {
  const { username, password, name, plate } = req.body || {};
  if (!username || !password) return res.status(400).json({ ok: false, error: "Thieu ten/dinh mat khau" });
  if (password.length < 4) return res.status(400).json({ ok: false, error: "Mat khau >= 4 ky tu" });
  if (db.users.find((u) => u.username === username)) {
    return res.status(409).json({ ok: false, error: "Ten dang dang ky" });
  }
  const u = {
    id: "u" + now().toString(36),
    username, name: name || username, plate: plate || "",
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

app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.use(express.static(path.join(__dirname, "public")));

app.listen(PORT, () => {
  console.log("=========================================");
  console.log(" Backend Smart Parking");
  console.log(" HTTP : http://localhost:" + PORT);
  console.log(" MQTT : " + MQTT_URL);
  console.log(" DATA : " + DATA_FILE);
  console.log("=========================================");
});
