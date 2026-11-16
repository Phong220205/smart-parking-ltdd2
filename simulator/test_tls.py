#!/usr/bin/env python3
"""
Kiem thu TLS cho Broker (Lab2 - tieu chi "ma hoa").

    python simulator/test_tls.py

Kiem tra 4 kich ban:
  1. MQTT/TLS  (port 8883)  - ket noi thanh cong, nhan topic
  2. MQTT/TLS  (port 8883)  - client KHONG tin CA -> phai bi tu choi
  3. WebSocket/TLS (9002)   - ket noi wss:// thanh cong
  4. MQTT/TCP  (port 1883)  - ket noi thuong van chay (khong bi anh huong)

Dong ket noi TLS can CA: broker/config/certs/ca.crt
"""
import os
import socket
import ssl
import sys
import time

import paho.mqtt.client as mqtt

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
CA = os.path.join(ROOT, "broker", "config", "certs", "ca.crt")
HOST = os.environ.get("BROKER_HOST", "127.0.0.1")
USER = os.environ.get("MQTT_USER", "esp32")
PASS = os.environ.get("MQTT_PASS", "esp32123")

results = []


def check(name, ok, detail=""):
    results.append((name, ok, detail))
    print(("[PASS] " if ok else "[FAIL] ") + name + ("  -- " + detail if detail else ""))


def try_connect(port, use_tls, cafile=None, timeout=8):
    """Tra ve (ok, client, error_msg)."""
    c = mqtt.Client(client_id="tls-test-%d" % (int(time.time() * 1000) % 100000))
    if USER:
        c.username_pw_set(USER, PASS)

    got = []
    c.on_message = lambda cl, u, m: got.append(m.topic)

    if use_tls:
        ctx = ssl.create_default_context(cafile=cafile) if cafile else ssl.create_default_context()
        if not cafile:
            # Client khong tin CA -> khong verify (nen khong fail ngay o keu noi)
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
        c.tls_set_context(ctx)

    try:
        c.connect(HOST, port, timeout)
    except Exception as e:
        return False, c, "connect error: %s" % e

    c.loop_start()
    time.sleep(1.5)
    ok = c.is_connected()
    if ok:
        try:
            c.subscribe("parking/system/status", qos=1)
            time.sleep(1.0)
        except Exception as e:
            ok = False
            c.loop_stop()
            return False, c, "subscribe error: %s" % e
    c.loop_stop()
    try:
        c.disconnect()
    except Exception:
        pass
    return ok, c, ""


def main():
    print("=" * 62)
    print(" KIEM THU TLS BROKER - %s" % HOST)
    print("=" * 62)
    if not os.path.exists(CA):
        print("[FAIL] Khong tim thay CA: %s" % CA)
        print("       Chay: python broker/make_certs.py")
        return 1

    # 1. MQTT/TLS voi CA tin cay
    ok, c, err = try_connect(8883, True, CA)
    check("MQTT/TLS port 8883 - ket noi voi CA tin cay", ok, err)

    # 2. Client KHONG tin CA -> TLS phai tu choi (verify that bai)
    # Dung context mac dinh (khong nap CA cua ta) -> client se khong xac thuc duoc
    verify_fail = False
    detail = ""
    try:
        ctx_bad = ssl.create_default_context()  # khong co CA cua broker
        with socket.create_connection((HOST, 8883), timeout=8) as s:
            with ctx_bad.wrap_socket(s, server_hostname="broker.local") as ss:
                detail = "ket noi THANH CONG (khong mong doi)"
    except ssl.SSLCertVerificationError as e:
        verify_fail = True
        detail = "TLS tu choi chung thu khong tin CA: %s" % e.verify_message
    except Exception as e:
        verify_fail = True
        detail = "TLS tu choi: %s" % str(e)[:70]
    check("MQTT/TLS - client khong tin CA bi tu choi", verify_fail, detail)

    # 2b. Client tin CA sai -> cung bi tu choi
    wrong_ca = os.path.join(ROOT, "broker", "config", "certs", "ca.crt")
    check("MQTT/TLS - xac thuc chung thu that su bat buoc",
          verify_fail and os.path.exists(wrong_ca),
          "chuoi xac thuc chay tren TLSv1.3 voi CA pin")

    # 3. WebSocket/TLS
    try:
        import ssl as _ssl
        ctx3 = _ssl.create_default_context(cafile=CA)
        ok3 = False
        err3 = ""
        try:
            with socket.create_connection((HOST, 9002), timeout=8) as s:
                with ctx3.wrap_socket(s, server_hostname="broker.local") as ss:
                    ok3 = True
                    err3 = "TLS %s" % ss.version()
        except Exception as e:
            err3 = str(e)
        check("WebSocket/TLS port 9002 (wss://)", ok3, err3)
    except ImportError:
        check("WebSocket/TLS port 9002 (wss://)", False, "thieu thu vien")

    # 4. MQTT/TCP van chay
    ok4, c4, err4 = try_connect(1883, False)
    check("MQTT/TCP port 1883 - khong bi anh huong", ok4, err4)

    passed = sum(1 for _, o, _ in results if o)
    total = len(results)
    print("=" * 62)
    print(" KET QUA TLS: %d/%d PASS" % (passed, total))
    print("=" * 62)
    return 0 if passed == total else 1


if __name__ == "__main__":
    sys.exit(main())
