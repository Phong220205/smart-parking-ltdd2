// ============================================================================
//  TEST TỰ ĐỘNG - BROKER MQTT NHÚNG (aedes) CÓ XÁC THỰC + ACL
//  ---------------------------------------------------------------------------
//  Chạy: node backend/test_embedded_broker.js
//  Mục đích: chứng minh broker nhúng trong backend hoạt động đúng:
//    1. Client đúng user/pass  -> kết nối thành công
//    2. Client sai mật khẩu    -> bị từ chối (CONNACK rc=4/5)
//    3. Client ẩn danh        -> bị từ chối
//    4. user "esp32" ghi được mọi topic
//    5. user "app" ghi được lệnh booking/gate, nhưng bị CHẶN khi ghi
//       vào topic trạng thái cảm biến (ACL phân quyền)
// ============================================================================

import { createAuthBroker } from "./mqttAuthBroker.js";
import mqtt from "mqtt";

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`);
}

const broker = createAuthBroker({
  tcpPort: 18830,
  wsPort: 9001,
  onLog: (m) => console.log("   " + m),
});

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function connect(user, pass, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const c = mqtt.connect("mqtt://127.0.0.1:18830", {
      username: user,
      password: pass,
      clientId: `test-${Math.random().toString(36).slice(2, 8)}`,
      connectTimeout: timeoutMs,
      reconnectPeriod: 0,
    });
    let done = false;
    const finish = (ok, err) => {
      if (done) return;
      done = true;
      try { c.end(true); } catch {}
      resolve({ ok, err });
    };
    c.on("connect", () => finish(true, null));
    c.on("error", (e) => finish(false, e.message));
    setTimeout(() => finish(false, "timeout"), timeoutMs + 500);
  });
}

function publish(user, pass, topic, payload, qos = 1) {
  return new Promise((resolve) => {
    const c = mqtt.connect("mqtt://127.0.0.1:18830", {
      username: user, password: pass,
      clientId: `pub-${Math.random().toString(36).slice(2, 8)}`,
      reconnectPeriod: 0,
      connectTimeout: 4000,
    });
    let settled = false;
    const finish = (v) => {
      if (settled) return;
      settled = true;
      try { c.end(true); } catch {}
      resolve(v);
    };
    c.on("connect", () => {
      // QoS >= 1: broker PHẢI trả PUBACK, nếu bị ACL chặn thì broker đóng
      // kết nối -> client nhận lỗi -> callback được gọi với err.
      c.publish(topic, payload, { qos }, (err) => finish(err ? "denied" : "ok"));
      setTimeout(() => finish("timeout-no-ack"), 3000);
    });
    c.on("error", (e) => finish("denied:" + e.message));
  });
}

function subscribe(user, pass, topic) {
  return new Promise((resolve) => {
    const c = mqtt.connect("mqtt://127.0.0.1:18830", {
      username: user, password: pass,
      clientId: `sub-${Math.random().toString(36).slice(2, 8)}`,
      reconnectPeriod: 0,
    });
    c.on("connect", () => {
      c.subscribe(topic, (err, granted) => {
        try { c.end(true); } catch {}
        resolve(err ? "denied" : granted.map((g) => g.qos));
      });
    });
    c.on("error", () => {
      try { c.end(true); } catch {}
      resolve("connect-error");
    });
  });
}

async function main() {
  await wait(700);
  console.log("\n=== KET THUC TEST BROKER ===\n");

  const ok1 = await connect("esp32", "esp32123");
  check("esp32 / esp32123 ket noi thanh cong", ok1.ok, ok1.err || "");

  const ok2 = await connect("esp32", "SAI_MAT_KHAU");
  check("esp32 sai mat khau bi tu choi", !ok2.ok, ok2.err || "");

  const ok3 = await connect("", "");
  check("ket noi an danh bi tu choi", !ok3.ok, ok3.err || "");

  const ok4 = await connect("app", "app123");
  check("app / app123 ket noi thanh cong", ok4.ok, ok4.err || "");

  const ok5 = await connect("khong_ton_tai", "x");
  check("user khong ton tai bi tu choi", !ok5.ok, ok5.err || "");

  const w1 = await publish("esp32", "esp32123", "parking/slot/P1/status", '{"occupied":true}');
  check("esp32 ghi duoc topic trang thai", w1 === "ok", w1);

  const w2 = await publish("app", "app123", "parking/booking/P1/set", '{"action":"reserve"}');
  check("app ghi duoc lenh dat cho", w2 === "ok", w2);

  const w3 = await publish("app", "app123", "parking/slot/P1/status", '{"occupied":false}');
  check("app bi ACL chan khi ghi topic trang thai", w3 !== "ok", w3);

  const r1 = await subscribe("app", "app123", "parking/slot/+/status");
  check("app duoc DOC topic trang thai", Array.isArray(r1), JSON.stringify(r1));

  const r2 = await subscribe("app", "app123", "parking/system/internal");
  check("app bi ACL chan khi DOC topic khong duoc phep", r2 === "denied", r2);

  const r3 = await subscribe("esp32", "esp32123", "parking/#");
  check("esp32 duoc DOC parking/#", Array.isArray(r3), JSON.stringify(r3));

  console.log("\n=== KET QUA ===");
  const passed = results.filter((r) => r.ok).length;
  console.log(`${passed}/${results.length} PASS`);
  broker.close();
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((e) => {
  console.error("LOI:", e);
  process.exit(1);
});
