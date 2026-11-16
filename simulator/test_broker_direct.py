#!/usr/bin/env python3
"""Test truc tiep voi broker public (khong qua bridge) - de khoang vung loi."""
import json
import sys
import time

import paho.mqtt.client as mqtt

HOST = sys.argv[1] if len(sys.argv) > 1 else "test.mosquitto.org"
PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 1883
SLOT = "P5"
REQ = "direct-test-" + str(int(time.time()))

msgs = []


def on_message(c, u, m):
    try:
        d = json.loads(m.payload.decode())
    except Exception:
        return
    msgs.append((m.topic, d))
    print("[MSG]", m.topic, json.dumps(d)[:100])


c = mqtt.Client(client_id="direct-test-" + str(int(time.time())))
c.on_message = on_message
c.connect(HOST, PORT, 30)
c.loop_start()
c.subscribe("parking/booking/+/state", qos=1)
c.subscribe("parking/system/status", qos=1)
time.sleep(2)

print("[ACT] publish reserve", SLOT, "requestId=" + REQ)
c.publish(f"parking/booking/{SLOT}/set", json.dumps({
    "slot": SLOT, "user": "DIRECT01", "action": "reserve", "requestId": REQ}), qos=1)

found = None
for _ in range(24):
    time.sleep(1)
    for t, d in msgs:
        if d.get("requestId") == REQ:
            found = (t, d)
            break
    if found:
        break

c.loop_stop()
c.disconnect()

if found:
    print("[OK] Nhan phan hoi khop requestId:", json.dumps(found[1])[:120])
    sys.exit(0)
print("[FAIL] Khong nhan phan hoi khop requestId sau 24s")
print("Da nhan:", [(t, d.get("requestId"), d.get("msg")) for t, d in msgs][:12])
sys.exit(1)
