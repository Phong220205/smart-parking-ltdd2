#!/usr/bin/env python3
"""
SIMULATOR SMART PARKING - Gia lap ESP32 (Wokwi) bang Python
Dung khi khong mo duoc Wokwi (build queue lau) hoac khi can nhieu ESP32 ao.

Cung cap:
  - 6 o P1..P6, trang thai trong / co xe / duoc dat cho
  - Dat cho / huy cho (chong trung theo user)
  - Het han giu cho sau 5 phut
  - Xe ra -> tinh phi (30 phut mien phi, sau do 3000d/gio) -> publish receipt
  - Barrier mo/dong
  - The RFID gia lap
  - Bao cao trang thai dinh ky (retain)

Chay:
  pip install paho-mqtt
  python simulator/parking_simulator.py --mode demo
  python simulator/parking_simulator.py --mode quiet    # dung yen, App dieu khien
  python simulator/parking_simulator.py --mode chaos   # test mat mang / dat trung
"""

import time, json, random, argparse, threading, sys
try:
    import paho.mqtt.client as mqtt
except ImportError:
    print("Chua cai paho-mqtt. Chay: pip install paho-mqtt"); sys.exit(1)

SLOTS = [f"P{i}" for i in range(1, 7)]
FEE_PER_HOUR = 3000
FREE_MINUTES = 30
BOOKING_TIMEOUT = 300      # 5 phut

state = {s: {"occupied": False, "reservedBy": None, "currentUser": None,
              "reserveAt": 0, "enterAt": 0} for s in SLOTS}
gate = "CLOSED"
revenue = 0
counters = {"bookings": 0, "sessions": 0}

parser = argparse.ArgumentParser()
parser.add_argument("--host", default="localhost")
parser.add_argument("--port", type=int, default=1883)
parser.add_argument("--user", default="esp32")
parser.add_argument("--password", default="esp32123")
parser.add_argument("--no-auth", action="store_true",
                    help="Khong gui username/password (dung cho broker cho phep anonymous)")
parser.add_argument("--mode", default="demo", choices=["demo", "quiet", "chaos"])
parser.add_argument("--seed", type=int, default=None, help="Dat random seed de chay lap lai")
parser.add_argument("--client-id", default=None,
                    help="Client ID cung cho MQTT. Client moi se duoc broker kick client cu cung ID")
args = parser.parse_args()
if args.seed is not None:
    random.seed(args.seed)

client = mqtt.Client(client_id=args.client_id or f"sim-esp32-{random.randint(0, 99999)}",
                      protocol=mqtt.MQTTv311)
if args.user and args.password and not args.no_auth:
    client.username_pw_set(args.user, args.password)
client.will_set("parking/system/status", json.dumps({"online": False}), qos=1, retain=True)


# ------------------------------- PUBLISH -------------------------------------
def pub_slot(s):
    client.publish(f"parking/slot/{s}/status", json.dumps({
        "id": s, "occupied": state[s]["occupied"],
        "reservedBy": state[s]["reservedBy"], "currentUser": state[s]["currentUser"],
        "updatedAt": int(time.time() * 1000)}), qos=1, retain=True)


def pub_snapshot():
    client.publish("parking/slots/snapshot", json.dumps({
        "slots": [{"id": s, "occupied": v["occupied"], "reservedBy": v["reservedBy"],
                   "currentUser": v["currentUser"]} for s, v in state.items()],
        "gate": gate, "free": sum(1 for v in state.values() if not v["occupied"]),
        "revenue": revenue, "ts": int(time.time() * 1000)}), qos=1, retain=True)


def pub_booking(s, st, user, req, ok, msg):
    client.publish(f"parking/booking/{s}/state", json.dumps({
        "slot": s, "state": st, "user": user, "requestId": req,
        "ok": ok, "msg": msg}), qos=1, retain=True)


def pub_gate():
    client.publish("parking/gate/barrier/state", json.dumps({
        "gate": gate, "ts": int(time.time() * 1000)}), qos=1, retain=True)


def pub_rfid(card, slot, event, user=""):
    client.publish("parking/gate/rfid", json.dumps({
        "card": card, "slot": slot, "event": event, "user": user,
        "ts": int(time.time() * 1000)}), qos=0)


def pub_receipt(s, user, minutes, fee):
    client.publish("parking/billing/receipt", json.dumps({
        "slot": s, "user": user, "minutes": minutes, "fee": fee,
        "ts": int(time.time() * 1000)}), qos=1, retain=True)


def calc_fee(minutes):
    if minutes <= FREE_MINUTES:
        return 0
    return ((minutes + 59) // 60) * FEE_PER_HOUR


# ------------------------------- XU LY --------------------------------------
def car_enters(s, user="guest"):
    state[s]["occupied"] = True
    state[s]["enterAt"] = time.time()
    state[s]["currentUser"] = user
    counters["sessions"] += 1
    pub_rfid(f"SIM{random.randint(1000,9999)}", s, "ENTER", user)
    pub_slot(s); pub_snapshot()
    print(f"[SIM] Xe VAO {s} ({user})")


def car_leaves(s):
    mins = max(1, int((time.time() - state[s]["enterAt"]) / 60)) if state[s]["enterAt"] else 1
    user = state[s]["currentUser"] or state[s]["reservedBy"] or "KHACH"
    fee = calc_fee(mins)
    global revenue
    revenue += fee
    pub_receipt(s, user, mins, fee)
    state[s]["occupied"] = False
    state[s]["reservedBy"] = None
    state[s]["currentUser"] = None
    state[s]["enterAt"] = 0
    pub_booking(s, "FREE", user, "", True, "O trong")
    pub_slot(s); pub_snapshot()
    print(f"[SIM] Xe RA {s} - {mins} phut - {fee} VND")


def on_message(c, u, m):
    global gate
    try:
        d = json.loads(m.payload.decode())
    except Exception:
        return
    t = m.topic

    if t == "parking/gate/barrier/cmd":
        gate = "OPEN" if d.get("cmd") == "OPEN" else "CLOSED"
        print(f"[SIM] Barrier -> {gate} by {d.get('by')}")
        pub_gate()
        return

    if t.startswith("parking/booking/") and t.endswith("/set"):
        s = d.get("slot"); user = d.get("user", "")
        act = d.get("action"); req = d.get("requestId", "")
        if s not in state:
            pub_booking(s, "ERROR", user, req, False, "Sai ma o"); return

        if act == "reserve":
            if state[s]["occupied"]:
                pub_booking(s, "OCCUPIED", user, req, False, "O da co xe"); return
            if state[s]["reservedBy"] and state[s]["reservedBy"] != user:
                pub_booking(s, "RESERVED", user, req, False,
                            f"O da duoc dat boi {state[s]['reservedBy']}"); return
            state[s]["reservedBy"] = user
            state[s]["reserveAt"] = time.time()
            counters["bookings"] += 1
            pub_booking(s, "RESERVED", user, req, True, "Dat o thanh cong, giu cho 5 phut")
            pub_slot(s); pub_snapshot()
            print(f"[SIM] {s} reserved by {user}")

        elif act == "cancel":
            if state[s]["reservedBy"] == user:
                state[s]["reservedBy"] = None
                pub_booking(s, "FREE", user, req, True, "Da huy dat")
                pub_slot(s); pub_snapshot()
            else:
                pub_booking(s, "ERROR", user, req, False, "Ban khong phai nguoi dat")

        elif act == "enter":
            car_enters(s, user)
            pub_booking(s, "ENTERED", user, req, True, "Da ghi nhan xe vao")

        elif act == "exit":
            car_leaves(s)

        elif act == "stay":
            # Gia lap xe da dung o o mot khoang thoi gian (de demo tinh phi)
            mins = int(d.get("minutes") or 45)
            state[s]["occupied"] = True
            state[s]["enterAt"] = time.time() - mins * 60
            state[s]["currentUser"] = state[s]["reservedBy"] or state[s]["currentUser"] or "KHACH"
            pub_slot(s); pub_snapshot()
            print(f"[SIM] {s} gia lap da dung {mins} phut (user={state[s]['currentUser']})")
            pub_booking(s, "FREE", user, req, True, "Da ghi nhan xe ra")


# ------------------------------- VONG LAP -----------------------------------
def demo_loop():
    time.sleep(2)
    while True:
        time.sleep(random.randint(8, 15))
        free = [s for s in SLOTS if not state[s]["occupied"]]
        busy = [s for s in SLOTS if state[s]["occupied"]]
        if free and (not busy or random.random() < 0.6):
            s = random.choice(free)
            state[s]["reservedBy"] = f"KHACH{random.randint(1, 9)}"
            car_enters(s, state[s]["reservedBy"])
        elif busy:
            car_leaves(random.choice(busy))
        if args.mode == "chaos" and random.random() < 0.2:
            print("[SIM-CHAOS] Gia lap mat mang 5s..."); time.sleep(5)


def expire_loop():
    while True:
        time.sleep(5)
        for s in SLOTS:
            if (state[s]["reservedBy"] and not state[s]["occupied"]
                    and time.time() - state[s]["reserveAt"] > BOOKING_TIMEOUT):
                user = state[s]["reservedBy"]
                state[s]["reservedBy"] = None
                pub_booking(s, "EXPIRED", user, "", False, "Het han giu cho 5 phut")
                pub_slot(s); pub_snapshot()
                print(f"[SIM] {s} het han giu cho ({user})")


def beat_loop():
    while True:
        time.sleep(15)
        client.publish("parking/system/heartbeat", json.dumps({
            "uptime": int(time.time()), "wifi": -55, "freeHeap": 120000,
            "revenue": revenue, "firmware": "2.0-sim"}), qos=0)


# ------------------------------- MAIN ----------------------------------------
client.on_message = on_message
try:
    client.connect(args.host, args.port, 60)
except Exception as e:
    print(f"Khong ket noi duoc broker {args.host}:{args.port} - {e}")
    sys.exit(1)

client.subscribe("parking/booking/+/set", qos=1)
client.subscribe("parking/gate/barrier/cmd", qos=1)
client.loop_start()
time.sleep(1)

client.publish("parking/system/status", json.dumps({"online": True}), qos=1, retain=True)
for s in SLOTS:
    pub_slot(s)
pub_snapshot(); pub_gate()

print("=" * 55)
print(f"[SIM] Chay mode={args.mode} - Broker {args.host}:{args.port}")
print("[SIM] Enter: RFID:xxx | BOOK:P1:SV01 | CANCEL:P1:SV01 | ENTER:P1:SV01 | EXIT:P1 | STAY:P1:45")
print("=" * 55)

threading.Thread(target=expire_loop, daemon=True).start()
threading.Thread(target=beat_loop, daemon=True).start()

if args.mode in ("demo", "chaos"):
    demo_loop()
else:
    print("[SIM] quiet mode: dung yen de App dieu khien.")
    # Cho phep dieu khien tu console (khong can App)
    while True:
        try:
            line = input().strip()
        except EOFError:
            time.sleep(3600); break
        if not line:
            continue
        if line.startswith("RFID:"):
            pub_rfid(line[5:], "", "DEN")
        elif line.startswith("BOOK:"):
            _, s, u = line.split(":", 2)
            on_message(client, None, type("M", (), {
                "topic": f"parking/booking/{s}/set",
                "payload": json.dumps({"slot": s, "user": u, "action": "reserve",
                                       "requestId": "console"}).encode()})())
        elif line.startswith("CANCEL:"):
            _, s, u = line.split(":", 2)
            on_message(client, None, type("M", (), {
                "topic": f"parking/booking/{s}/set",
                "payload": json.dumps({"slot": s, "user": u, "action": "cancel",
                                       "requestId": "console"}).encode()})())
        elif line.startswith("ENTER:"):
            _, s, u = line.split(":", 2)
            on_message(client, None, type("M", (), {
                "topic": f"parking/booking/{s}/set",
                "payload": json.dumps({"slot": s, "user": u, "action": "enter",
                                       "requestId": "console"}).encode()})())
        elif line.startswith("EXIT:"):
            s = line[5:].strip()
            car_leaves(s)
        elif line.startswith("STAY:"):
            # STAY:P2:45 -> gia lap xe da dung o P2 duoc 45 phut (de demo tinh phi)
            parts = line[5:].split(":")
            s = parts[0].strip().upper()
            mins = int(parts[1]) if len(parts) > 1 else 45
            if s in state:
                state[s]["occupied"] = True
                state[s]["enterAt"] = time.time() - mins * 60
                state[s]["currentUser"] = state[s]["reservedBy"] or "KHACH"
                pub_slot(s); pub_snapshot()
                print(f"[SIM] {s} gia lap da dung {mins} phut")
            else:
                print("Sai ma o")
        elif line == "GATE:OPEN":
            gate = "OPEN"; pub_gate()
        elif line == "GATE:CLOSE":
            gate = "CLOSED"; pub_gate()
        else:
            print("Lenh khong hop le")
