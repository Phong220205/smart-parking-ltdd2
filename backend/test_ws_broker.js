// Test: kết nối MQTT-over-WebSocket tới broker nhúng, kiểm tra auth + ACL
import mqtt from "mqtt";

const URL = process.argv[2] || "ws://127.0.0.1:3100/mqtt";

function test(name, user, pass, topic, expect) {
  return new Promise((resolve) => {
    const c = mqtt.connect(URL, {
      username: user, password: pass,
      clientId: "ws-" + Math.random().toString(36).slice(2, 8),
      reconnectPeriod: 0, connectTimeout: 4000,
    });
    let done = false;
    const fin = (ok, detail) => {
      if (done) return; done = true;
      try { c.end(true); } catch {}
      resolve({ name, ok, detail });
    };
    c.on("connect", () => {
      c.subscribe(topic, (err, granted) => {
        fin(!err, err ? err.message : JSON.stringify(granted));
      });
    });
    c.on("error", (e) => fin(false, e.message));
    setTimeout(() => fin(false, "timeout"), 6000);
  });
}

console.log("URL:", URL);
const cases = [
  ["WS: esp32 subscribe parking/#", "esp32", "esp32123", "parking/#", true],
  ["WS: esp32 sai mat khau bi tu choi", "esp32", "SAI", "parking/#", false],
  ["WS: an danh bi tu choi", "", "", "parking/#", false],
  ["WS: app subscribe topic duoc phep", "app", "app123", "parking/slot/+/status", true],
  ["WS: app subscribe topic khong duoc phep", "app", "app123", "parking/internal/x", false],
];
let pass = 0;
for (const [name, u, p, t, expect] of cases) {
  const r = await test(name, u, p, t, expect);
  const ok = r.ok === expect;
  if (ok) pass++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  -> ${r.detail}`);
}
console.log(`${pass}/${cases.length} PASS`);
process.exit(pass === cases.length ? 0 : 1);
