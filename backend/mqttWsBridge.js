// ============================================================================
//  MQTT-over-WebSocket BRIDGE
//  ---------------------------------------------------------------------------
//  VAN DE: App React Native (Expo) chi ket noi duoc MQTT qua WebSocket (ws/wss).
//  Broker public (test.mosquitto.org) thi co port 1883 + 443 nhung KHONG bat
//  WebSocket 8084 -> App khong ket noi duoc broker cloud.
//
//  GIAI PHAP: Backend lam nhiem vu "MQTT WebSocket proxy":
//    App --wss://server/mqtt--> BRIDGE (backend) --mqtt://broker:1883--> Broker
//
//  - 1 ket noi MQTT duy nhuc xuong broker, chia se cho moi App client.
//  - Ho tro CONNECT / SUBSCRIBE / UNSUBSCRIBE / PUBLISH / PINGREQ / DISCONNECT.
//  - Tu phat lai (retain) cac topic dang subscribe -> App mo app lai thay
//    trang thai ngay lap tuc.
//  - Tu phong doi trong: moi App client chi nhan topic no da subscribe.
// ============================================================================

import { WebSocketServer } from "ws";

// --------------------------- CONSTANT MQTT ----------------------------------
const PKT = {
  CONNECT: 1, CONNACK: 2, PUBLISH: 3, PUBACK: 4,
  PUBREC: 5, PUBREL: 6, PUBCOMP: 7,
  SUBSCRIBE: 8, SUBACK: 9, UNSUBSCRIBE: 10, UNSUBACK: 11,
  PINGREQ: 12, PINGRESP: 13, DISCONNECT: 14,
};

function encodeLength(len) {
  const out = [];
  do {
    let b = len % 128;
    len = Math.floor(len / 128);
    if (len > 0) b |= 0x80;
    out.push(b);
  } while (len > 0);
  return Buffer.from(out);
}

function encodePacket(type, flags, payload) {
  const body = payload || Buffer.alloc(0);
  const head = Buffer.from([(type << 4) | (flags & 0x0f)]);
  return Buffer.concat([head, encodeLength(body.length), body]);
}

function encodeString(str) {
  const b = Buffer.from(str, "utf8");
  const len = Buffer.alloc(2);
  len.writeUInt16BE(b.length);
  return Buffer.concat([len, b]);
}

// So sanh topic filter voi topic thuoc (MQTT 3.1.1 wildcard + va #)
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

/**
 * Tao bridge WebSocket -> MQTT.
 * @param {object} opts
 *   - path: duong dan WebSocket (mac dinh "/mqtt")
 *   - brokerUrl, username, password
 *   - onLog: (msg) => void
 */
export function createMqttWsBridge({ mqtt, path = "/mqtt", brokerUrl, username, password, onLog = () => {} }) {
  const wss = new WebSocketServer({ noServer: true });

  // Ket noi MQTT duy nhuc xuong broker (chia se cho tat ca App client)
  const upstream = mqtt.connect(brokerUrl, {
    username: username || undefined,
    password: password || undefined,
    clientId: `bridge-${process.pid}-${Date.now().toString(36)}`,
    reconnectPeriod: 2000,
    clean: false,
  });

  // Topic -> Set<client> (client da subscribe topic do)
  const subscriptions = new Map(); // filter -> Set<client>
  // Cache message cuoi cung theo topic (phuc vu retain + App moi join)
  const cache = new Map(); // topic -> {payload, qos}
  const clients = new Set();

  function deliver(topic, payload, qos = 0) {
    const buf = Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload));
    for (const [filter, set] of subscriptions) {
      if (!topicMatches(filter, topic)) continue;
      for (const c of set) sendPublish(c, topic, buf, qos);
    }
  }

  upstream.on("connect", () => {
    onLog(`[BRIDGE] Upstream MQTT connected ${brokerUrl}`);
    const filters = new Set(subscriptions.keys());
    if (filters.size) upstream.subscribe([...filters], { qos: 0 });
  });
  upstream.on("reconnect", () => onLog("[BRIDGE] Upstream MQTT reconnecting..."));
  upstream.on("error", (e) => onLog(`[BRIDGE] Upstream MQTT error: ${e.message}`));
  upstream.on("message", (topic, payload, packet) => {
    cache.set(topic, { payload: Buffer.from(payload), qos: packet?.qos || 0 });
    deliver(topic, payload, packet?.qos || 0);
  });

  function sendPublish(client, topic, payload, qos = 0) {
    if (client.ws.readyState !== 1) return;
    const head = Buffer.concat([
      encodeString(topic),
      ...(qos > 0 ? [Buffer.from([0, 0])] : []),
    ]);
    const flags = (qos << 1) | (client.retainOnPublish ? 1 : 0);
    client.ws.send(encodePacket(PKT.PUBLISH, flags, Buffer.concat([head, payload])));
  }

  function sendConnAck(client) {
    client.ws.send(encodePacket(PKT.CONNACK, 0, Buffer.from([0x00, 0x00])));
  }
  function sendSubAck(client, packetId, codes) {
    client.ws.send(encodePacket(PKT.SUBACK, 0, Buffer.concat([packetId, Buffer.from(codes)])));
  }
  function sendUnsubAck(client, packetId) {
    client.ws.send(encodePacket(PKT.UNSUBACK, 0, packetId));
  }
  function sendPingResp(client) {
    client.ws.send(encodePacket(PKT.PINGRESP, 0, Buffer.alloc(0)));
  }

  function removeClient(client) {
    clients.delete(client);
    for (const set of subscriptions.values()) set.delete(client);
    onLog(`[BRIDGE] Client disconnected (con ${clients.size} client)`);
  }

  // --------------------------- XU LY PACKET MQTT ------------------------------
  function handlePacket(client, type, flags, payload) {
    switch (type) {
      case PKT.CONNECT: {
        sendConnAck(client);
        break;
      }
      case PKT.SUBSCRIBE: {
        if (payload.length < 2) return;
        const packetId = payload.subarray(0, 2);
        let off = 2;
        const codes = [];
        const added = [];
        while (off < payload.length) {
          const tlen = payload.readUInt16BE(off);
          const topic = payload.subarray(off + 2, off + 2 + tlen).toString("utf8");
          const qos = payload[off + 2 + tlen] & 0x03;
          off += 2 + tlen + 1;
          codes.push(qos);
          if (!subscriptions.has(topic)) subscriptions.set(topic, new Set());
          subscriptions.get(topic).add(client);
          added.push(topic);
        }
        // Subscribe len broker (dung chung 1 ket noi) + day lai cache retained
        if (added.length) upstream.subscribe(added, { qos: 0 });
        for (const [t, v] of cache) {
          if (added.some((f) => topicMatches(f, t))) {
            sendPublish(client, t, v.payload, 0);
          }
        }
        sendSubAck(client, packetId, codes);
        break;
      }
      case PKT.UNSUBSCRIBE: {
        if (payload.length < 2) return;
        const packetId = payload.subarray(0, 2);
        let off = 2;
        while (off < payload.length) {
          const tlen = payload.readUInt16BE(off);
          const topic = payload.subarray(off + 2, off + 2 + tlen).toString("utf8");
          off += 2 + tlen;
          const set = subscriptions.get(topic);
          if (set) { set.delete(client); if (!set.size) subscriptions.delete(topic); }
        }
        sendUnsubAck(client, packetId);
        break;
      }
      case PKT.PUBLISH: {
        const tlen = payload.readUInt16BE(0);
        const topic = payload.subarray(2, 2 + tlen).toString("utf8");
        let off = 2 + tlen;
        const qos = (flags >> 1) & 0x03;
        if (qos > 0) off += 2; // bo qua packetId
        const data = payload.subarray(off);
        const retain = !!(flags & 0x01);
        upstream.publish(topic, data, { qos, retain }, (err) => {
          if (err) onLog(`[BRIDGE] Publish loi ${topic}: ${err.message}`);
        });
        if (retain) cache.set(topic, { payload: Buffer.from(data), qos });
        break;
      }
      case PKT.PINGREQ:
        sendPingResp(client);
        break;
      case PKT.DISCONNECT:
        client.ws.close();
        break;
      default:
        break;
    }
  }

  function attach(ws) {
    const client = { ws, retainOnPublish: false };
    clients.add(client);
    onLog(`[BRIDGE] Client connected (con ${clients.size} client)`);

    let buf = Buffer.alloc(0);
    ws.on("message", (raw) => {
      buf = Buffer.concat([buf, Buffer.isBuffer(raw) ? raw : Buffer.from(raw)]);
      while (buf.length >= 2) {
        const type = buf[0] >> 4;
        const flags = buf[0] & 0x0f;
        // doc remaining length (varint)
        let multiplier = 1;
        let len = 0;
        let pos = 1;
        let complete = false;
        while (pos < buf.length) {
          len += (buf[pos] & 0x7f) * multiplier;
          multiplier *= 128;
          pos++;
          if ((buf[pos - 1] & 0x80) === 0) { complete = true; break; }
        }
        if (!complete) return;
        if (buf.length < pos + len) return;
        const payload = buf.subarray(pos, pos + len);
        buf = buf.subarray(pos + len);
        try { handlePacket(client, type, flags, payload); }
        catch (e) { onLog(`[BRIDGE] Loi xu ly packet: ${e.message}`); }
      }
    });

    ws.on("close", () => removeClient(client));
    ws.on("error", () => removeClient(client));
  }

  return {
    wss,
    attach,
    /** Gan vao HTTP server: GET /mqtt -> WebSocket upgrade */
    handleUpgrade(server) {
      server.on("upgrade", (req, socket, head) => {
        const url = (req.url || "").split("?")[0];
        if (url !== path) { socket.destroy(); return; }
        wss.handleUpgrade(req, socket, head, (ws) => attach(ws));
      });
    },
    stats() {
      return {
        clients: clients.size,
        subscriptions: [...subscriptions.keys()],
        cachedTopics: cache.size,
        upstreamConnected: upstream.connected,
      };
    },
    close() {
      try { upstream.end(true); } catch {}
      try { wss.close(); } catch {}
    },
  };
}
