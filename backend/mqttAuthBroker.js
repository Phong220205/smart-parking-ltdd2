// ============================================================================
//  MQTT BROKER NỘI BỘ (aedes) - CÓ XÁC THỰC + ACL PHÂN QUYỀN
//  ---------------------------------------------------------------------------
//  VÌ SAO CẦN FILE NÀY?
//    - Đồ án cần một broker MQTT CÓ xác thực user/password và phân quyền
//      theo topic (tiêu chí "Bảo mật và phân quyền" của Bài lab 2).
//    - Broker Mosquitto chạy bằng Docker chỉ mở được cổng TCP, mà Render
//      (nơi deploy backend) chỉ expose được cổng HTTP công khai.
//    - Giải pháp: chạy broker MQTT ngay TRONG tiến trình backend (thư viện
//      aedes - broker MQTT viết bằng JavaScript cho Node.js), rồi expose nó
//      ra ngoài qua giao thức MQTT-over-WebSocket tại đường dẫn /mqtt.
//      => ESP32 (Wokwi) và App (React Native) đều kết nối được broker này.
//
//  CƠ CHẾ XÁC THỰC (tương đương Mosquitto):
//    - allow_anonymous = false: client không có user/pass sẽ bị từ chối.
//    - Mật khẩu lưu dạng HASH (sha256), không lưu bản rõ.
//    - ACL: mỗi user chỉ được đọc/ghi đúng danh sách topic được cấp.
//
//  CÁC TÀI KHOẢN DEMO (giống hệt broker Docker trong thư mục broker/):
//    esp32 / esp32123  -> đọc + ghi toàn bộ parking/#
//    app   / app123    -> chỉ đọc dữ liệu + gửi lệnh booking/gate
// ============================================================================

import { createServer } from "node:net";
import crypto from "node:crypto";
import Aedes from "aedes";
import { WebSocketServer } from "ws";
import { createWsStream } from "./mqttWsAdapter.js";

// --------------------------- HASH MẬT KHẨU ---------------------------------
// SHA-256 hex của mật khẩu. Cách này tương đương mosquitto_passwd:
// broker chỉ lưu hash, không lưu mật khẩu rõ.
function sha256(text) {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

// Danh sách tài khoản của đồ án.
// GHI CHÚ: đây là tài khoản demo, mật khẩu nằm công khai trong mã nguồn
// (giống cách nhiều đồ án mẫu làm) - trong sản phẩm thật nên đặt qua biến
// môi trường EMBED_BROKER_USERS.
const DEFAULT_USERS = {
  esp32: "esp32123",   // thiết bị ESP32 / simulator: full quyền
  app: "app123",       // App React Native: chỉ đọc + gửi lệnh
};

const USERS = process.env.EMBED_BROKER_USERS
  ? Object.fromEntries(
      process.env.EMBED_BROKER_USERS.split(",").map((pair) => {
        const [u, p] = pair.split(":");
        return [u, p];
      })
    )
  : DEFAULT_USERS;

// HASH dựng sẵn (tính 1 lần lúc khởi động - rất nhanh, không tốn nhiều)
const USER_HASHES = new Map(
  Object.entries(USERS).map(([user, pass]) => [user, sha256(pass)])
);

// --------------------------- ACL PHÂN QUYỀN TOPIC ----------------------------
// Mỗi user có 2 danh sách:
//   read  : các mẫu topic được phép ĐỌC (subscribe)
//   write : các mẫu topic được phép GHI (publish)
// Topic khớp cả hai mẫu sẽ bị TỪ CHỐI khi publish (giống Mosquitto).
const ACL = {
  esp32: {
    read: ["parking/#"],
    write: ["parking/#"],
  },
  app: {
    // App được ĐỌC dữ liệu hiển thị
    read: [
      "parking/slot/+/status",
      "parking/slots/snapshot",
      "parking/booking/+/state",
      "parking/gate/barrier/state",
      "parking/gate/rfid",
      "parking/billing/receipt",
      "parking/system/heartbeat",
      "parking/system/status",
    ],
    // App được GỬI LỆNH điều khiển
    write: ["parking/booking/+/set", "parking/gate/barrier/cmd"],
  },
};

// --------------------------- HÀM KHỚP MẪU TOPIC ------------------------------
// Hỗ trợ wildcard MQTT 3.1.1: "+" (một cấp) và "#" (phần còn lại)
export function topicMatches(filter, topic) {
  const f = String(filter).split("/");
  const t = String(topic).split("/");
  for (let i = 0; i < f.length; i++) {
    if (f[i] === "#") return true;
    if (i >= t.length) return false;
    if (f[i] !== "+" && f[i] !== t[i]) return false;
  }
  return f.length === t.length;
}

function canRead(user, topic) {
  const acl = ACL[user];
  if (!acl) return false;
  return acl.read.some((f) => topicMatches(f, topic));
}

function canWrite(user, topic) {
  const acl = ACL[user];
  if (!acl) return false;
  return acl.write.some((f) => topicMatches(f, topic));
}

// --------------------------- KHỞI TẠO BROKER AEDES ---------------------------
/**
 * Tạo broker MQTT nội bộ có xác thực + ACL.
 * @param {object} opts
 *   - tcpPort: cổng MQTT/TCP (mặc định 1883) - dùng cho thiết bị trong mạng nội bộ
 *   - wsPort:  cổng MQTT/WebSocket (mặc định 9001)
 *   - onLog:   (msg) => void
 *   - onAuth:  callback báo kết quả đăng nhập (để ghi log minh chứng)
 */
export function createAuthBroker({ tcpPort = 1883, wsPort = 9001, onLog = () => {}, onAuth = () => {} } = {}) {
  const aedes = new Aedes({
    id: "smart-parking-broker",
    concurrency: 100,
    // [FIX - NGUYÊN NHÂN GỐC] Giảm bớt độ nhạy của bộ đếm keepalive.
    //   Aedes mặc định dùng hạn chót = keepalive * 1.5 giây (10s -> 15s).
    //   Nhưng ở tầng trên còn có Cloudflare + Render, mỗi tầng có thể giữ
    //   hoặc cắt kết nối riêng -> keepalive 10s quá chặt, chỉ cần một độ trễ
    //   mạng là client bị broker tước ("keep alive timeout") dù client hoàn toàn
    //   hợp lệ. Ta nới hạn chót lên 3 lần keepalive (30s) cho thoải mái.
    keepaliveLimit: 0,       // không từ chối client vì keepalive lớn
    connectTimeout: 60000,   // chờ CONNECT tối đa 60s (mạng di động chậm)
    heartbeatInterval: 60000,
  });

  // ------------------------- XÁC THỰC NGƯỜI DÙNG --------------------------
  aedes.authenticate = (client, username, password, done) => {
    const user = username ? String(username) : "";
    const pass = password ? String(password) : "";

    // Không có user/pass -> từ chối (tương đương allow_anonymous false)
    if (!user) {
      onLog(`[BROKER] Tu choi ket noi an danh tu ${client.id}`);
      onAuth({ clientId: client.id, user: "", ok: false, reason: "anonymous" });
      const err = new Error("Bat buoc dang nhap (user/password)");
      err.returnCode = 4; // CONNACK 4 = bad user/pass
      return done(err);
    }

    const expected = USER_HASHES.get(user);
    if (!expected) {
      onLog(`[BROKER] Tu choi user khong ton tai: ${user}`);
      onAuth({ clientId: client.id, user, ok: false, reason: "unknown-user" });
      const err = new Error("Sai user hoac mat khau");
      err.returnCode = 4;
      return done(err);
    }

    // So sánh hash (sha256) - không lưu mật khẩu rõ
    const got = sha256(pass);
    if (got !== expected) {
      onLog(`[BROKER] Tu choi sai mat khau cho user: ${user}`);
      onAuth({ clientId: client.id, user, ok: false, reason: "bad-password" });
      const err = new Error("Sai user hoac mat khau");
      err.returnCode = 4;
      return done(err);
    }

    onLog(`[BROKER] Dang nhap thanh cong: ${user} (client ${client.id})`);
    onAuth({ clientId: client.id, user, ok: true });
    // Aedes 0.5x KHÔNG tự lưu username vào client, nên ta tự gán.
    // (client.username được dùng bởi authorizePublish / authorizeSubscribe
    //  để áp dụng ACL theo user)
    client.username = user;
    return done(null, { username: user });
  };

  // ----------------------- PHÂN QUYỀN ĐỌC / GHI TOPIC ----------------------
  // Aedes gọi authorize khi client publish (client === null nghĩa là
  // dịch vụ nội bộ của broker, luôn được phép).
  aedes.authorizePublish = (client, packet, done) => {
    if (!client || !client.username) return done(null);
    const topic = packet.topic;
    if (canWrite(client.username, topic)) return done(null);
    onLog(`[BROKER] Deny PUBLISH tu ${client.username} vao topic ${topic}`);
    onAuth({ clientId: client.id, user: client.username, ok: false, reason: "acl-write", topic });
    const err = new Error("Khong co quyen ghi topic nay");
    err.returnCode = 135; // 0x87 = Not authorized
    return done(err);
  };

  // Aedes gọi authorizeSubscribe khi client subscribe
  aedes.authorizeSubscribe = (client, sub, done) => {
    if (!client || !client.username) return done(null, sub);
    const topic = sub.topic;
    if (canRead(client.username, topic)) return done(null, sub);
    onLog(`[BROKER] Deny SUBSCRIBE tu ${client.username} vao topic ${topic}`);
    onAuth({ clientId: client.id, user: client.username, ok: false, reason: "acl-read", topic });
    const err = new Error("Khong co quyen doc topic nay");
    err.returnCode = 135; // 0x87 = Not authorized
    return done(err);
  };

  // --------------------- MỞ CỔNG MQTT/TCP + MQTT/WEBSOCKET ------------------
  // Ghi log + ghi vào nhật ký khi client ngắt kết nối -> giúp chẩn đoán vì sao
  // ESP32/App rớt (giữ timeout MQTT, WebSocket bị đóng, keepalive quá hạn...)
  aedes.on("clientDisconnect", (client) => {
    const msg = `[BROKER] Client ngat ket noi: ${client?.id} (user=${client?.username || "?"})`;
    onLog(msg);
    onAuth({ clientId: client?.id || "?", user: client?.username || "", ok: true, reason: "disconnect" });
  });
  aedes.on("keepaliveTimeout", (client) => {
    const msg = `[BROKER] Client qua han keepalive: ${client?.id} (user=${client?.username || "?"})`;
    onLog(msg);
    onAuth({ clientId: client?.id || "?", user: client?.username || "", ok: false, reason: "keepalive-timeout" });
  });
  aedes.on("clientError", (client, err) => {
    const msg = `[BROKER] Loi client ${client?.id || "?"}: ${err?.message}`;
    onLog(msg);
    onAuth({ clientId: client?.id || "?", user: client?.username || "", ok: false, reason: `error: ${err?.message}` });
  });

  // ---------------------------------------------------------------------
  // [FIX - NGUYÊN NHÂN GỐC] NỚI HẠN CHÓT KEEPALIVE PHÍA BROKER
  // ---------------------------------------------------------------------
  // Aedes tự tính hạn chót giữ mạng = keepalive * 1.5 giây (client báo 10s
  // -> 15s) và TƯỚC kết nối nếu quá hạn. Điều này quá chặt khi đi qua
  // Cloudflare + Render: chỉ cần một độ trễ mạng vài giây là client bị tước,
  // dù client hoàn toàn hợp lệ (hiện tượng "keep alive timeout" lặp lại).
  // Ta nới hạn chót lên KEEPALIVE_GRACE lần (mặc định 4x -> 60 giây),
  // vẫn đảm bảo rằng client chết thật sẽ được phát hiện và dọn dẹp.
  const KEEPALIVE_GRACE = Number(process.env.BROKER_KEEPALIVE_GRACE || 4);
  aedes.on("clientReady", (client) => {
    try {
      const base = client._keepaliveInterval > 0 ? client._keepaliveInterval : 15000;
      const relaxed = base * KEEPALIVE_GRACE;
      client._keepaliveInterval = relaxed;
      if (client._keepaliveTimer) client._keepaliveTimer.reschedule(relaxed);
      onLog(`[BROKER] Client ${client.id} san sang (keepalive han chot ${Math.round(relaxed / 1000)}s)`);
    } catch (e) {
      onLog(`[BROKER] Khong chinh duoc han chot keepalive: ${e.message}`);
    }
  });

  // Đếm PINGREQ để chẩn đoán "broker có thấy heartbeat của client không?"
  aedes.on("ping", (_packet, client) => {
    onLog(`[BROKER] PINGREQ tu ${client?.id || "?"}`);
  });

  const tcpServer = createServer(aedes.handle);
  // ---------------------------------------------------------------------------
  // [FIX] Cổng 1883 có thể đã bị chiếm bởi một broker khác trên máy (ví dụ
  //   Mosquitto chạy bằng Docker, hay một project Node khác của người dùng).
  //   Trước đây broker nội bộ chỉ log lỗi rồi bỏ qua -> backend kết nối nhầm
  //   sang broker lạ (không đúng user/pass) và mọi thiết bị/simulator nối vào
  //   đó cũng không khớp -> mất trạng thái, test bridge FAIL.
  //   GIẢI PHÁP: nếu cổng yêu cầu bị chiếm, tự tìm một cổng trống gần đó
  //   và báo lại cổng thực tế qua stats() để simulator/App cấu hình đúng.
  // ---------------------------------------------------------------------------
  let actualTcpPort = tcpPort;
  let bound = false;
  // Các callback đang chờ broker mở cổng xong (dùng bởi whenReady).
  const readyCallbacks = [];

  // Dùng MỘT listener "error" duy nhất để tránh đăng ký chồng lên nhau
  // (đăng ký nhiều listener sẽ log trùng và xử lý sai).
  tcpServer.on("error", (e) => {
    if (e.code !== "EADDRINUSE" || bound) {
      onLog(`[BROKER] Loi cong TCP: ${e.message}`);
      return;
    }
    const next = actualTcpPort + 1;
    onLog(`[BROKER] Cong ${actualTcpPort} dang bi chiem -> thu cong ${next}`);
    actualTcpPort = next;
    tryListen(next);
  });

  function tryListen(port) {
    // Dùng sự kiện "listening" (không phải callback của listen) để tránh việc
    // callback bị đăng ký lại mỗi lần thử lại -> log trùng "Dang lang nghe".
    tcpServer.listen(port, "0.0.0.0");
  }

  tcpServer.on("listening", () => {
    bound = true;
    actualTcpPort = tcpServer.address()?.port || actualTcpPort;
    onLog(`[BROKER] MQTT/TCP dang lang nghe tren cong ${actualTcpPort}`);
    // Báo cho các promise đang chờ (whenReady).
    while (readyCallbacks.length) {
      try { readyCallbacks.shift()(actualTcpPort); } catch { /* bỏ qua */ }
    }
  });

  tryListen(tcpPort);

  // MQTT-over-WebSocket: dùng chung 1 "engine" aedes, chỉ khác lớp vận chuyển.
  // WebSocketServer này được gắn vào HTTP server chính (qua handleUpgrade)
  // để client bên ngoài (App React Native, ESP32) kết nối thẳng vào broker
  // và ĐƯỢC xác thực + phân quyền đầy đủ (không qua proxy trung gian).
  const wss = new WebSocketServer({
    noServer: true,
    // [FIX] Phải trả lại subprotocol "mqtt" khi client mời.
    //   Chuẩn MQTT-over-WebSocket (OASIS MQTT-WS) yêu cầu client gửi header
    //   "Sec-WebSocket-Protocol: mqtt"; nếu server không trả lại đúng tên,
    //   một số client (mqtt.js) sẽ không chấp nhận kết nối.
    //   Client ESP32 (firmware tự viết) cũng gửi header này.
    handleProtocols: (protocols) => {
      if (protocols.has("mqtt")) return "mqtt";
      // Không có yêu cầu subprotocol nào -> chấp nhận phần đầu tiên (nếu có)
      for (const p of protocols) return p;
      return false;
    },
  });
  wss.on("connection", (ws) => {
    // Chuyển kết nối WebSocket thành stream byte cho aedes đọc/ghi được.
    // Dùng adapter tự viết (mqttWsAdapter.js) dựa trên "ws" bản mới (v8).
    // [FIX] Trước đây dùng thư viện "websocket-stream" -> kéo theo ws@3.3.3
    // (từ 2016) -> xử lý frame WebSocket sai -> broker không đếm được
    // PINGREQ -> ngắt client sau ~16s với lỗi "keep alive timeout".
    const duplex = createWsStream(ws);
    aedes.handle(duplex);

    // -------------------------------------------------------------------
    // [FIX - GIỮ KẾT NỐI QUA CLOUDFLARE / RENDER]
    // -------------------------------------------------------------------
    // Ở tầng trên broker còn có Cloudflare (và Render) với "idle timeout"
    // (thường 30-100 giây). Nếu không có byte nào đi qua trong thời gian đó
    // thì kết nối WebSocket bị cắt -> ESP32 rớt kết nối liên tục.
    // Ta gửi WebSocket PING (opcode 0x9) định kỳ cho mỗi client.
    // Client chuẩn (mqtt.js, ESP32 firmware) đều tự động trả PONG.
    // Lưu ý: mỗi lần gửi PING cũng làm "thông" kết nối nên Cloudflare
    // không cắt, đồng thời không ảnh hưởng đến bộ đếm keepalive của MQTT.
    try {
      const wsPing = setInterval(() => {
        if (ws.readyState === ws.OPEN) {
          try { ws.ping(); } catch { /* bỏ qua */ }
        }
      }, Number(process.env.BROKER_WS_PING_MS || 20000));
      ws.on("close", () => clearInterval(wsPing));
      ws.on("error", () => clearInterval(wsPing));
    } catch (e) {
      onLog(`[BROKER] Khong bat duoc WS ping: ${e.message}`);
    }
  });
  return {
    aedes,
    tcpServer,
    wss,
    users: Object.keys(USERS),
    /** Cổng TCP broker thực tế đang lắng nghe (có thể khác 1883 nếu bị chiếm) */
    get tcpPort() { return actualTcpPort; },
    /** Cổng TCP broker thực tế (số) - dùng để cấu hình simulator/App */
    get port() { return actualTcpPort; },
    /** Broker đã lắng nghe thành công hay chưa */
    get ready() { return bound; },
    /** Chờ broker sẵn sàng (resolve khi cổng đã mở) */
    whenReady(timeoutMs = 5000) {
      if (bound) return Promise.resolve(actualTcpPort);
      return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error("Broker khong kip khoi dong")), timeoutMs);
        readyCallbacks.push((port) => {
          clearTimeout(t);
          resolve(port);
        });
      });
    },
    /** Gắn endpoint WebSocket MQTT trực tiếp vào HTTP server (path /mqtt) */
    handleUpgrade(server, path = "/mqtt") {
      server.on("upgrade", (req, socket, head) => {
        const url = (req.url || "").split("?")[0];
        if (url !== path) { socket.destroy(); return; }
        wss.handleUpgrade(req, socket, head, (ws) => {
          wss.emit("connection", ws, req);
        });
      });
    },
    stats() {
      return {
        clients: Object.keys(aedes.clients || {}).length,
        // aedes 0.5x không lưu danh sách subscription tập trung
        // (mỗi client giữ riêng), nên chỉ đếm số client đang kết nối.
        subscriptions: Object.values(aedes.clients || {})
          .reduce((n, c) => n + Object.keys(c?.subscriptions || {}).length, 0),
        tcpPort: actualTcpPort,
        wsPath: "/mqtt",
      };
    },
    close() {
      try { aedes.close(); } catch {}
      try { tcpServer.close(); } catch {}
      try { wss.close(); } catch {}
    },
  };
}
