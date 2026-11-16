import socket, struct, time

def try_conn(host, port=1883, user=None, pwd=None, timeout=8):
    try:
        s = socket.create_connection((host, port), timeout=timeout)
    except Exception as e:
        return f"TCP FAIL: {e}"
    proto = b"MQTT"
    ver = b"\x04"
    flags = 0x02 if user else 0x00
    payload = b""
    if user:
        payload += struct.pack("!H", len(user)) + user.encode()
        payload += struct.pack("!H", len(pwd)) + pwd.encode()
    # client id
    cid = f"probe-{int(time.time())}"
    payload += struct.pack("!H", len(cid)) + cid.encode()
    var = proto + ver + bytes([flags]) + struct.pack("!H", len(payload)) + payload
    s.send(var)
    try:
        data = s.recv(4)
    except Exception as e:
        s.close()
        return f"NO CONNACK: {e}"
    s.close()
    if len(data) < 4:
        return "SHORT CONNACK"
    return f"CONNACK rc={data[3]}"

hosts = ["broker.hivemq.com", "broker.emqx.io", "mqtt.eclipseprojects.io",
         "test.mosquitto.org", "mqtt.ninja", "broker.emqx.io"]
for h in hosts:
    print(f"{h:35s} anon  -> {try_conn(h)}")
    print(f"{h:35s} auth  -> {try_conn(h, user='esp32', pwd='esp32123')}")
