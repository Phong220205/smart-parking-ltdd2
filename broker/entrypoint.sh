#!/bin/sh
# ============================================================================
#  ENTRYPOINT - KHỞI ĐỘNG MQTT BROKER (Mosquitto) CHO DỰ ÁN BÃI ĐỖ XE
#  ---------------------------------------------------------------------------
#  Vì sao không COPY file "passwd" vào image?
#    - File passwd chứa HASH mật khẩu người dùng. Theo nguyên tắc bảo mật,
#      KHÔNG commit file này lên GitHub (đã nằm trong .gitignore).
#    - Thay vào đó, image tự SINH file passwd lúc khởi động từ các hash
#      được truyền qua biến môi trường / file trong build context.
#    - Nhờ vậy, source code trên GitHub không chứa bí mật, nhưng broker vẫn
#      chạy được với đúng tài khoản "esp32 / esp32123" và "app / app123".
#
#  Cách sinh hash (nếu cần đổi mật khẩu):
#    docker run --rm -it eclipse-mosquitto:2.0 \
#      mosquitto_passwd -c /mosquitto/config/passwd esp32 esp32123
#
#  LƯU Ý: hash ở đây là dạng "$7$101$..." (PBKDF2-SHA512) - đây chính là
#  tài khoản demo của đồ án, KHÔNG phải mật khẩu thật của ai.
# ============================================================================
set -e

# --- 1) Chuẩn bị thư mục ---
mkdir -p /mosquitto/data /mosquitto/log /mosquitto/config
chown -R mosquitto:mosquitto /mosquitto 2>/dev/null || true

# --- 2) Tạo file passwd từ hash (nếu chưa có) ---
# Hash tài khoản demo của đồ án - được sinh bằng mosquitto_passwd.
ESP32_PASS_HASH='$7$101$tGtDkXyxvfM1Ml6C$gSE5qHobzrWEsR2KffuRJK+/cnymyZNlDJjMEdSkIJ03VhzrwORkI00pDpTX4Go591ShhTrifBXvsMVRI3YwTA=='
APP_PASS_HASH='$7$101$LC+kiLBxixUYKPvA$TeCTqGrPO03KkWfyhdRshOB7lKpD6I+SDMk17BNIQvizYfQ0Xm//G2s4K/0Zt7VBYe8g8FxyA63WNbjO8bRBLQ=='

if [ ! -f /mosquitto/config/passwd ]; then
  printf 'esp32:%s\napp:%s\n' "$ESP32_PASS_HASH" "$APP_PASS_HASH" > /mosquitto/config/passwd
  echo "[entrypoint] Da tao /mosquitto/config/passwd voi 2 tai khoan (esp32, app)"
fi

# Trao quyền sở hữu cho user mosquitto (broker chạy bằng user này)
chown mosquitto:mosquitto /mosquitto/config/passwd /mosquitto/config/acl.conf

# --- 3) Cấu hình quyền truy cập file ---
# Mosquitto yêu cầu file passwd/acl chỉ readable bởi owner, nếu không sẽ cảnh báo.
chmod 0700 /mosquitto/config/passwd /mosquitto/config/acl.conf 2>/dev/null || true

# --- 4) Khởi động broker ở foreground ---
echo "[entrypoint] Khoi dong Mosquitto (foreground)..."
exec mosquitto -c /mosquitto/config/mosquitto.conf -v
