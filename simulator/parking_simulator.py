import time, json, random, argparse, threading, sys
from datetime import datetime
try:
    import paho.mqtt.client as mqtt
except ImportError:
    print("Chua cai paho-mqtt. Chay: pip install paho-mqtt"); sys.exit(1)

SLOTS = [f"P{i}" for i in range(1,7)]
FEE_PER_HOUR = 3000
BOOKING_TIMEOUT = 300  # 5 phut

state = {s: {"occupied": False, "reservedBy": None, "reserveAt": 0, "enterAt": 0} for s in SLOTS}
gate = "CLOSED"

parser = argparse.ArgumentParser()
parser.add_argument("--host", default="localhost")
parser.add_argument("--port", type=int, default=1883)
parser.add_argument("--user", default="esp32")
parser.add_argument("--password", default="esp32123")
parser.add_argument("--mode", default="demo", choices=["demo","quiet","chaos"])
args = parser.parse_args()

client = mqtt.Client(client_id=f"sim-esp32-{random.randint(0,9999)}", protocol=mqtt.MQTTv311)
client.username_pw_set(args.user, args.password)
client.will_set("parking/system/status", json.dumps({"online": False}), qos=1, retain=True)

def pub_slot(s):
    client.publish(f"parking/slot/{s}/status",
        json.dumps({"id": s, "occupied": state[s]["occupied"],
                    "reservedBy": state[s]["reservedBy"], "updatedAt": int(time.time()*1000)}),
        qos=1, retain=True)

def pub_snapshot():
    client.publish("parking/slots/snapshot", json.dumps(
        {"slots": [{"id": s, "occupied": v["occupied"], "reservedBy": v["reservedBy"]} for s,v in state.items()],
         "gate": gate, "ts": int(time.time()*1000)}), qos=1, retain=True)

def pub_booking(s, st, user, req, ok, msg):
    client.publish(f"parking/booking/{s}/state",
        json.dumps({"slot": s, "state": st, "user": user, "requestId": req, "ok": ok, "msg": msg}),
        qos=1, retain=True)

def pub_gate():
    client.publish("parking/gate/barrier/state",
        json.dumps({"gate": gate, "ts": int(time.time()*1000)}), qos=1, retain=True)

def on_message(c, u, m):
    global gate
    try: d = json.loads(m.payload.decode())
    except: return
    t = m.topic
    if t == "parking/gate/barrier/cmd":
        gate = "OPEN" if d.get("cmd") == "OPEN" else "CLOSED"
        print(f"[SIM] Barrier -> {gate} by {d.get('by')}")
        pub_gate()
    elif t.startswith("parking/booking/") and t.endswith("/set"):
        s, user, act, req = d.get("slot"), d.get("user",""), d.get("action"), d.get("requestId","")
        if s not in state:
            pub_booking(s,"ERROR",user,req,False,"Sai ma o"); return
        if act == "reserve":
            if state[s]["occupied"]:
                pub_booking(s,"OCCUPIED",user,req,False,"O da co xe"); return
            if state[s]["reservedBy"] and state[s]["reservedBy"] != user:
                pub_booking(s,"RESERVED",user,req,False,f"O da duoc dat boi {state[s]['reservedBy']}"); return
            state[s]["reservedBy"] = user; state[s]["reserveAt"] = time.time()
            pub_booking(s,"RESERVED",user,req,True,"Dat o thanh cong, giu cho 5 phut")
            pub_slot(s); pub_snapshot()
            print(f"[SIM] {s} reserved by {user}")
        elif act == "cancel":
            if state[s]["reservedBy"] == user:
                state[s]["reservedBy"] = None
                pub_booking(s,"FREE",user,req,True,"Da huy dat"); pub_slot(s); pub_snapshot()
            else:
                pub_booking(s,"ERROR",user,req,False,"Ban khong phai nguoi dat")

def car_enters(s, user="guest"):
    state[s]["occupied"] = True; state[s]["enterAt"] = time.time()
    client.publish("parking/gate/rfid", json.dumps({"card":"SIM123","slot":s,"event":"ENTER"}))
    pub_slot(s); pub_snapshot(); print(f"[SIM] Xe vao {s}")

def car_leaves(s):
    mins = max(1, int((time.time()-state[s]["enterAt"])/60)) if state[s]["enterAt"] else 1
    fee = 0 if mins <= 30 else ((mins+59)//60)*FEE_PER_HOUR
    client.publish("parking/billing/receipt",
        json.dumps({"slot":s,"user":state[s]["reservedBy"] or "guest","minutes":mins,"fee":fee}), qos=1)
    state[s]["occupied"] = False; state[s]["reservedBy"] = None; state[s]["enterAt"] = 0
    pub_booking(s,"FREE","", "",True,"O trong")
    pub_slot(s); pub_snapshot(); print(f"[SIM] Xe ra {s} - {mins} phut - {fee} VND")

def demo_loop():
    time.sleep(2)
    while True:
        time.sleep(random.randint(8,15))
        free = [s for s in SLOTS if not state[s]["occupied"]]
        busy = [s for s in SLOTS if state[s]["occupied"]]
        if free and (not busy or random.random() < 0.6):
            car_enters(random.choice(free))
        elif busy:
            car_leaves(random.choice(busy))
        if args.mode == "chaos" and random.random() < 0.2:
            print("[SIM-CHAOS] Gia lap mat mang 5s..."); time.sleep(5)

def expire_loop():
    while True:
        time.sleep(5)
        for s in SLOTS:
            if state[s]["reservedBy"] and not state[s]["occupied"] and time.time()-state[s]["reserveAt"] > BOOKING_TIMEOUT:
                state[s]["reservedBy"] = None
                pub_booking(s,"FREE","", "",True,"Het han giu cho")
                pub_slot(s); pub_snapshot(); print(f"[SIM] {s} het han giu cho")

def beat_loop():
    while True:
        time.sleep(15)
        client.publish("parking/system/heartbeat", json.dumps({"uptime":int(time.time()),"wifi":-55,"freeHeap":120000}))

client.on_message = on_message
client.connect(args.host, args.port, 60)
client.subscribe("parking/booking/+/set", qos=1)
client.subscribe("parking/gate/barrier/cmd", qos=1)
client.loop_start()
time.sleep(1)
client.publish("parking/system/status", json.dumps({"online": True}), qos=1, retain=True)
for s in SLOTS: pub_slot(s)
pub_snapshot(); pub_gate()
print(f"[SIM] Chay mode={args.mode} - Broker {args.host}:{args.port}")
threading.Thread(target=expire_loop, daemon=True).start()
threading.Thread(target=beat_loop, daemon=True).start()
if args.mode in ("demo","chaos"): demo_loop()
else:
    print("[SIM] quiet mode: dung yen cho App dieu khien.")
    print("[SIM] Go lenh qua MQTT (VD booking/set), khong can go stdin.")
    while True: time.sleep(3600)
