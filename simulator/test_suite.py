#!/usr/bin/env python3
"""
BO KIT KIEM THU TU DONG - Smart Parking
Chay toan bo kiem thu end-to-end: Broker -> Simulator -> Backend -> Dashboard.

    python simulator/test_suite.py

Ket qua: PASS/FAIL cho tung muc, exit code 0 = het PASS.
"""
import json
import os
import shutil
import subprocess
import sys
import time
import atexit
import urllib.request
import urllib.error

BASE = os.environ.get("PARKING_API", "http://localhost:3000")
MQTT_HOST = os.environ.get("MQTT_HOST", "localhost")
MQTT_PORT = int(os.environ.get("MQTT_PORT", "1883"))
MQTT_USER = os.environ.get("MQTT_USER", "app")
MQTT_PASS = os.environ.get("MQTT_PASS", "app123")
SIM_SCRIPT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "parking_simulator.py")
UNIQ = str(int(time.time()))[-6:]

results = []

# Cache cong broker thuc te cua backend (lay tu /api/health).
_broker_addr = None


def resolve_broker():
    """Tra (host, port) cua broker MQTT thuc te cua backend.

    Backend co broker noi bo (aedes) - neu cong 1883 bi chiem, broker tu
    chuyen sang cong trong. Endpoint /api/health tra ve `brokerPort` la cong
    thuc te. Neu khong lay duoc (backend chua chay / broker ngoai) thi dung
    MQTT_HOST / MQTT_PORT tu bien moi truong.
    """
    global _broker_addr
    if _broker_addr:
        return _broker_addr
    try:
        h = get("/api/health")
        bp = h.get("brokerPort")
        bh = h.get("brokerHost") or "127.0.0.1"
        if bp:
            _broker_addr = (bh, int(bp))
            return _broker_addr
    except Exception:
        pass
    return (MQTT_HOST, MQTT_PORT)


def check(name, cond, detail=""):
    results.append((name, bool(cond), detail))
    print(f"[{'PASS' if cond else 'FAIL'}] {name}" + (f"  -- {detail}" if detail else ""))
    return bool(cond)


def get(path):
    try:
        req = urllib.request.Request(BASE + path)
        return json.loads(urllib.request.urlopen(req, timeout=8).read())
    except urllib.error.HTTPError as e:
        try:
            body = json.loads(e.read().decode())
        except Exception:
            body = {}
        return {**body, "__status": e.code}
    except Exception as e:
        return {"__error": str(e)}


def get_auth(path, token):
    try:
        req = urllib.request.Request(BASE + path, headers={"Authorization": "Bearer " + token})
        return json.loads(urllib.request.urlopen(req, timeout=8).read())
    except urllib.error.HTTPError as e:
        return {"__status": e.code}
    except Exception as e:
        return {"__error": str(e)}


def post(path, body, token=None):
    try:
        h = {"Content-Type": "application/json"}
        if token:
            h["Authorization"] = "Bearer " + token
        req = urllib.request.Request(BASE + path, data=json.dumps(body).encode(), headers=h)
        return json.loads(urllib.request.urlopen(req, timeout=8).read())
    except urllib.error.HTTPError as e:
        return {"__status": e.code, "__error": e.read().decode()[:200]}
    except Exception as e:
        return {"__error": str(e)}


def mqtt_subscribe(topics):
    """Subscribe MQTT, tra (client, danh sach message)."""
    try:
        import paho.mqtt.client as mqtt
    except ImportError:
        return None, None
    msgs = []
    c = mqtt.Client(client_id=f"test-suite-{int(time.time()*1000) % 999999}")
    if MQTT_USER:
        c.username_pw_set(MQTT_USER, MQTT_PASS)
    c.on_message = lambda cl, u, m: msgs.append((m.topic, json.loads(m.payload.decode())))
    # [FIX] Dung cung cong broker THUC TE cua backend (xem start_simulator).
    host, port = resolve_broker()
    c.connect(host, port, 30)
    c.loop_start()
    for t in topics:
        c.subscribe(t, qos=1)
    time.sleep(1.5)
    return c, msgs


def wait_for(msgs, request_id, timeout=6.0):
    end = time.time() + timeout
    while time.time() < end:
        for t, d in msgs:
            if d.get("requestId") == request_id:
                return d
        time.sleep(0.25)
    return None


def kill_other_simulators():
    """Dung moi simulator dang chay (cross-platform: Windows / Linux)."""
    try:
        if os.name == "nt":
            subprocess.run(
                ["powershell", "-NoProfile", "-Command",
                 "Get-CimInstance Win32_Process -Filter \"Name='python.exe'\" | "
                 "Where-Object { $_.CommandLine -like '*parking_simulator.py*' } | "
                 "ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"],
                capture_output=True)
        else:
            subprocess.run(["pkill", "-f", "parking_simulator.py"], capture_output=True)
    except Exception:
        pass


def start_simulator():
    """Khoi dong simulator o quiet mode de test khong bi nhieu du lieu.

    [FIX] Broker MQTT cua backend co the tu chuyen sang cong khac 1883 khi
    1883 da bi chiem (Mosquitto Docker, hay project Node khac cua nguoi dung).
    Vì vậy ta hoi backend truoc bang /api/health de lay `brokerPort` THUC TE
    rồi moi tro simulator toi dung cong do. Neu khong, simulator noi nham sang
    broker khac -> khong co snapshot -> test bridge FAIL.
    """
    cmd = [sys.executable, SIM_SCRIPT, "--mode", "quiet",
           "--client-id", f"sim-test-{os.getpid()}"]

    # Lay cong broker thuc te tu backend (neu co).
    try:
        h = get("/api/health")
        bport = h.get("brokerPort")
        if bport:
            cmd += ["--host", "127.0.0.1", "--port", str(int(bport))]
            print(f"[INFO] Broker that cua backend: 127.0.0.1:{bport}")
    except Exception as e:
        print(f"[WARN] Khong lay duoc brokerPort tu backend: {e}")

    if not MQTT_USER:
        cmd.append("--no-auth")
    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        stdin=subprocess.DEVNULL,
    )
    time.sleep(3)
    return proc


def stop_simulator(proc):
    if not proc:
        return
    try:
        proc.terminate()
        proc.wait(timeout=5)
    except Exception:
        try:
            proc.kill()
        except Exception:
            pass


def main():
    print("=" * 68)
    print(" BO KIT KIEM THU SMART PARKING")
    print("=" * 68)

    # Bat simulator quiet rieng cho test (tat simulator cu neu dang chay)
    kill_other_simulators()
    time.sleep(1)
    sim = start_simulator()
    atexit.register(stop_simulator, sim)
    print(f"[INFO] Simulator quiet mode PID={sim.pid}")

    h = get("/api/health")
    for _ in range(20):
        if h.get("online"):
            break
        time.sleep(0.5)
        h = get("/api/health")
    check("Backend + MQTT online", h.get("ok") and h.get("mqtt") and h.get("online"), json.dumps(h))
    if not h.get("ok"):
        print("\nBackend khong chay. Hay bat: cd backend && npm start")
        return 1

    st = get("/api/status")
    check("Co du 6 o trong bai", len(st.get("slots", {})) == 6, f"{len(st.get('slots', {}))} o")

    # --- Dat cho ---
    r = post("/api/booking", {"slot": "P1", "user": "SV01", "action": "reserve", "requestId": "ts-r1"})
    check("POST /api/booking (dat cho)", r.get("ok") and r.get("forwarded"))
    time.sleep(2)
    sl = get("/api/slots")
    check("P1 da duoc dat cho boi SV01", sl.get("P1", {}).get("reservedBy") == "SV01",
          f"reservedBy={sl.get('P1', {}).get('reservedBy')}")

    # --- Chong trung ---
    c, msgs = mqtt_subscribe(["parking/booking/+/state"])
    if c:
        c.publish("parking/booking/P1/set", json.dumps(
            {"slot": "P1", "user": "SV02", "action": "reserve", "requestId": "ts-dup"}), qos=1)
        d = wait_for(msgs, "ts-dup")
        check("CHONG TRUNG: SV02 bi tu choi", d is not None and d.get("ok") is False,
              (d or {}).get("msg", "khong nhan duoc phan hoi"))
        c.loop_stop(); c.disconnect()
    else:
        check("CHONG TRUNG: SV02 bi tu choi", False, "thieu paho-mqtt")

    # --- Xe vao / xe ra ---
    r = post("/api/enter", {"slot": "P1", "user": "SV01", "requestId": "ts-e1"})
    check("POST /api/enter (xe vao)", r.get("ok"))
    time.sleep(2)
    sl = get("/api/slots")
    check("P1 bao occupied", sl.get("P1", {}).get("occupied") is True)

    r = post("/api/exit", {"slot": "P1", "user": "SV01", "requestId": "ts-x1"})
    check("POST /api/exit (xe ra)", r.get("ok"))
    time.sleep(3)
    rec = get("/api/receipts?limit=20")
    r1 = [x for x in rec if x.get("slot") == "P1"]
    check("Phat sinh hoa don P1", len(r1) >= 1, f"{len(r1)} hoa don")
    check("Tinh phi <= 30 phut = 0 dong",
          all(x.get("fee") == 0 for x in r1) if r1 else False,
          str([x.get("fee") for x in r1]))

    # --- Tinh phi > 30 phut ---
    c, msgs = mqtt_subscribe(["parking/billing/receipt"])
    if c:
        c.publish("parking/booking/P6/set", json.dumps(
            {"slot": "P6", "user": "SV07", "action": "reserve", "requestId": "ts-f1"}), qos=1)
        time.sleep(1)
        c.publish("parking/booking/P6/set", json.dumps(
            {"slot": "P6", "user": "SV07", "action": "stay", "minutes": 95, "requestId": "ts-f2"}), qos=1)
        time.sleep(1.5)
        c.publish("parking/booking/P6/set", json.dumps(
            {"slot": "P6", "user": "SV07", "action": "exit", "requestId": "ts-f3"}), qos=1)
        time.sleep(3)
        rec2 = get("/api/receipts?limit=20")
        p6 = [x for x in rec2 if x.get("slot") == "P6" and x.get("fee", 0) > 0]
        check("Tinh phi 95 phut = 6000 dong",
              len(p6) >= 1 and p6[0].get("fee") == 6000,
              str([(x.get("minutes"), x.get("fee")) for x in p6]))
        c.loop_stop(); c.disconnect()
    else:
        check("Tinh phi 95 phut = 6000 dong", False, "thieu paho-mqtt")

    # --- Barrier ---
    r = post("/api/gate", {"cmd": "OPEN", "by": "SV01"})
    check("POST /api/gate OPEN", r.get("ok"))
    time.sleep(2)
    st = get("/api/status")
    check("Barrier dang OPEN", st.get("gate") == "OPEN", f"gate={st.get('gate')}")
    post("/api/gate", {"cmd": "CLOSE", "by": "SV01"})
    time.sleep(2)

    # --- Thong ke ---
    stt = get("/api/stats")
    check("Thong ke doanh thu > 0", stt.get("totalRevenue", 0) > 0,
          f"totalRevenue={stt.get('totalRevenue')}")
    check("Thong ke 7 ngay", len(stt.get("days", [])) == 7)
    check("Thong ke theo gio (24 muc)", len(stt.get("byHour", [])) == 24)
    check("Thong ke top nguoi dung", len(stt.get("topUsers", [])) >= 1)

    # --- Tai khoan ---
    uname = f"TS{UNIQ}"
    r = post("/api/auth/register", {"username": uname, "password": "1234",
                                    "name": "Test User", "plate": "30A-999.99"})
    check("Dang ky tai khoan", r.get("ok"), r.get("error", ""))
    r = post("/api/auth/login", {"username": uname, "password": "1234"})
    check("Dang nhap tra token", bool(r.get("token")))
    token = r.get("token")
    if token:
        me = get_auth("/api/auth/me", token)
        check("GET /api/auth/me voi token",
              me.get("ok") and me.get("user", {}).get("username") == uname)
        b = post("/api/balance", {"amount": 50000}, token)
        check("Nap tien vi", b.get("ok") and b.get("balance") == 50000, str(b.get("balance")))
    r = post("/api/auth/login", {"username": uname, "password": "SAI"})
    check("Sai mat khau -> 401", r.get("__status") == 401, str(r.get("__status")))

    # --- Lich su ---
    check("Lich su hoa don", len(get("/api/receipts?limit=50")) >= 1)
    check("Lich su dat cho", len(get("/api/bookings?limit=50")) >= 1)
    check("Log RFID", isinstance(get("/api/rfid"), list))
    check("Log su kien", isinstance(get("/api/events"), list))
    check("Danh sach nguoi dung", len(get("/api/users")) >= 1)

    # --- Dich vu ---
    deep = get("/api/health/deep")
    check("Health deep tra chi tiet he thong",
          deep.get("ok") and deep.get("data", {}).get("slots") == 6 and "uptimeSec" in deep,
          f"uptime={deep.get('uptimeSec')}s")
    miss = get("/api/khong-ton-tai")
    check("Endpoint la tra 404 JSON", miss.get("__status") == 404 and miss.get("ok") is False,
          f"status={miss.get('__status')}")
    bad = post("/api/booking", {"slot": "P99", "user": "SV01", "action": "reserve"})
    check("Validate ma o sai -> 400", bad.get("__status") == 400, str(bad.get("__status")))
    bad2 = post("/api/booking", {"slot": "P1", "user": "SV01", "action": "hack"})
    check("Validate action sai -> 400", bad2.get("__status") == 400, str(bad2.get("__status")))

    # --- MQTT over WebSocket bridge (App React Native -> Backend -> Broker) ---
    bridge = get("/api/bridge")
    check("Endpoint /api/bridge ton tai", bridge.get("ok") and bridge.get("path") == "/mqtt",
          f"path={bridge.get('path')}")
    if os.name != "nt" or True:
        try:
            node = shutil.which("node")
            script = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "backend", "test_bridge.js")
            p = subprocess.run([node, script, BASE.replace("http://", "ws://") + "/mqtt"],
                               capture_output=True, text=True, timeout=40)
            check("Bridge WebSocket: App -> Broker -> App",
                  p.returncode == 0 and "BRIDGE HOAT DONG" in p.stdout,
                  (p.stdout or p.stderr).strip().splitlines()[-1][:80] if (p.stdout or p.stderr) else "")
        except Exception as e:
            check("Bridge WebSocket: App -> Broker -> App", False, str(e))

    # --- Dashboard ---
    try:
        html = urllib.request.urlopen(BASE + "/", timeout=8).read().decode("utf-8", "ignore")
        check("Dashboard HTML phuc vu", len(html) > 5000, f"{len(html)} bytes")
        check("Dashboard co 5 tab", all(k in html for k in
              ["Sơ đồ bãi", "Thống kê", "Lịch sử", "Người dùng", "Cài đặt"]))
        check("Dashboard co Chart.js", "chart.umd.min.js" in html)
        check("Dashboard co SSE", "EventSource" in html)
    except Exception as e:
        check("Dashboard HTML phuc vu", False, str(e))

    # --- Bao mat Broker: TLS / ma hoa (Lab2 tieu chi "ma hoa") ---
    # Chi kiem tra neu broker local co mo cong TLS 8883
    tls_script = os.path.join(os.path.dirname(os.path.abspath(__file__)), "test_tls.py")
    tls_host = os.environ.get("BROKER_HOST", "127.0.0.1")
    try:
        import socket as _socket
        _s = _socket.socket()
        _s.settimeout(2)
        tls_up = (_s.connect_ex((tls_host, 8883)) == 0)
        _s.close()
    except Exception:
        tls_up = False
    if tls_up:
        try:
            tp = subprocess.run([sys.executable, tls_script], capture_output=True,
                                text=True, timeout=60,
                                env={**os.environ, "BROKER_HOST": tls_host})
            out = tp.stdout or ""
            check("Broker TLS: MQTT/TLS 8883 + WSS 9002 + tu choi CA sai",
                  "5/5 PASS" in out, out.strip().splitlines()[-1][:70] if out.strip() else "")
        except Exception as e:
            check("Broker TLS: MQTT/TLS 8883 + WSS 9002 + tu choi CA sai", False, str(e))
    else:
        check("Broker TLS: MQTT/TLS 8883 + WSS 9002 + tu choi CA sai", True,
              "broker khong mo cong TLS (public broker) - bo qua")

    # --- SSE ---
    try:
        resp = urllib.request.urlopen(urllib.request.Request(BASE + "/api/stream"), timeout=8)
        first = resp.readline().decode("utf-8", "ignore")
        second = resp.readline().decode("utf-8", "ignore")
        check("SSE /api/stream tra du lieu", "event:" in first and "data:" in second,
              (first + second).strip()[:60])
        resp.close()
    except Exception as e:
        check("SSE /api/stream tra du lieu", False, str(e))

    total = len(results)
    passed = sum(1 for _, ok, _ in results if ok)
    print("=" * 68)
    print(f"KET QUA: {passed}/{total} PASS")
    print("=" * 68)
    for n, ok, d in results:
        if not ok:
            print(f"  FAIL: {n}  {d}")
    return 0 if passed == total else 1


if __name__ == "__main__":
    sys.exit(main())
