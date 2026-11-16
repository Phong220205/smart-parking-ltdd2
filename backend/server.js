import express from "express";
import mqtt from "mqtt";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

const MQTT_URL = process.env.MQTT_URL || "mqtt://localhost:1883";
const MQTT_USER = process.env.MQTT_USER || "esp32";
const MQTT_PASS = process.env.MQTT_PASS || "esp32123";
const PORT = process.env.PORT || 3000;

// ---- Cache trạng thái realtime từ ESP32/simulator ----
const slots = {};   // P1..P6 -> {occupied, reservedBy, updatedAt}
let gate = "CLOSED";
let lastSnapshot = null;
const receipts = [];
const rfidLog = [];

for (let i = 1; i <= 6; i++) slots["P" + i] = { occupied: false, reservedBy: null, updatedAt: Date.now() };

// ---- Nối MQTT ----
const mc = mqtt.connect(MQTT_URL, { username: MQTT_USER, password: MQTT_PASS, reconnectPeriod: 2000 });
mc.on("connect", () => {
  console.log("Backend connected MQTT", MQTT_URL);
  mc.subscribe(["parking/slot/+/status", "parking/slots/snapshot", "parking/gate/barrier/state",
    "parking/gate/rfid", "parking/billing/receipt", "parking/booking/+/state"], { qos: 1 });
});
mc.on("message", (topic, buf) => {
  try {
    const d = JSON.parse(buf.toString());
    if (topic.match(/parking\/slot\/.+\/status/)) {
      slots[d.id] = { occupied: d.occupied, reservedBy: d.reservedBy || null, updatedAt: d.updatedAt };
    } else if (topic === "parking/slots/snapshot") {
      lastSnapshot = d;
      for (const s of d.slots || []) slots[s.id] = { occupied: s.occupied, reservedBy: s.reservedBy || null, updatedAt: Date.now() };
      gate = d.gate || gate;
    } else if (topic === "parking/gate/barrier/state") {
      gate = d.gate;
    } else if (topic === "parking/gate/rfid") {
      rfidLog.unshift({ ...d, ts: Date.now() }); if (rfidLog.length > 50) rfidLog.pop();
    } else if (topic === "parking/billing/receipt") {
      receipts.unshift({ ...d, ts: Date.now() }); if (receipts.length > 100) receipts.pop();
    }
  } catch (e) { console.error("Bad MQTT payload", topic); }
});

// ---- REST API cho App / báo cáo ----
// GET /api/status -> sơ đồ bãi realtime
app.get("/api/status", (req, res) => res.json({ slots, gate, snapshot: lastSnapshot, online: mc.connected }));
// GET /api/receipts -> lịch sử tính phí
app.get("/api/receipts", (req, res) => res.json(receipts));
// GET /api/rfid -> log thẻ
app.get("/api/rfid", (req, res) => res.json(rfidLog));
// POST /api/booking {slot, user, action} -> chuyển tiếp MQTT, App vẫn phải chờ state qua MQTT
app.post("/api/booking", (req, res) => {
  const { slot, user, action = "reserve", requestId = String(Date.now()) } = req.body || {};
  mc.publish(`parking/booking/${slot}/set`, JSON.stringify({ slot, user, action, requestId }), { qos: 1 });
  res.json({ ok: true, forwarded: true, requestId });
});
// POST /api/gate {cmd, by}
app.post("/api/gate", (req, res) => {
  const { cmd = "OPEN", by = "api", requestId = String(Date.now()) } = req.body || {};
  mc.publish("parking/gate/barrier/cmd", JSON.stringify({ cmd, by, requestId }), { qos: 1 });
  res.json({ ok: true, cmd });
});
app.get("/", (req, res) => res.send("Smart Parking Backend OK. Xem /api/status"));

app.listen(PORT, () => console.log("Backend http://localhost:" + PORT));
