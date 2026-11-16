import React, { useEffect, useRef, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, TextInput, ScrollView } from 'react-native';
import { connectParking, loadCfg, saveCfg, reserveSlot, cancelSlot, gateCmd } from './parkingMqtt';

const FEE = 3000;
const slotColor = (s, mine) => s.occupied ? '#e74c3c' : (s.reservedBy ? (s.reservedBy === mine ? '#f1c40f' : '#e67e22') : '#2ecc71');
const slotLabel = (s, mine) => s.occupied ? 'CÓ XE' : (s.reservedBy ? (s.reservedBy === mine ? 'BẠN ĐẶT' : 'ĐÃ ĐẶT') : 'TRỐNG');

export default function App() {
  const [cfg, setCfg] = useState({ host: 'ws://192.168.1.10:9001', user: 'app', pass: 'app123', myId: 'SV01' });
  const [online, setOnline] = useState(false);
  const [slots, setSlots] = useState({ P1: {}, P2: {}, P3: {}, P4: {}, P5: {}, P6: {} });
  const [gate, setGate] = useState('CLOSED');
  const [log, setLog] = useState([]);
  const [pending, setPending] = useState({}); // requestId -> slot (chống đặt trùng: chờ state)
  const client = useRef(null);
  const pushLog = (m) => setLog((l) => [`${new Date().toLocaleTimeString()} ${m}`, ...l].slice(0, 30));

  useEffect(() => { (async () => { const c = await loadCfg(); setCfg(c); start(c); })(); return () => client.current?.end(); }, []);

  const start = (c) => {
    client.current?.end();
    const cl = connectParking(c, (type, d) => {
      if (type === 'conn') setOnline(d);
      else if (type === 'status') setSlots((s) => ({ ...s, [d.id]: d }));
      else if (type === 'snapshot') {
        const o = {}; for (const x of d.slots || []) o[x.id] = x;
        setSlots((s) => ({ ...s, ...o })); setGate(d.gate || 'CLOSED');
      }
      else if (type === 'gate') setGate(d.gate);
      else if (type === 'bookingState') {
        // Chỉ chấp nhận state đúng requestId mình gửi -> chống trùng đặt chỗ
        if (d.requestId && pending[d.requestId]) {
          setPending((p) => { const n = { ...p }; delete n[d.requestId]; return n; });
          Alert.alert(d.ok ? 'Thành công' : 'Thất bại', d.msg || d.state);
        } else if (d.requestId) {
          pushLog(`Đặt chỗ ${d.slot}: ${d.msg}`);
        }
        if (d.state === 'FREE' || d.state === 'RESERVED' || d.state === 'OCCUPIED') {
          setSlots((s) => ({ ...s, [d.slot]: { ...s[d.slot], id: d.slot, reservedBy: d.state === 'FREE' ? null : (s[d.slot]?.reservedBy || d.user) } }));
        }
      }
      else if (type === 'receipt') { Alert.alert('Thanh toán', `Ô ${d.slot}: ${d.minutes} phút - ${d.fee}đ`); pushLog(`Thu ${d.fee}đ ô ${d.slot}`); }
      else if (type === 'rfid') pushLog(`RFID ${d.card || ''} ${d.event || ''} ${d.slot || ''}`);
    });
    client.current = cl;
  };

  const freeCount = Object.values(slots).filter((s) => !s.occupied).length;

  const doReserve = (id) => {
    const req = reserveSlot(client.current, id, cfg.myId);
    setPending((p) => ({ ...p, [req]: id }));
    pushLog(`Gửi đặt ${id}...`);
    setTimeout(() => setPending((p) => { // timeout 5s không thấy state -> báo mất kết nối
      if (p[req]) { const n = { ...p }; delete n[req]; pushLog(`Đặt ${id} TIMEOUT - kiểm tra Broker`); Alert.alert('Timeout', 'Không nhận phản hồi từ bãi. Kiểm tra IP Broker.'); return n; } return p;
    }), 5000);
  };

  return (
    <ScrollView style={st.root}>
      <Text style={st.h1}>BÃI ĐỖ XE THÔNG MINH</Text>
      <Text style={[st.badge, { backgroundColor: online ? '#2ecc71' : '#e74c3c' }]}>{online ? '● Broker ONLINE' : '○ Broker OFFLINE - tự nối lại...'}</Text>
      <Text style={st.sub}>Trống {freeCount}/6 • Barrier: {gate} • Bạn: {cfg.myId}</Text>

      <View style={st.grid}>
        {['P1', 'P2', 'P3', 'P4', 'P5', 'P6'].map((id) => {
          const s = { id, occupied: false, reservedBy: null, ...(slots[id] || {}) };
          return (
            <TouchableOpacity key={id} style={[st.slot, { backgroundColor: slotColor(s, cfg.myId) }]}
              onPress={() => Alert.alert(`Ô ${id} - ${slotLabel(s, cfg.myId)}`, 'Chọn:', [
                { text: 'Đặt chỗ', onPress: () => doReserve(id) },
                { text: 'Hủy đặt', onPress: () => cancelSlot(client.current, id, cfg.myId) },
                { text: 'Đóng', style: 'cancel' },
              ])}>
              <Text style={st.slotId}>{id}</Text>
              <Text style={st.slotSt}>{slotLabel(s, cfg.myId)}</Text>
              {!!s.reservedBy && <Text style={st.slotU}>{s.reservedBy}</Text>}
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={st.row}>
        <TouchableOpacity style={st.btn} onPress={() => gateCmd(client.current, 'OPEN', cfg.myId)}><Text style={st.btnT}>MỞ BARRIER</Text></TouchableOpacity>
        <TouchableOpacity style={[st.btn, { backgroundColor: '#7f8c8d' }]} onPress={() => gateCmd(client.current, 'CLOSE', cfg.myId)}><Text style={st.btnT}>ĐÓNG</Text></TouchableOpacity>
      </View>
      <Text style={st.note}>Giá: miễn phí 30 phút đầu, sau đó {FEE}đ/giờ. Đặt giữ chỗ 5 phút. 2 máy cùng đặt 1 ô: máy đến sau bị từ chối (demo chống trùng).</Text>

      <Text style={st.h2}>Cài đặt kết nối (thay IP máy chạy Broker)</Text>
      <TextInput style={st.inp} value={cfg.host} onChangeText={(t) => setCfg({ ...cfg, host: t })} placeholder="ws://IP:9001" />
      <TextInput style={st.inp} value={cfg.myId} onChangeText={(t) => setCfg({ ...cfg, myId: t })} placeholder="Mã user VD SV01" />
      <TouchableOpacity style={st.btn} onPress={async () => { await saveCfg(cfg); start(cfg); }}}><Text style={st.btnT}>KẾT NỐI</Text></TouchableOpacity>

      <Text style={st.h2}>Nhật ký</Text>
      {log.map((l, i) => <Text key={i} style={st.log}>{l}</Text>)}
      <FlatList data={[]} renderItem={null} />
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}
const st = StyleSheet.create({
  root: { flex: 1, padding: 16, backgroundColor: '#f5f6fa' },
  h1: { fontSize: 22, fontWeight: 'bold', textAlign: 'center', marginTop: 30 },
  sub: { textAlign: 'center', marginVertical: 6, color: '#2c3e50' },
  badge: { alignSelf: 'center', color: '#fff', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, marginTop: 6, overflow: 'hidden' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginTop: 12 },
  slot: { width: '31%', aspectRatio: 0.9, borderRadius: 12, padding: 10, marginBottom: 10, justifyContent: 'center', alignItems: 'center' },
  slotId: { fontSize: 22, fontWeight: 'bold', color: '#fff' },
  slotSt: { color: '#fff', fontWeight: 'bold' },
  slotU: { color: '#fff', fontSize: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  btn: { flex: 1, backgroundColor: '#0984e3', padding: 12, borderRadius: 10, margin: 4, alignItems: 'center' },
  btnT: { color: '#fff', fontWeight: 'bold' },
  note: { fontSize: 12, color: '#636e72', marginVertical: 8 },
  h2: { fontWeight: 'bold', marginTop: 14 },
  inp: { borderWidth: 1, borderColor: '#b2bec3', borderRadius: 8, padding: 8, marginTop: 6, backgroundColor: '#fff' },
  log: { fontSize: 12, color: '#2d3436' },
});
