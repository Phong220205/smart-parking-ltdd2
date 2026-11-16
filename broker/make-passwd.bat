@echo off
REM Tao user cho broker (chay 1 lan)
docker run --rm -v "%cd%:/work" eclipse-mosquitto:2.0 mosquitto_passwd -c /work/passwd esp32
docker run --rm -v "%cd%:/work" eclipse-mosquitto:2.0 mosquitto_passwd -b /work/passwd app app123
echo Xong. Kiem tra file passwd roi chay: docker compose up -d
