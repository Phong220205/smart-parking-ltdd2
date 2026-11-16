// ============================================================================
//  APP SMART PARKING - React Native (Expo)
//  Man hinh: Bãi (parking) | Lịch sử | Thống kê | Tài khoản
//  Realtime: MQTT (parkingMqtt.js) - Backend REST (api.js) cho thong ke
// ============================================================================

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert, TextInput,
  ScrollView, RefreshControl, ActivityIndicator,
} from 'react-native';
import { connectParking, loadCfg, saveCfg, reserveSlot, cancelSlot, gateCmd, DEFAULT_CFG, resolveMqttUrl } from './parkingMqtt';
import * as API from './api';

const FEE = 3000;
const FREE_MIN = 30;
const SLOT_IDS = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'];

const slotColor = (s, mine) =>
  s.occupied ? '#e74c3c' : (s.reservedBy ? (s.reservedBy === mine ? '#f1c40f' : '#e67e22') : '#2ecc71');
const slotLabel = (s, mine) =>
  s.occupied ? 'CÓ XE' : (s.reservedBy ? (s.reservedBy === mine ? 'BẠN ĐẶT' : 'ĐÃ ĐẶT') : 'TRỐNG');

const money = (n) => new Intl.NumberFormat('vi-VN').format(n || 0) + 'đ';
const fmtTime = (ts) => (ts ? new Date(ts).toLocaleString('vi-VN') : '-');

// =============================== MAN HINH ====================================
export default function App() {
  const [tab, setTab] = useState('parking');
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
  const [refreshing, setRefreshing] = useState(false);
  const client = useRef(null);
  const pendingRef = useRef({});

  const pushLog = useCallback((m) => {
    setLog((l) => [`${new Date().toLocaleTimeString()} ${m}`, ...l].slice(0, 40));
  }, []);

  // -------------------------- Khoi tao MQTT -------------------------------
  const start = useCallback((c) => {
    try { client.current?.end(); } catch {}
    const cl = connectParking(c, (type, d) => {
      if (type === 'conn') setOnline(d);
      else if (type === 'status') setSlots((s) => ({ ...s, [d.id]: d }));
      else if (type === 'snapshot') {
        const o = {};
        for (const x of d.slots || []) o[x.id] = x;
        setSlots((s) => ({ ...s, ...o }));
        setGate(d.gate || 'CLOSED');
      }
      else if (type === 'gate') setGate(d.gate);
      else if (type === 'bookingState') {
        if (d.requestId && pendingRef.current[d.requestId]) {
          setPending((p) => { const n = { ...p }; delete n[d.requestId]; return n; });
          delete pendingRef.current[d.requestId];
          Alert.alert(d.ok ? '✅ Thành công' : '❌ Thất bại', d.msg || d.state);
        } else if (d.requestId) {
          pushLog(`Đặt chỗ ${d.slot}: ${d.msg}`);
        }
        if (d.state === 'FREE' || d.state === 'RESERVED' || d.state === 'OCCUPIED' || d.state === 'EXPIRED') {
          setSlots((s) => ({
            ...s,
            [d.slot]: {
              ...s[d.slot],
              id: d.slot,
              reservedBy: (d.state === 'FREE' || d.state === 'EXPIRED') ? null : (s[d.slot]?.reservedBy || d.user),
            },
          }));
        }
        if (d.state === 'EXPIRED') pushLog(`⏰ ${d.slot}: ${d.msg}`);
      }
      else if (type === 'receipt') {
        Alert.alert('🧾 Thanh toán', `Ô ${d.slot}: ${d.minutes} phút - ${money(d.fee)}`);
        pushLog(`Thu ${money(d.fee)} ô ${d.slot}`);
        refreshRemote();
      }
      else if (type === 'rfid') pushLog(`RFID ${d.card || ''} ${d.event || ''} ${d.slot || ''}`);
    });
    client.current = cl;
  }, [pushLog]);

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

  // -------------------------- Tai du lieu REST -----------------------------
  const refreshRemote = useCallback(async () => {
    try {
      const [s, r, b, u] = await Promise.all([
        API.getStatus().catch(() => null),
        API.getReceipts(50).catch(() => []),
        API.getBookings(50).catch(() => []),
        API.getUsers().catch(() => []),
      ]);
      if (s) { setStats(s); }
      setReceipts(r || []); setBookings(b || []); setUsers(u || []);
    } catch { /* backend chua chay -> bo qua */ }
  }, []);

  const loadStats = useCallback(async () => {
    try { setStats(await API.getStats()); } catch { /* ignore */ }
  }, []);

  useEffect(() => { refreshRemote(); loadStats(); }, [refreshRemote, loadStats]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refreshRemote(), loadStats()]);
    setRefreshing(false);
  }, [refreshRemote, loadStats]);

  // -------------------------- Thao tac dat cho -----------------------------
  const doReserve = (id) => {
    if (!client.current) return;
    const requestId = reserveSlot(client.current, id, cfg.myId);
    pendingRef.current[requestId] = id;
    setPending((p) => ({ ...p, [requestId]: id }));
    pushLog(`Gửi đặt ${id}...`);
    setTimeout(() => setPending((p) => {
      if (p[requestId]) {
        const n = { ...p }; delete n[requestId];
        delete pendingRef.current[requestId];
        pushLog(`Đặt ${id} TIMEOUT - kiểm tra Broker`);
        Alert.alert('Timeout', 'Không nhận phản hồi từ bãi. Kiểm tra IP Broker.');
        return n;
      }
      return p;
    }), 5000);
  };

  const freeCount = Object.values(slots).filter((s) => !s.occupied).length;

  // =============================== RENDER ====================================
  return (
    <View style={st.root}>
      {/* HEADER */}
      <View style={st.header}>
        <Text style={st.hTitle}>🅿️ BÃI ĐỖ XE THÔNG MINH</Text>
        <View style={st.hBadges}>
          <Text style={[st.badge, { backgroundColor: online ? '#2ecc71' : '#e74c3c' }]}>
            {online ? '● ONLINE' : '○ OFFLINE'}
          </Text>
          <Text style={st.badge2}>Trống {freeCount}/6</Text>
          <Text style={st.badge2}>Barrier: {gate}</Text>
          <Text style={st.badge2}>👤 {cfg.myId}</Text>
        </View>
      </View>

      {/* TAB BAR */}
      <View style={st.tabBar}>
        {[['parking', '🅿️ Bãi'], ['history', '🧾 Lịch sử'], ['stats', '📊 Thống kê'], ['account', '👤 Tài khoản']].map(([k, l]) => (
          <TouchableOpacity key={k} style={[st.tabBtn, tab === k && st.tabBtnAct]} onPress={() => setTab(k)}>
            <Text style={[st.tabTxt, tab === k && st.tabTxtAct]}>{l}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        style={st.body}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {tab === 'parking' && (
          <ParkingTab
            slots={slots} gate={gate} cfg={cfg} log={log} pending={pending}
            onReserve={doReserve}
            onCancel={(id) => { try { cancelSlot(client.current, id, cfg.myId); } catch {} }}
            onGate={(cmd) => { try { gateCmd(client.current, cmd, cfg.myId); } catch {} }}
            onEnter={(id) => { API.postEnter(id, cfg.myId).catch(() => {}); }}
            onExit={(id) => { API.postExit(id, cfg.myId).catch(() => {}); }}
            onCfg={(c) => { API.setApiBase(c.base); setCfg(c); saveCfg(c); start(c); }}
          />
        )}

        {tab === 'history' && (
          <HistoryTab receipts={receipts} bookings={bookings} />
        )}

        {tab === 'stats' && (
          <StatsTab stats={stats} onRefresh={loadStats} />
        )}

        {tab === 'account' && (
          <AccountTab
            user={user} token={token} cfg={cfg}
            onLogin={(u, t) => { setUser(u); setToken(t); }}
            onLogout={() => { setUser(null); setToken(null); }}
            onCfg={(c) => { API.setApiBase(c.base); setCfg(c); saveCfg(c); start(c); }}
          />
        )}

        <View style={{ height: 30 }} />
      </ScrollView>
    </View>
  );
}

// =========================== TAB 1: BAI ======================================
function ParkingTab({ slots, gate, cfg, log, pending, onReserve, onCancel, onGate, onEnter, onExit, onCfg }) {
  const [showCfg, setShowCfg] = useState(false);
  const [local, setLocal] = useState(cfg);
  useEffect(() => setLocal(cfg), [cfg]);

  return (
    <View>
      {/* Luoi 6 o */}
      <View style={st.grid}>
        {SLOT_IDS.map((id) => {
          const s = { id, occupied: false, reservedBy: null, ...(slots[id] || {}) };
          const isPending = Object.values(pending).includes(id);
          return (
            <TouchableOpacity
              key={id}
              style={[st.slot, { backgroundColor: slotColor(s, cfg.myId) }, isPending && st.slotPending]}
              onPress={() => {
                if (s.occupied) {
                  Alert.alert(`Ô ${id} - CÓ XE`, 'Thao tac:', [
                    { text: '🚗 Xác nhận xe ra', onPress: () => onExit(id) },
                    { text: 'Đóng', style: 'cancel' },
                  ]);
                  return;
                }
                Alert.alert(`Ô ${id} - ${slotLabel(s, cfg.myId)}`, 'Chọn:', [
                  { text: '📌 Đặt chỗ', onPress: () => onReserve(id) },
                  { text: '✖ Hủy đặt', onPress: () => onCancel(id) },
                  { text: '🚗 Xe vào ô', onPress: () => onEnter(id) },
                  { text: 'Đóng', style: 'cancel' },
                ]);
              }}
            >
              <Text style={st.slotId}>{id}</Text>
              <Text style={st.slotSt}>{slotLabel(s, cfg.myId)}</Text>
              {!!s.reservedBy && <Text style={st.slotU}>{s.reservedBy}</Text>}
              {!!s.currentUser && s.occupied && <Text style={st.slotU}>{s.currentUser}</Text>}
              {isPending && <Text style={st.slotU}>⏳...</Text>}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Barrier */}
      <View style={st.row}>
        <TouchableOpacity style={st.btn} onPress={() => onGate('OPEN')}><Text style={st.btnT}>🔓 MỞ BARRIER</Text></TouchableOpacity>
        <TouchableOpacity style={[st.btn, { backgroundColor: '#7f8c8d' }]} onPress={() => onGate('CLOSE')}><Text style={st.btnT}>🔒 ĐÓNG</Text></TouchableOpacity>
      </View>

      <Text style={st.note}>
        Giá: miễn phí {FREE_MIN} phút đầu, sau đó {money(FEE)}/giờ. Giữ chỗ 5 phút.
        2 máy cùng đặt 1 ô: máy đến sau bị từ chối (chống trùng ở Broker + requestId).
      </Text>

      {/* Cai dat */}
      <TouchableOpacity style={st.linkBtn} onPress={() => setShowCfg((v) => !v)}>
        <Text style={st.linkTxt}>{showCfg ? '▼ Ẩn cài đặt kết nối' : '⚙️ Cài đặt kết nối (nhập link server)'}</Text>
      </TouchableOpacity>
      {showCfg && (
        <View style={st.card}>
          <Text style={st.lbl}>Link server (Backend REST + MQTT bridge)</Text>
          <TextInput
            style={st.inp}
            value={local.base}
            onChangeText={(t) => setLocal({ ...local, base: t })}
            placeholder="https://xxx.onrender.com  hoặc  http://192.168.1.10:3000"
            autoCapitalize="none"
          />
          <Text style={st.note}>
            Chỉ cần 1 link duy nhất. App tự suy ra:
            {'\n'}• REST: {'{link}'}/api/...
            {'\n'}• MQTT WebSocket: ws(s)://{'{host}'}/mqtt
          </Text>

          <Text style={st.lbl}>Mã sinh viên</Text>
          <TextInput style={st.inp} value={local.myId} onChangeText={(t) => setLocal({ ...local, myId: t })} placeholder="VD: SV01" />

          <Text style={st.lbl}>Chế độ kết nối</Text>
          <View style={st.tabsMini}>
            <TouchableOpacity
              style={[st.miniBtn, local.mode !== 'broker' && st.miniBtnAct]}
              onPress={() => setLocal({ ...local, mode: 'bridge' })}>
              <Text style={[st.miniTxt, local.mode !== 'broker' && st.miniTxtAct]}>🌐 Qua Backend</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[st.miniBtn, local.mode === 'broker' && st.miniBtnAct]}
              onPress={() => setLocal({ ...local, mode: 'broker' })}>
              <Text style={[st.miniTxt, local.mode === 'broker' && st.miniTxtAct]}>📡 Thẳng Broker</Text>
            </TouchableOpacity>
          </View>

          {local.mode === 'broker' && (
            <>
              <Text style={st.lbl}>MQTT WebSocket của Broker (nếu broker có bật WS)</Text>
              <TextInput
                style={st.inp}
                value={local.brokerWs}
                onChangeText={(t) => setLocal({ ...local, brokerWs: t })}
                placeholder="ws://192.168.1.10:9001"
                autoCapitalize="none"
              />
            </>
          )}

          <View style={st.card}>
            <Text style={st.rowSub}>URL MQTT sẽ dùng:</Text>
            <Text style={st.log}>{resolveMqttUrl(local) || '(chưa nhập link server)'}</Text>
          </View>

          <TouchableOpacity style={st.btn} onPress={() => onCfg(local)}><Text style={st.btnT}>🔌 KẾT NỐI LẠI</Text></TouchableOpacity>
        </View>
      )}

      {/* Nhat ky */}
      <Text style={st.h2}>📋 Nhật ký</Text>
      {log.length === 0 && <Text style={st.note}>Chưa có sự kiện nào.</Text>}
      {log.map((l, i) => <Text key={i} style={st.log}>{l}</Text>)}
    </View>
  );
}

// =========================== TAB 2: LICH SU ==================================
function HistoryTab({ receipts, bookings }) {
  const total = receipts.reduce((s, r) => s + Number(r.fee || 0), 0);
  return (
    <View>
      <View style={st.kpiRow}>
        <View style={st.kpi}><Text style={st.kpiV}>{receipts.length}</Text><Text style={st.kpiL}>Lượt xe</Text></View>
        <View style={st.kpi}><Text style={st.kpiV}>{money(total)}</Text><Text style={st.kpiL}>Tổng phí</Text></View>
      </View>

      <Text style={st.h2}>🧾 Hóa đơn tính phí</Text>
      {receipts.length === 0 && <Text style={st.note}>Chưa có hóa đơn. (Cần Backend chạy + xe ra khỏi ô)</Text>}
      {receipts.map((r, i) => (
        <View key={i} style={st.rowItem}>
          <View style={{ flex: 1 }}>
            <Text style={st.rowTitle}>Ô {r.slot} — {r.user || 'KHACH'}</Text>
            <Text style={st.rowSub}>{r.minutes || 0} phút • {fmtTime(r.ts)}</Text>
          </View>
          <Text style={st.rowVal}>{money(r.fee)}</Text>
        </View>
      ))}

      <Text style={st.h2}>📌 Lịch sử đặt chỗ</Text>
      {bookings.length === 0 && <Text style={st.note}>Chưa có lịch sử đặt chỗ.</Text>}
      {bookings.map((b, i) => (
        <View key={i} style={st.rowItem}>
          <View style={{ flex: 1 }}>
            <Text style={st.rowTitle}>Ô {b.slot} — {b.user || '-'}</Text>
            <Text style={st.rowSub}>{b.action} • {fmtTime(b.ts)}</Text>
          </View>
          <Text style={[st.tag, b.ok ? st.tagOk : st.tagNo]}>{b.ok ? 'OK' : 'LỖI'}</Text>
        </View>
      ))}
    </View>
  );
}

// =========================== TAB 3: THONG KE ==================================
function StatsTab({ stats, onRefresh }) {
  if (!stats) {
    return (
      <View style={st.center}>
        <ActivityIndicator size="large" color="#0984e3" />
        <Text style={st.note}>Đang tải thống kê từ Backend...</Text>
        <Text style={st.note}>Nếu lâu, hãy kiểm tra Backend đã chạy chưa (http://localhost:3000)</Text>
      </View>
    );
  }
  const maxDay = Math.max(1, ...stats.days.map((d) => d.revenue));
  const maxHour = Math.max(1, ...stats.byHour);
  return (
    <View>
      <View style={st.kpiRow}>
        <View style={st.kpi}><Text style={st.kpiV}>{money(stats.revenueToday)}</Text><Text style={st.kpiL}>Doanh thu hôm nay</Text></View>
        <View style={st.kpi}><Text style={st.kpiV}>{money(stats.totalRevenue)}</Text><Text style={st.kpiL}>Tổng doanh thu</Text></View>
      </View>
      <View style={st.kpiRow}>
        <View style={st.kpi}><Text style={st.kpiV}>{stats.totalSessions}</Text><Text style={st.kpiL}>Lượt xe</Text></View>
        <View style={st.kpi}><Text style={st.kpiV}>{stats.free}/{stats.total}</Text><Text style={st.kpiL}>Ô trống</Text></View>
      </View>

      <Text style={st.h2}>📈 Doanh thu 7 ngần gần nhất</Text>
      <View style={st.card}>
        {stats.days.map((d) => (
          <View key={d.date} style={st.barRow}>
            <Text style={st.barLbl}>{d.date.slice(5)}</Text>
            <View style={st.barTrack}>
              <View style={[st.barFill, { width: `${Math.round((d.revenue / maxDay) * 100)}%` }]} />
            </View>
            <Text style={st.barVal}>{money(d.revenue)}</Text>
          </View>
        ))}
      </View>

      <Text style={st.h2}>⏰ Doanh thu theo giờ</Text>
      <View style={st.card}>
        {stats.byHour.map((v, h) => (
          <View key={h} style={st.hourRow}>
            <Text style={st.hourLbl}>{h}h</Text>
            <View style={st.barTrack}>
              <View style={[st.barFill, { backgroundColor: '#00b894', width: `${Math.round((v / maxHour) * 100)}%` }]} />
            </View>
          </View>
        ))}
      </View>

      <Text style={st.h2}>👥 Top người dùng</Text>
      <View style={st.card}>
        {(stats.topUsers || []).length === 0 && <Text style={st.note}>Chưa có dữ liệu.</Text>}
        {(stats.topUsers || []).map((u, i) => (
          <View key={i} style={st.barRow}>
            <Text style={st.barLbl}>{u.user}</Text>
            <View style={st.barTrack}>
              <View style={[st.barFill, { backgroundColor: '#e17055', width: `${Math.min(100, u.sessions * 12)}%` }]} />
            </View>
            <Text style={st.barVal}>{u.sessions} lượt</Text>
          </View>
        ))}
      </View>

      <TouchableOpacity style={st.btn} onPress={onRefresh}><Text style={st.btnT}>🔄 LÀM MỚI</Text></TouchableOpacity>
    </View>
  );
}

// =========================== TAB 4: TAI KHOAN ================================
function AccountTab({ user, token, cfg, onLogin, onLogout, onCfg }) {
  const [u, setU] = useState('');
  const [p, setP] = useState('');
  const [name, setName] = useState('');
  const [plate, setPlate] = useState('');
  const [mode, setMode] = useState('login');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const doLogin = async () => {
    setBusy(true); setMsg('');
    try {
      const r = await API.login(u.trim(), p);
      onLogin(r.user, r.token);
      setMsg('✅ Đăng nhập thành công');
      setP('');
    } catch (e) { setMsg('❌ ' + e.message); }
    setBusy(false);
  };

  const doRegister = async () => {
    setBusy(true); setMsg('');
    try {
      await API.register(u.trim(), p, name.trim(), plate.trim());
      setMsg('✅ Đăng ký thành công, đăng nhập luôn');
      const r = await API.login(u.trim(), p);
      onLogin(r.user, r.token);
      setP('');
    } catch (e) { setMsg('❌ ' + e.message); }
    setBusy(false);
  };

  if (user) {
    return (
      <View>
        <View style={st.card}>
          <Text style={st.h2}>Đã đăng nhập</Text>
          <Text style={st.rowTitle}>👤 {user.name || user.username}</Text>
          <Text style={st.rowSub}>Mã: {user.username} • Biển số: {user.plate || 'chưa cập nhật'}</Text>
          <Text style={st.rowSub}>Đang dùng làm {cfg.myId} trong thao tác đặt chỗ.</Text>
        </View>
        <TouchableOpacity style={[st.btn, { backgroundColor: '#e74c3c' }]} onPress={onLogout}>
          <Text style={st.btnT}>🚪 ĐĂNG XUẤT</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View>
      <View style={st.tabsMini}>
        <TouchableOpacity style={[st.miniBtn, mode === 'login' && st.miniBtnAct]} onPress={() => setMode('login')}>
          <Text style={[st.miniTxt, mode === 'login' && st.miniTxtAct]}>Đăng nhập</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[st.miniBtn, mode === 'register' && st.miniBtnAct]} onPress={() => setMode('register')}>
          <Text style={[st.miniTxt, mode === 'register' && st.miniTxtAct]}>Đăng ký</Text>
        </TouchableOpacity>
      </View>

      <View style={st.card}>
        <Text style={st.lbl}>Tên đăng nhập</Text>
        <TextInput style={st.inp} value={u} onChangeText={setU} placeholder="VD: SV01" autoCapitalize="none" />
        {mode === 'register' && (
          <>
            <Text style={st.lbl}>Họ tên</Text>
            <TextInput style={st.inp} value={name} onChangeText={setName} placeholder="Nguyễn Văn A" />
            <Text style={st.lbl}>Biển số xe</Text>
            <TextInput style={st.inp} value={plate} onChangeText={setPlate} placeholder="30A-123.45" autoCapitalize="characters" />
          </>
        )}
        <Text style={st.lbl}>Mật khẩu</Text>
        <TextInput style={st.inp} value={p} onChangeText={setP} placeholder="Mật khẩu" secureTextEntry />
        {!!msg && <Text style={st.msg}>{msg}</Text>}
        <TouchableOpacity style={st.btn} disabled={busy} onPress={mode === 'login' ? doLogin : doRegister}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={st.btnT}>{mode === 'login' ? '🔑 ĐĂNG NHẬP' : '📝 ĐĂNG KÝ'}</Text>}
        </TouchableOpacity>
      </View>

      <Text style={st.note}>
        Tài khoản lưu ở Backend (file JSON). Đăng nhập để xem lịch sử cá nhân và nạp tiền ví.
        Không có Backend thì vẫn dùng được chức năng đặt chỗ qua MQTT.
      </Text>
    </View>
  );
}

// =============================== STYLE =======================================
const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f5f6fa' },
  header: { paddingTop: 44, paddingHorizontal: 16, paddingBottom: 10, backgroundColor: '#0984e3' },
  hTitle: { color: '#fff', fontSize: 19, fontWeight: 'bold', textAlign: 'center' },
  hBadges: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 8, flexWrap: 'wrap' },
  badge: { color: '#fff', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10, fontSize: 11, fontWeight: 'bold', marginRight: 6 },
  badge2: { color: '#fff', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, fontSize: 11, backgroundColor: 'rgba(255,255,255,.25)', marginRight: 4 },
  tabBar: { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#dfe6e9' },
  tabBtn: { flex: 1, paddingVertical: 13, alignItems: 'center' },
  tabBtnAct: { borderBottomWidth: 3, borderBottomColor: '#0984e3' },
  tabTxt: { fontSize: 12.5, color: '#636e72', fontWeight: 'bold' },
  tabTxtAct: { color: '#0984e3' },
  body: { flex: 1, paddingHorizontal: 16, paddingTop: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginTop: 4 },
  slot: { width: '31.5%', aspectRatio: 0.92, borderRadius: 12, padding: 8, marginBottom: 10, justifyContent: 'center', alignItems: 'center' },
  slotPending: { opacity: 0.55 },
  slotId: { fontSize: 21, fontWeight: 'bold', color: '#fff' },
  slotSt: { color: '#fff', fontWeight: 'bold', fontSize: 11.5 },
  slotU: { color: '#fff', fontSize: 11, marginTop: 2 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  btn: { flex: 1, backgroundColor: '#0984e3', padding: 12, borderRadius: 10, margin: 4, alignItems: 'center' },
  btnT: { color: '#fff', fontWeight: 'bold', fontSize: 13.5 },
  note: { fontSize: 12, color: '#636e72', marginVertical: 8, lineHeight: 17 },
  h2: { fontWeight: 'bold', marginTop: 16, marginBottom: 6, fontSize: 15, color: '#2c3e50' },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginTop: 8, shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 4, elevation: 2 },
  lbl: { fontSize: 12, color: '#636e72', marginTop: 8, marginBottom: 2, fontWeight: 'bold' },
  inp: { borderWidth: 1, borderColor: '#b2bec3', borderRadius: 8, padding: 10, backgroundColor: '#fff', fontSize: 14 },
  linkBtn: { marginTop: 10, padding: 6 },
  linkTxt: { color: '#0984e3', fontWeight: 'bold', fontSize: 13 },
  log: { fontSize: 11.5, color: '#2d3436', marginBottom: 2, fontFamily: 'monospace' },
  center: { alignItems: 'center', paddingVertical: 40 },
  kpiRow: { flexDirection: 'row', marginTop: 8 },
  kpi: { flex: 1, backgroundColor: '#fff', borderRadius: 12, padding: 14, margin: 4, alignItems: 'center', elevation: 2 },
  kpiV: { fontSize: 19, fontWeight: 'bold', color: '#0984e3' },
  kpiL: { fontSize: 11.5, color: '#7f8c8d', marginTop: 2 },
  rowItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 7, elevation: 1 },
  rowTitle: { fontSize: 14, fontWeight: 'bold', color: '#2c3e50' },
  rowSub: { fontSize: 11.5, color: '#7f8c8d', marginTop: 2 },
  rowVal: { fontSize: 15, fontWeight: 'bold', color: '#00b894' },
  tag: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 9, fontSize: 11, fontWeight: 'bold' },
  tagOk: { backgroundColor: '#d4efdf', color: '#1e7e34' },
  tagNo: { backgroundColor: '#ffe3e3', color: '#c0392b' },
  barRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 7 },
  barLbl: { width: 58, fontSize: 11.5, color: '#636e72' },
  barTrack: { flex: 1, height: 16, backgroundColor: '#ecf0f1', borderRadius: 8, overflow: 'hidden' },
  barFill: { height: 16, backgroundColor: '#0984e3', borderRadius: 8 },
  barVal: { width: 74, textAlign: 'right', fontSize: 11, color: '#2d3436' },
  hourRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 3 },
  hourLbl: { width: 34, fontSize: 10.5, color: '#636e72' },
  tabsMini: { flexDirection: 'row', marginTop: 8 },
  miniBtn: { flex: 1, paddingVertical: 9, alignItems: 'center', backgroundColor: '#dfe6e9', borderRadius: 8, marginHorizontal: 3 },
  miniBtnAct: { backgroundColor: '#0984e3' },
  miniTxt: { fontWeight: 'bold', color: '#2c3e50', fontSize: 13 },
  miniTxtAct: { color: '#fff' },
  msg: { marginTop: 10, fontSize: 12.5, fontWeight: 'bold' },
});
