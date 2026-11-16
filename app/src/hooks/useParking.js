// ============================================================================
//  HOOK useParking - Gom toàn bộ logic MQTT realtime + quản lý trạng thái
//  Tách khỏi component để App.js chỉ còn lo render.
//  ---------------------------------------------------------------------------
//  onEvent(type, data) được gọi khi nhận message MQTT:
//    conn         -> boolean (true = đang kết nối)
//    status       -> { id, occupied, reservedBy, currentUser }
//    snapshot     -> { slots: [...], gate }
//    bookingState -> { slot, state, user, requestId, ok, msg }
//    gate         -> { gate, openedBy }
//    rfid         -> { card, slot, event }
//    receipt      -> { slot, user, minutes, fee }
// ============================================================================

import { useEffect, useRef, useState, useCallback } from 'react';
import { Alert } from 'react-native';
import {
  connectParking, loadCfg, saveCfg, reserveSlot, cancelSlot, gateCmd,
  DEFAULT_CFG, resolveMqttUrl,
} from '../parkingMqtt';
import * as API from '../api';
import { BOOKING_TIMEOUT_MS } from '../constants';

export function useParking() {
  const [cfg, setCfg] = useState({ ...DEFAULT_CFG });
  const [online, setOnline] = useState(false);
  const [slots, setSlots] = useState({});
  const [gate, setGate] = useState('CLOSED');
  const [log, setLog] = useState([]);
  const [pending, setPending] = useState({});
  const [stats, setStats] = useState(null);
  const [receipts, setReceipts] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [users, setUsers] = useState([]);
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);

  const client = useRef(null);
  const pendingRef = useRef({});

  const pushLog = useCallback((m) => {
    setLog((l) => [`${new Date().toLocaleTimeString()} ${m}`, ...l].slice(0, 40));
  }, []);

  // -------------------------- Tai du lieu REST -----------------------------
  const refreshRemote = useCallback(async () => {
    try {
      const [s, r, b, u] = await Promise.all([
        API.getStatus().catch(() => null),
        API.getReceipts(50).catch(() => []),
        API.getBookings(50).catch(() => []),
        API.getUsers().catch(() => []),
      ]);
      if (s) setStats(s);
      setReceipts(r || []); setBookings(b || []); setUsers(u || []);
    } catch { /* backend chua chay -> bo qua */ }
  }, []);

  const loadStats = useCallback(async () => {
    try { setStats(await API.getStats()); } catch { /* ignore */ }
  }, []);

  // -------------------------- Khoi tao / khoi dong lai MQTT -----------------
  const start = useCallback((c) => {
    try { client.current?.end(); } catch {}
    const cl = connectParking(c, (type, d) => {
      if (type === 'conn') {
        setOnline(d);
        pushLog(d ? 'Đã kết nối Broker' : 'Mất kết nối Broker');
      } else if (type === 'status') {
        setSlots((s) => ({ ...s, [d.id]: d }));
      } else if (type === 'snapshot') {
        const o = {};
        for (const x of d.slots || []) o[x.id] = x;
        setSlots((s) => ({ ...s, ...o }));
        setGate(d.gate || 'CLOSED');
      } else if (type === 'gate') {
        setGate(d.gate);
      } else if (type === 'bookingState') {
        // Chi xu ly khi requestId khop lenh ta vua gui
        if (d.requestId && pendingRef.current[d.requestId]) {
          setPending((p) => { const n = { ...p }; delete n[d.requestId]; return n; });
          delete pendingRef.current[d.requestId];
          Alert.alert(d.ok ? '✅ Thành công' : '❌ Thất bại', d.msg || d.state);
        } else if (d.requestId) {
          pushLog(`Đặt chỗ ${d.slot}: ${d.msg}`);
        }
        if (['FREE', 'RESERVED', 'OCCUPIED', 'EXPIRED'].includes(d.state)) {
          setSlots((s) => ({
            ...s,
            [d.slot]: {
              ...s[d.slot],
              id: d.slot,
              reservedBy: (d.state === 'FREE' || d.state === 'EXPIRED')
                ? null
                : (s[d.slot]?.reservedBy || d.user),
            },
          }));
        }
        if (d.state === 'EXPIRED') pushLog(`⏰ ${d.slot}: ${d.msg}`);
      } else if (type === 'receipt') {
        Alert.alert('🧾 Thanh toán', `Ô ${d.slot}: ${d.minutes} phút - ${new Intl.NumberFormat('vi-VN').format(d.fee || 0)}đ`);
        pushLog(`Thu ${d.fee}đ ô ${d.slot}`);
        refreshRemote();
      } else if (type === 'rfid') {
        pushLog(`RFID ${d.card || ''} ${d.event || ''} ${d.slot || ''}`);
      }
    });
    client.current = cl;
  }, [pushLog, refreshRemote]);

  // Khoi tao 1 lan khi mo App
  useEffect(() => {
    (async () => {
      const c = await loadCfg();
      API.setApiBase(c.base);
      setCfg(c);
      start(c);
    })();
    return () => { try { client.current?.end(); } catch {} };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { refreshRemote(); loadStats(); }, [refreshRemote, loadStats]);

  // -------------------------- Thao tac dat cho -----------------------------
  const doReserve = useCallback((id) => {
    if (!client.current) return;
    const requestId = reserveSlot(client.current, id, cfg.myId);
    pendingRef.current[requestId] = id;
    setPending((p) => ({ ...p, [requestId]: id }));
    pushLog(`Gửi đặt ${id}...`);
    // Timeout: khong co phan hoi -> bao loi ro rang cho nguoi dung
    setTimeout(() => setPending((p) => {
      if (p[requestId]) {
        const n = { ...p }; delete n[requestId];
        delete pendingRef.current[requestId];
        pushLog(`Đặt ${id} TIMEOUT - kiểm tra Broker`);
        Alert.alert('Timeout', 'Không nhận phản hồi từ bãi. Kiểm tra kết nối Broker.');
        return n;
      }
      return p;
    }), BOOKING_TIMEOUT_MS);
  }, [cfg.myId, pushLog]);

  const doCancel = useCallback((id) => {
    try { cancelSlot(client.current, id, cfg.myId); } catch {}
  }, [cfg.myId]);

  const doGate = useCallback((cmd) => {
    try { gateCmd(client.current, cmd, cfg.myId); } catch {}
  }, [cfg.myId]);

  const doEnter = useCallback((id) => {
    API.postEnter(id, cfg.myId).catch(() => {});
  }, [cfg.myId]);

  const doExit = useCallback((id) => {
    API.postExit(id, cfg.myId).catch(() => {});
  }, [cfg.myId]);

  // Luu cau hinh + ket noi lai
  const applyCfg = useCallback((c) => {
    API.setApiBase(c.base);
    setCfg(c);
    saveCfg(c);
    start(c);
  }, [start]);

  const login = useCallback((u, t) => { setUser(u); setToken(t); }, []);
  const logout = useCallback(() => { setUser(null); setToken(null); }, []);

  return {
    // trạng thái
    cfg, online, slots, gate, log, pending, stats, receipts, bookings, users, user, token,
    // hành động
    start, applyCfg, doReserve, doCancel, doGate, doEnter, doExit,
    loadStats, refreshRemote, login, logout,
    // tiện ích
    mqttUrl: resolveMqttUrl(cfg),
  };
}
