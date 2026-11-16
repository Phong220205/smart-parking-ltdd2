# ============================================================================
#  DOCKERFILE - MQTT BROKER (Mosquitto 2.0) CHO DỰ ÁN BÃI ĐỖ XE THÔNG MINH
#  ---------------------------------------------------------------------------
#  Mục đích: dựng broker MQTT có XÁC THỰC user/password + ACL phân quyền
#  theo topic, deploy lên Render (dịch vụ "worker" dạng Docker).
#
#  Cách hoạt động:
#    - Image gốc eclipse-mosquitto:2.0 chạy ở user "mosquitto" (uid 1883).
#    - File mosquitto.conf / acl.conf được COPY vào image.
#    - File passwd (chứa HASH mật khẩu) KHÔNG commit lên GitHub - nó được
#      SINH RA lúc container khởi động bởi entrypoint.sh (xem file đó).
#    - Broker chạy ở foreground để Docker/Render theo dõi tiến trình.
#
#  LỆNH docker chạy tay (để test trên máy):
#    docker compose -f broker/docker-compose.yml up -d
# ============================================================================
FROM eclipse-mosquitto:2.0

# Tạo thư mục dữ liệu + log và trao quyền cho user mosquitto
RUN mkdir -p /mosquitto/data /mosquitto/log && \
    chown -R mosquitto:mosquitto /mosquitto

# Copy cấu hình (không copy passwd - sẽ sinh lúc chạy)
COPY mosquitto.conf /mosquitto/config/mosquitto.conf
COPY acl.conf        /mosquitto/config/acl.conf
COPY entrypoint.sh   /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Entrypoint: sinh passwd -> chạy broker ở foreground
ENTRYPOINT ["/entrypoint.sh"]
