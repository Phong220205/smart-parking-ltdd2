// Test MQTT-over-WebSocket bridge (giống hệt App React Native kết nối)
// Usage: node backend/test_bridge.js [wsUrl]
import mqtt from "mqtt";
import { WebSocket } from "ws";

const URL = process.argv[2] || "ws://localhost:3000/mqtt";
const TOPICS = [
  "parking/slot/+/status", "parking/slots/snapshot", "parking/booking/+/state",
  "parking/gate/barrier/state", "parking/gate/rfid", "parking/billing/receipt",
  "parking/system/heartbeat", "parking/system/status",
];

const got = [];
const REQ = "bridge-test-" + Date.now();
const SLOT = "P" + (1 + Math.floor(Math.random() * 6));

const client = mqtt.connect(URL, {
  clientId: "test-bridge-" + Date.now(),
  reconnectPeriod: 0,
  protocolVersion: 4,
  ws: WebSocket,
});

const timer = setTimeout(() => {
  console.log("TIMEOUT - khong nhan duoc phan hoi dung requestId");
  console.log("Da nhan:", got.length, "topic:", got.join(", "));
  process.exit(1);
}, 25000);

client.on("connect", () => {
  console.log("[OK] WebSocket/MQTT connect OK ->", URL);
  client.subscribe(TOPICS, { qos: 1 }, (err) => {
    console.log(err ? "[FAIL] subscribe: " + err.message : "[OK] subscribe " + TOPICS.length + " topic");
  });
});

client.on("message", (topic, buf) => {
  let d = {};
  try { d = JSON.parse(buf.toString()); } catch {}
  got.push(topic);
  console.log("[MSG]", topic, JSON.stringify(d).slice(0, 90));

  // Chi khi nao nhan duoc snapshot thi moi publish lenh de thu vong tron
  if (topic === "parking/slots/snapshot" && !d.__sent) {
    d.__sent = true;
    console.log("[ACT] publish reserve " + SLOT + " requestId=" + REQ);
    client.publish(`parking/booking/${SLOT}/set`, JSON.stringify({
      slot: SLOT, user: "BRIDGE01", action: "reserve", requestId: REQ,
    }), { qos: 1 });
  }

  // Phai khop requestId moi chinh xac la phan hoi cua lenh ta vua gui
  if (topic.includes("/booking/") && d.requestId === REQ) {
    clearTimeout(timer);
    console.log(d.ok ? "[OK] Bridge -> Broker -> App: " + d.msg : "[FAIL] " + d.msg);
    console.log("\n=== KET QUA: BRIDGE HOAT DONG (2 chieu) ===");
    console.log("Tong message nhan duoc:", got.length);
    process.exit(d.ok ? 0 : 1);
  }
});

client.on("error", (e) => {
  console.log("[FAIL] loi:", e.message);
  process.exit(1);
});
