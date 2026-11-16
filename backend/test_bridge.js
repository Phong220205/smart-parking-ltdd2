// Test MQTT-over-WebSocket bridge (giống hệt App React Native kết nối)
// Usage: node backend/test_bridge.js
import mqtt from "mqtt";
import { WebSocket } from "ws";

const URL = process.argv[2] || "ws://localhost:3000/mqtt";
const TOPICS = [
  "parking/slot/+/status", "parking/slots/snapshot", "parking/booking/+/state",
  "parking/gate/barrier/state", "parking/gate/rfid", "parking/billing/receipt",
  "parking/system/heartbeat", "parking/system/status",
];

const got = [];
const client = mqtt.connect(URL, {
  clientId: "test-bridge-" + Date.now(),
  reconnectPeriod: 0,
  protocolVersion: 4,
  ws: WebSocket,
});

const timer = setTimeout(() => {
  console.log("TIMEOUT - khong nhan duoc du lieu qua bridge");
  console.log("Da nhan:", got.length, JSON.stringify(got.slice(0, 5)));
  process.exit(1);
}, 20000);

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

  if (topic === "parking/slots/snapshot") {
    // Publish ngược lại để kiểm tra chiều App -> Broker
    const reqId = "bridge-test-" + Date.now();
    client.publish("parking/booking/P1/set", JSON.stringify({
      slot: "P1", user: "BRIDGE01", action: "reserve", requestId: reqId,
    }), { qos: 1 });
    console.log("[ACT] Da publish lenh reserve P1");
  }
  if (topic.includes("/booking/") && d.requestId) {
    console.log(d.ok ? "[OK] Bridge -> Broker -> App: " : "[FAIL] ", "nhan phan hoi:", d.msg, "ok=" + d.ok);
    clearTimeout(timer);
    console.log("\n=== KET QUA: BRIDGE HOAT DONG ===");
    console.log("Tong message nhan duoc:", got.length);
    process.exit(d.ok ? 0 : 1);
  }
});

client.on("error", (e) => {
  console.log("[FAIL] loi:", e.message);
  process.exit(1);
});
