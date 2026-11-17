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
import websocketStream from "websocket-stream";

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

  const tcpServer = createServer(aedes.handle);
  tcpServer.listen(tcpPort, "0.0.0.0", () => {
    onLog(`[BROKER] MQTT/TCP dang lang nghe tren cong ${tcpPort}`);
  });
  tcpServer.on("error", (e) => {
    // Cổng đã bị chiếm (ví dụ máy đang chạy Docker Mosquitto) -> không chết
    onLog(`[BROKER] Khong mo duoc cong TCP ${tcpPort}: ${e.message}`);
  });

  // MQTT-over-WebSocket: dùng chung 1 "engine" aedes, chỉ khác lớp vận chuyển.
  // WebSocketServer này được gắn vào HTTP server chính (qua handleUpgrade)
  // để client bên ngoài (App React Native, ESP32) kết nối thẳng vào broker
  // và ĐƯỢC xác thực + phân quyền đầy đủ (không qua proxy trung gian).
  const wss = new WebSocketServer({ noServer: true });
  wss.on("connection", (ws) => {
    // Chuyển kết nối WebSocket thành stream byte cho aedes đọc/ghi được.
    // websocket-stream làm đúng việc này (tương thích với net.Socket mà
    // aedes yêu cầu: có setTimeout, setMaxListeners, pipe...).
    const duplex = websocketStream(ws);
    aedes.handle(duplex);
  });
  return {
    aedes,
    tcpServer,
    wss,
    users: Object.keys(USERS),
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
        tcpPort,
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
