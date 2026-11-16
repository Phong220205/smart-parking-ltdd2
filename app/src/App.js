// ============================================================================
//  APP SMART PARKING - React Native (Expo)
//  ---------------------------------------------------------------------------
//  CẤU TRÚC DỰ ÁN (tách component/service - Lab3 tiêu chí #4):
//    App.js                 -> man hinh chinh, chi dieu phoi
//    components/Tabs.js     -> Header, TabBar + 4 tab component
//    hooks/useParking.js    -> hook gom logic MQTT realtime + REST + trang thai
//    parkingMqtt.js         -> service MQTT WebSocket (subscribe/publish)
//    api.js                 -> service REST (thong ke, lich su, tai khoan)
//    constants.js           -> hang so dung chung
//    utils.js               -> ham tien ich (format, tinh phi)
// ============================================================================

import React, { useState, useCallback } from 'react';
import { View, ScrollView, RefreshControl } from 'react-native';
import { useParking } from './hooks/useParking';
import { Header, TabBar, ParkingTab, HistoryTab, StatsTab, AccountTab, st } from './components/Tabs';

export default function App() {
  const [tab, setTab] = useState('parking');
  const [refreshing, setRefreshing] = useState(false);

  // Toan bo logic MQTT + REST + trang thai nam trong hook -> App.js gon nhe
  const p = useParking();

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([p.refreshRemote(), p.loadStats()]);
    setRefreshing(false);
  }, [p.refreshRemote, p.loadStats]);

  const freeCount = Object.values(p.slots).filter((s) => !s.occupied).length;

  return (
    <View style={st.root}>
      <Header online={p.online} gate={p.gate} freeCount={freeCount} myId={p.cfg.myId} />

      <TabBar tab={tab} onChange={setTab} />

      <ScrollView
        style={st.body}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {tab === 'parking' && (
          <ParkingTab
            slots={p.slots} gate={p.gate} cfg={p.cfg} log={p.log}
            pending={p.pending} mqttUrl={p.mqttUrl}
            onReserve={p.doReserve}
            onCancel={p.doCancel}
            onGate={p.doGate}
            onEnter={p.doEnter}
            onExit={p.doExit}
            onCfg={p.applyCfg}
          />
        )}

        {tab === 'history' && (
          <HistoryTab receipts={p.receipts} bookings={p.bookings} />
        )}

        {tab === 'stats' && (
          <StatsTab stats={p.stats} onRefresh={p.loadStats} />
        )}

        {tab === 'account' && (
          <AccountTab
            user={p.user} token={p.token} cfg={p.cfg}
            onLogin={p.login}
            onLogout={p.logout}
            onCfg={p.applyCfg}
          />
        )}

        <View style={{ height: 30 }} />
      </ScrollView>
    </View>
  );
}
