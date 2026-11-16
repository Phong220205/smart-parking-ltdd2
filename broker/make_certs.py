#!/usr/bin/env python3
"""
Sinh chung thu TLS (self-signed) cho Mosquitto Broker - Lab2 tieu chi "ma hoa".

    python broker/make_certs.py

Sinh ra trong broker/certs/:
    ca.crt       - CA (dung de client xac thuc server)
    server.crt   - chung thu server (CN=broker.local)
    server.key   - khoa rieng tuong ung server.crt
    ca.key       - khoa rieng cua CA

Tu dong sinh SAN cho IP noi bo + ten host local, giup mayy tinh
ket noi duoc bang ten "broker.local" ma khong can sua /etc/hosts.
"""
import datetime
import ipaddress
import os
import socket

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID

HERE = os.path.dirname(os.path.abspath(__file__))
# Chứng thư phải nằm trong config/ vì docker-compose mount read-only ./config
OUT = os.path.join(HERE, "config", "certs")

DAYS = 3650  # 10 nam


def gen_key():
    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


def save_key(path, key):
    with open(path, "wb") as f:
        f.write(key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.TraditionalOpenSSL,
            encryption_algorithm=serialization.NoEncryption(),
        ))


def save_cert(path, cert):
    with open(path, "wb") as f:
        f.write(cert.public_bytes(serialization.Encoding.PEM))


def main():
    os.makedirs(OUT, exist_ok=True)
    now = datetime.datetime.now(datetime.timezone.utc)

    # ---------------- CA ----------------
    ca_key = gen_key()
    ca_name = x509.Name([
        x509.NameAttribute(NameOID.COMMON_NAME, "Smart Parking Lab2 CA"),
        x509.NameAttribute(NameOID.ORGANIZATION_NAME, "Truong Dai hoc Dong A"),
    ])
    ca_cert = (
        x509.CertificateBuilder()
        .subject_name(ca_name)
        .issuer_name(ca_name)
        .public_key(ca_key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - datetime.timedelta(days=1))
        .not_valid_after(now + datetime.timedelta(days=DAYS))
        .add_extension(x509.BasicConstraints(ca=True, path_length=0), critical=True)
        .add_extension(
            x509.KeyUsage(
                digital_signature=True, content_commitment=False,
                key_encipherment=False, data_encipherment=False,
                key_agreement=False, key_cert_sign=True, crl_sign=True,
                encipher_only=False, decipher_only=False,
            ), critical=True,
        )
        # SubjectKeyIdentifier / AuthorityKeyIdentifier: bat buoc de
        # chuoi xac thuc TLS (chu thu server tro ve CA) hop le
        .add_extension(
            x509.SubjectKeyIdentifier.from_public_key(ca_key.public_key()),
            critical=False,
        )
        .add_extension(
            x509.AuthorityKeyIdentifier.from_issuer_public_key(ca_key.public_key()),
            critical=False,
        )
        .sign(ca_key, hashes.SHA256())
    )

    # ---------------- Server ----------------
    srv_key = gen_key()
    srv_name = x509.Name([
        x509.NameAttribute(NameOID.COMMON_NAME, "broker.local"),
        x509.NameAttribute(NameOID.ORGANIZATION_NAME, "Smart Parking Lab2"),
    ])

    # SAN: ten host local + IP noi bo + localhost
    try:
        host_ip = socket.gethostbyname(socket.gethostname())
    except Exception:
        host_ip = "127.0.0.1"
    ips = {ipaddress.ip_address("127.0.0.1"), ipaddress.ip_address("::1")}
    try:
        ips.add(ipaddress.ip_address(host_ip))
    except ValueError:
        pass

    san = x509.SubjectAlternativeName([
        x509.DNSName("broker.local"),
        x509.DNSName("localhost"),
        x509.DNSName(socket.gethostname()),
        *[x509.IPAddress(i) for i in ips],
    ])

    srv_cert = (
        x509.CertificateBuilder()
        .subject_name(srv_name)
        .issuer_name(ca_cert.subject)
        .public_key(srv_key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - datetime.timedelta(days=1))
        .not_valid_after(now + datetime.timedelta(days=DAYS))
        .add_extension(san, critical=False)
        .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
        .add_extension(
            x509.ExtendedKeyUsage([x509.ObjectIdentifier("1.3.6.1.5.5.7.3.1")]),
            critical=False,
        )
        .add_extension(
            x509.SubjectKeyIdentifier.from_public_key(srv_key.public_key()),
            critical=False,
        )
        .add_extension(
            x509.AuthorityKeyIdentifier.from_issuer_public_key(ca_key.public_key()),
            critical=False,
        )
        .sign(ca_key, hashes.SHA256())
    )

    save_cert(os.path.join(OUT, "ca.crt"), ca_cert)
    save_key(os.path.join(OUT, "ca.key"), ca_key)
    save_cert(os.path.join(OUT, "server.crt"), srv_cert)
    save_key(os.path.join(OUT, "server.key"), srv_key)

    print("Da sinh chung thu TLS tai:", OUT)
    for f in ("ca.crt", "ca.key", "server.crt", "server.key"):
        p = os.path.join(OUT, f)
        print("  %-12s %6d bytes" % (f, os.path.getsize(p)))
    print("SAN chua:", ", ".join(str(x.value) for x in san))


if __name__ == "__main__":
    main()
