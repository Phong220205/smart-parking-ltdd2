// ============================================================================
//  COMPONENTS - Các component con của App
//  Mỗi tab là 1 component riêng -> App.js chỉ lo điều phối.
// ============================================================================

import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, Alert,
  ScrollView, ActivityIndicator,
} from 'react-native';
import { SLOT_IDS, FEE_PER_HOUR, FREE_MINUTES, TABS } from '../constants';
import { money, fmtTime, slotColor, slotLabel } from '../utils';
import * as API from '../api';

// =============================== HEADER ======================================
export function Header({ online, gate, freeCount, myId }) {
  return (
    <View style={st.header}>
      <Text style={st.hTitle}>🅿️ BÃI ĐỖ XE THÔNG MINH</Text>
      <View style={st.hBadges}>
        <Text style={[st.badge, { backgroundColor: online ? '#2ecc71' : '#e74c3c' }]}>
          {online ? '● ONLINE' : '○ OFFLINE'}
        </Text>
        <Text style={st.badge2}>Trống {freeCount}/6</Text>
        <Text style={st.badge2}>Barrier: {gate}</Text>
        <Text style={st.badge2}>👤 {myId}</Text>
      </View>
    </View>
  );
}

// =============================== TAB BAR ====================================
export function TabBar({ tab, onChange }) {
  return (
    <View style={st.tabBar}>
      {TABS.map(([k, l]) => (
        <TouchableOpacity key={k} style={[st.tabBtn, tab === k && st.tabBtnAct]} onPress={() => onChange(k)}>
          <Text style={[st.tabTxt, tab === k && st.tabTxtAct]}>{l}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// =========================== TAB 1: BAI ======================================
export function ParkingTab({
  slots, gate, cfg, log, pending, mqttUrl,
  onReserve, onCancel, onGate, onEnter, onExit, onCfg,
}) {
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
        Giá: miễn phí {FREE_MINUTES} phút đầu, sau đó {money(FEE_PER_HOUR)}/giờ. Giữ chỗ 5 phút.
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

              <Text style={st.lbl}>Tài khoản Broker (ACL phân quyền)</Text>
              <TextInput
                style={st.inp}
                value={local.brokerUser}
                onChangeText={(t) => setLocal({ ...local, brokerUser: t })}
                placeholder="app"
                autoCapitalize="none"
              />
              <TextInput
                style={st.inp}
                value={local.brokerPass}
                onChangeText={(t) => setLocal({ ...local, brokerPass: t })}
                placeholder="app123"
                secureTextEntry
              />

              <Text style={st.lbl}>Mã hoá SSL/TLS</Text>
              <View style={st.tabsMini}>
                <TouchableOpacity
                  style={[st.miniBtn, !local.brokerTls && st.miniBtnAct]}
                  onPress={() => setLocal({ ...local, brokerTls: false })}>
                  <Text style={[st.miniTxt, !local.brokerTls && st.miniTxtAct]}>🔓 Không mã hoá</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[st.miniBtn, local.brokerTls && st.miniBtnAct]}
                  onPress={() => setLocal({ ...local, brokerTls: true })}>
                  <Text style={[st.miniTxt, local.brokerTls && st.miniTxtAct]}>🔒 wss:// (TLS)</Text>
                </TouchableOpacity>
              </View>
              {local.brokerTls && (
                <Text style={st.note}>
                  Broker local dùng chứng thư tự ký (broker/config/certs/ca.crt). Nếu App báo
                  lỗi chứng thư, tắt bước xác thực bên dưới (chỉ dùng khi demo nộp bài).
                </Text>
              )}
              {local.brokerTls && (
                <TouchableOpacity
                  style={st.linkBtn}
                  onPress={() => setLocal({ ...local, rejectUnauthorized: !local.rejectUnauthorized })}>
                  <Text style={st.linkTxt}>
                    {local.rejectUnauthorized !== false ? '☑️' : '☐'} Xác thực chứng thư CA của broker
                  </Text>
                </TouchableOpacity>
              )}
            </>
          )}

          <View style={st.card}>
            <Text style={st.rowSub}>URL MQTT sẽ dùng:</Text>
            <Text style={st.log}>{mqttUrl || '(chưa nhập link server)'}</Text>
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
export function HistoryTab({ receipts, bookings }) {
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
export function StatsTab({ stats, onRefresh }) {
  if (!stats) {
    return (
      <View style={st.center}>
        <ActivityIndicator size="large" color="#0984e3" />
        <Text style={st.note}>Đang tải thống kê từ Backend...</Text>
        <Text style={st.note}>Kiểm tra Link server trong tab ⚙️ Cài đặt kết nối.</Text>
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
export function AccountTab({ user, cfg, onLogin, onLogout, onCfg }) {
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
export const st = StyleSheet.create({
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
  rowItem: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 7, elevation: 1 },
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
