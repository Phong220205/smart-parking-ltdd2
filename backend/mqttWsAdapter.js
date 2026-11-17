// ============================================================================
//  ADAPTER: WebSocket -> luồng byte cho broker MQTT (aedes)
//  ---------------------------------------------------------------------------
//  VÌ SAO KHÔNG DÙNG THƯ VIỆN "websocket-stream"?
//    Thư viện đó (từ năm 2016) phụ thuộc ws@3.3.3 - phiên bản rất cũ, có
//    nhiều lỗi xử lý WebSocket frame. Khi chạy sau Cloudflare (Render), nó
//    hay để lọt frame sai -> broker nhận dữ liệu rác -> không đếm được
//    PINGREQ -> báo "keep alive timeout" và ngắt client sau ~16 giây.
//
//  GIẢI PHÁP: tự viết adapter nhỏ, dùng thư viện "ws" bản mới (v8) đã cài
//  sẵn cho backend. Adapter biến kết nối WebSocket thành một luồng byte
//  hai chiều mà aedes đọc/ghi được như một socket TCP thật.
//
//    chiều VÀO  (client -> broker): WebSocket "message" -> stream.push()
//    chiều RA  (broker -> client): stream.write() -> WebSocket "send"
//
//  LƯU Ý KỸ THUẬT RẤT QUAN TRỌNG:
//    Broker aedes đọc dữ liệu bằng conn.read(null) - tức chế độ NON-FLOWING
//    của Node. Vì vậy ta KHÔNG được gắn sự kiện 'data' vào luồng (sẽ biến
//    nó thành flowing và nuốt mất dữ liệu trước khi broker kịp đọc).
//    Dữ liệu phải được đẩy vào bằng push() và broker sẽ tự read() lấy.
// ============================================================================

import { Duplex } from "node:stream";

/**
 * Tạo một luồng byte hai chiều (net.Socket-like) từ một WebSocket của "ws".
 *
 * @param {import('ws').WebSocket} ws kết nối WebSocket phía server
 * @returns {import('node:stream').Duplex}
 */
export function createWsStream(ws) {
  let ended = false;

  const stream = new Duplex({
    // ---- chiều VÀO: broker đọc dữ liệu mà client gửi ----
    // Dữ liệu được đẩy vào bằng push() ở sự kiện "message" của WebSocket.
    read() {
      /* không làm gì: dữ liệu đã push sẵn, broker gọi read(null) để lấy */
    },

    // ---- chiều RA: broker ghi dữ liệu để gửi cho client ----
    write(chunk, _enc, cb) {
      if (ws.readyState !== ws.OPEN) {
        cb();
        return;
      }
      try {
        ws.send(Buffer.from(chunk), (err) => {
          if (err) stream.destroy(err);
          else cb();
        });
      } catch (err) {
        stream.destroy(err);
      }
    },

    final(cb) {
      ended = true;
      try {
        if (ws.readyState === ws.OPEN) ws.close();
      } catch {
        /* bỏ qua */
      }
      cb();
    },

    destroy(err, cb) {
      ended = true;
      try {
        if (ws.readyState === ws.OPEN) ws.close();
      } catch {
        /* bỏ qua */
      }
      cb(err);
    },
  });

  // ---- chiều VÀO: WebSocket "message" -> đẩy vào luồng cho broker đọc ----
  ws.on("message", (data) => {
    if (ended) return;
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
    stream.push(buf);
  });

  // ---- WebSocket đóng -> báo cho broker "hết dữ liệu" ----
  ws.on("close", () => {
    if (!ended) {
      ended = true;
      stream.push(null); // báo EOF cho broker
    }
  });

  ws.on("error", (err) => {
    if (!ended) {
      ended = true;
      stream.destroy(err);
    }
  });

  // aedes có thể gọi setTimeout(0) để tắt timeout -> no-op an toàn.
  stream.setTimeout = () => stream;
  stream.setNoDelay = () => stream;
  stream.setKeepAlive = () => stream;

  return stream;
}
