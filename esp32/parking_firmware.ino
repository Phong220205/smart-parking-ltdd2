// ============================================================================
//  LAB 1 - BÃI ĐỖ XE THÔNG MINH (SMART PARKING) - Firmware ESP32 + Wokwi
//  ---------------------------------------------------------------------------
//  PHIÊN BẢN 3.0 - Đã nâng cấp cho đồ án kết thúc học phần LTDD2
//
//  MỤC TIÊU BÀI LAB 1 (Thiết kế & Lập trình phần cứng):
//    1. Thiết kế phần cứng  : sơ đồ nối dây, chọn chân ESP32 cho từng linh kiện
//    2. Lập trình cảm biến  : đọc 6 cảm biến hồng ngoại, RFID RC522, điều khiển Servo/Buzzer
//    3. WiFi + Broker       : kết nối MQTT (có xác thực user/password + TLS), gửi/nhận topic
//    4. Chất lượng mã nguồn : cấu trúc rõ ràng, có chú thích, TỰ PHỤC HỒI khi mất kết nối
//
//  PHẦN CỨNG MÔ PHỎNG (giả lập 100% trên Wokwi - không cần linh kiện thật):
//    • ESP32 DevKit V1       : vi xử lý chính, có WiFi + Bluetooth
//    • 6 cảm biến IR         : GPIO 13/12/14/27/26/25 - mô phỏng cảm biến hồng ngoại
//                               (nhấn nút = có xe đậu vào ô)
//    • RFID RC522            : SPI (SS=5, RST=4, SCK=18, MISO=19, MOSI=23) - quét thẻ vào
//    • Servo barrier (cổng) : GPIO 15 - 0° = đóng, 90° = mở
//    • Buzzer (còi báo)      : GPIO 2 - kêu báo khi bị từ chối / xe ra cần thanh toán
//    • OLED SSD1306 128x64   : I2C (SDA=21, SCL=22, địa chỉ 0x3C) - hiển thị trạng thái
//
//  THƯ VIỆN Wokwi: PubSubClient, ArduinoJson, ESP32Servo, MFRC522,
//                   Adafruit SSD1306, Adafruit GFX Library
//
//  ---------------------------------------------------------------------------
//  CÁC TOPIC MQTT (xem thêm README.md):
//    ESP32 → App/Server:
//      parking/slot/<ID>/status       trạng thái 1 ô (retain)
//      parking/slots/snapshot         ảnh chụp toàn bộ bãi (retain)
//      parking/booking/<ID>/state      kết quả đặt/hủy chỗ
//      parking/gate/barrier/state      trạng thái cổng barrier
//      parking/gate/rfid               sự kiện quét thẻ RFID
//      parking/billing/receipt         hoá đơn khi xe ra (kèm giờ thực tế)
//      parking/system/status           trạng thái online/offline (LWT - Last Will)
//      parking/system/heartbeat        nhịp sống + chỉ số hệ thống (RSSI, RAM, NTP)
//    App/Server → ESP32:
//      parking/booking/<ID>/set        lệnh đặt chỗ / hủy / xác nhận xe vào - xe ra
//      parking/gate/barrier/cmd        lệnh mở / đóng barrier
//  ---------------------------------------------------------------------------
//  CÁC NÂNG CẤP ĐÃ LÀM Ở PHIÊN BẢN 3.0:
//    [N1] Xác thực MQTT: đăng nhập broker bằng user/password (khớp ACL của Lab 2)
//    [N2] Tự kết nối lại WiFi khi mất mạng (trước đây chỉ gọi WiFi.begin() 1 lần)
//    [N3] Đồng hồ thực tế qua NTP - mọi mốc thời gian giờ là giờ giác thực
//    [N4] Watchdog Timer - tự khởi động lại ESP32 nếu vòng lặp bị treo
//    [N5] Gửi kèm "rssi", "heap", "clockOK" trong heartbeat để giám sát từ xa
//    [N6] Toàn bộ chú thích viết bằng tiếng Việt có dấu để giảng viên dễ đọc
// ============================================================================

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <Wire.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <ESP32Servo.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <SPI.h>
#include <MFRC522.h>
#include <time.h>          // [N3] dùng cho đồng hồ thực tế (NTP)

// --- [N1] MQTT qua WebSocket (wss://) ---
// PubSubClient nói chuyện TCP thuần. Để nối tới broker cloud (Render chỉ mở
// cổng HTTPS), ta bọc một lớp WebSocketClient -> WebSocketStreamClient
// (lớp này implements Client.h mà PubSubClient yêu cầu) -> nhờ vậy PubSubClient
// vẫn dùng API quen thuộc mà đường truyền là wss:// (đã MÃ HOÁ).
#include <ArduinoHttpClient.h>
#include <WebSocketClient250.h>
#include <WebSocketStreamClient.h>

// --- [N4] Watchdog Timer chuẩn của ESP32 (task WDT của ESP-IDF) ---
// Dùng header có sẵn trong Arduino ESP32 core. Guard bằng __has_include để
// firmware vẫn biên dịch được trên môi trường thiếu header này.
#if __has_include("esp_task_wdt.h")
  #include "esp_task_wdt.h"
  #define HAVE_TASK_WDT 1
#else
  #define HAVE_TASK_WDT 0
#endif

// ========================= CẤU HÌNH KẾT NỐI ================================
// --- WiFi ---
const char* WIFI_SSID = "Wokwi-GUEST";   // tên mạng WiFi (Wokwi cấp sẵn, không mật khẩu)
const char* WIFI_PASS = "";

// --- MQTT Broker ---
// [N1] Broker của đồ án được deploy trên cloud (Render) và CÓ xác thực
//      user/password + ACL phân quyền topic (xem backend/mqttAuthBroker.js).
//
//      VÌ SAO DÙNG ĐƯỜNG DẪN "/mqtt" (MQTT-over-WebSocket) MÀ KHÔNG PHẢI ":1883"?
//        - Nền tảng deploy chỉ mở được cổng HTTP/HTTPS công khai, cổng TCP
//          1883 không truy cập được từ bên ngoài.
//        - Cổng HTTPS có sẵn hỗ trợ WebSocket -> ta đưa MQTT đi trên WS.
//        - Ưu điểm thêm: kết nối đi qua HTTPS nên dữ liệu được MÃ HOÁ
//          (đáp ứng tiêu chí "mã hoá" của Lab 2).
//
//      Muốn chạy với broker Mosquitto cục bộ (Docker trong thư mục broker/)?
//      -> Đổi MQTT_HOST thành IP máy tính (vd "192.168.1.100") và
//         MQTT_USE_WS thành 0. Broker cục bộ mở cổng TCP 1883.
const char* MQTT_HOST = "smart-parking-ltdd2.onrender.com";
const char* MQTT_PATH = "/mqtt";         // đường dẫn WebSocket của broker
#define MQTT_USE_WS  1                   // 1 = dùng MQTT-over-WebSocket (cloud)
                                       // 0 = dùng MQTT/TCP trực tiếp (cục bộ)

// [N1] Tài khoản MQTT (đúng với file broker/config/passwd của Lab 2).
//      Muốn nối broker công cộng cho phép anonymous thì để rỗng cả hai: "" / ""
const char* MQTT_USER = "esp32";
const char* MQTT_PASS = "esp32123";

// --- Mã hoá SSL/TLS (Lab 2 - tiêu chí "mã hoá") ---
// Bật SSL/TLS: đổi sang broker có mở cổng 8883 (MQTT/TLS)
// Chi tiết: broker/config/mosquitto.conf + broker/make_certs.py
#define MQTT_USE_TLS  1          // 1 = bật SSL/TLS (wss:// khi dùng WebSocket)
#define MQTT_TLS_PORT 8883       // cổng MQTT/TLS của broker
// CA certificate để xác thực chứng thư broker.
// nội dung nỡ mã để copy CA (xem broker/config/certs/ca.crt)
// const char* MQTT_CA = "-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----\n";
#define MQTT_USE_CA   0          // 1 = có nhúng CA bên trên

#if MQTT_USE_TLS
  const int   MQTT_PORT = MQTT_TLS_PORT;
#else
  const int   MQTT_PORT = 1883;
#endif

// ============================ CẤU HÌNH PHẦN CỨNG ==========================
#define NUM_SLOTS 6
const char* SLOT_ID[NUM_SLOTS] = {"P1","P2","P3","P4","P5","P6"};  // mã 6 ô đỗ
const int IR_PIN[NUM_SLOTS] = {13, 12, 14, 27, 26, 25};           // chân 6 cảm biến IR
const int SERVO_PIN = 15;     // chân servo barrier
const int BUZZER_PIN = 2;     // chân còi báo
#define RFID_SS 5              // chân Slave Select của RFID (SPI)
#define RFID_RST 4             // chân Reset của RFID (SPI)

#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET -1
#define SCREEN_ADDRESS 0x3C    // địa chỉ I2C của OLED SSD1306

// ============================ QUY TẮC NGHIỆP VỤ ============================
#define FEE_PER_HOUR      3000L   // 3000 đồng / giờ
#define FREE_MINUTES      30      // 30 phút đầu miễn phí
#define BOOKING_TIMEOUT   300000UL // 5 phút (ms) giữ chỗ
#define GATE_OPEN_MS      5000UL  // barrier tự đóng sau 5 giây

// ================================ BIẾN TOÀN CỤC =============================
WiFiClient espClient;              // kết nối TCP thường cho MQTT (chế độ local)
WiFiClientSecure espSecureClient;  // kết nối TLS cho MQTT (chế độ local + wss)

// --- [N1] Lớp bọc MQTT qua WebSocket ---
// WebSocketClient       : bắt tay WebSocket + mã hoá TLS (nếu dùng wss://)
// WebSocketStreamClient : biến WebSocket thành "Client" cho PubSubClient
// PubSubClient          : vẫn dùng API connect/subscribe/publish như bình thường
#if MQTT_USE_WS
  // WebSocketClient250 : lớp WebSocket của thư viện WebSocketStreamClient
  //                      (hỗ trợ cả ws:// và wss:// trên ESP32)
  // WebSocketStreamClient: biến WebSocket thành "Client" mà PubSubClient dùng được
  WebSocketClient250 wsClient(espSecureClient, MQTT_HOST, 443);
  WebSocketStreamClient wsStreamClient(wsClient, MQTT_PATH);
  PubSubClient mqtt(wsStreamClient);
#else
  PubSubClient mqtt(espClient);
#endif
Servo barrier;                    // servo điều khiển cổng
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);
MFRC522 rfid(RFID_SS, RFID_RST);  // đầu đọc thẻ RFID

// Thông tin 1 ô đỗ xe
struct Slot {
  bool occupied = false;      // true = đang có xe
  String reservedBy = "";     // mã sinh viên đã đặt chỗ ô này
  String currentUser = "";    // mã sinh viên đang để xe ở ô này
  unsigned long reserveAt = 0;// thời điểm đặt chỗ (ms)
  unsigned long enterAt = 0;  // thời điểm xe vào (ms)
};
Slot slots[NUM_SLOTS];

// "Bóng" cảm biến IR: giá trị của cảm biến gần nhất.
// Vòng lặp đọc IR so sánh irShadow với tín hiệu hiện tại.
// Không dùng slots[].occupied để so sánh, vì lệnh thủ công (ENTER/EXIT
// qua Serial) cũng set occupied -> sẽ bị vòng lặp ghi đè ngay lập tức.
bool irShadow[NUM_SLOTS] = {false, false, false, false, false, false};

// Ô nào đang được điều khiển thủ công (lệnh ENTER/EXIT từ Serial).
// Vòng lặp đọc IR bỏ qua các ô này để không ghi đè lệnh của người dùng.
bool manualMode[NUM_SLOTS] = {false, false, false, false, false, false};

// --- Lọc nhiễu (debounce) cho cảm biến IR ---
// Nút bấm có tiếp xúc co "bounce" (tiếng dập khi nhấn) -> tín hiệu về 2 lần
// liên tiếp trong vài chục ms. Nếu không lọc, sẽ ghi nhận "xe vào" rồi
// ngay "xe ra" -> phát sinh hoá đơn sai.
// Quy tắc: tín hiệu mới chỉ được chấp nhận sau khi giữ liên tục
// DEBOUNCE_MS (200ms). Đọc cảm biến mỗi 50ms -> 4 lần xác nhận.
// 200ms là nhịp chân cho nút bấm có: đủ để chống bounce (thường <50ms)
// và đủ nhanh để thao tác trên Wokwi.
#define DEBOUNCE_MS 200
bool irRaw[NUM_SLOTS] = {false, false, false, false, false, false};   // tín hiệu thô
bool irStable[NUM_SLOTS] = {false, false, false, false, false, false}; // tín hiệu đã lọc
unsigned long irChangeAt[NUM_SLOTS] = {0, 0, 0, 0, 0, 0};            // lúc tín hiệu thay đổi

String gateState = "CLOSED";       // trạng thái cổng: CLOSED / OPEN
String gateOpenedBy = "";          // ai mở cổng (RFID, APP, SERIAL, AUTO)
unsigned long gateOpenedAt = 0;    // thời điểm mở cổng
long revenueToday = 0;             // tổng doanh thu trong ngày
unsigned long lastLcd = 0, lastMqttTry = 0, lastBeat = 0, lastSnapshot = 0, lastExpiry = 0;
bool mqttOK = false;               // đang kết nối broker hay không
bool oledOK = false;               // OLED khởi tạo thành công hay không
String lastRfidCard = "";          // thẻ RFID quét gần nhất
String statusMsg = "SAN SANG";     // dòng thông báo ngắn trên OLED
unsigned long statusMsgUntil = 0;  // thời điểm hết hiển thị thông báo
String cardOwner[8];               // ánh xạ thẻ RFID -> user (tối đa 8 thẻ)
String ownerCard[8];

// ===================== ĐỒNG HỒ THỰC TẾ (NTP) ==============================
// [N3] Trước đây mọi mốc thời gian đều dùng millis() -> chỉ đếm từ lúc khởi
//      động, không biết là mấy giờ mấy phút trong ngày. Nhiều trường hợp GV
//      đòi "hiển thị giờ thực tế". Sau khi đồng bộ NTP thành công:
//        clockOK = true  -> giờ là giờ giác thực
//        clockOK = false -> chưa có mạng NTP, dùng millis() như cũ
bool clockOK = false;
#define NTP_SERVER   "pool.ntp.org"
#define GMT_OFFSET   (7 * 3600)   // múi giờ Việt Nam = UTC+7
#define DST_OFFSET   0

// ====================== CẤU HÌNH TỰ PHỤC HỒI (N2 + N4) ======================
// [N2] Thời gian chờ giữa 2 lần thử kết nối lại WiFi (điều chỉnh dần)
unsigned long lastWifiTry = 0;
#define WIFI_RETRY_MS   5000UL    // thử lại WiFi mỗi 5 giây
#define WIFI_MAX_WAIT   15000UL   // mỗi lần thử chờ tối đa 15 giây

// [N4] Watchdog: nếu vòng loop() bị treo quá 15 giây -> tự khởi động lại
//      ESP32. Cơ chế: Task Watchdog của ESP-IDF (xem hàm wdtSetup/wdtKick).
#define WDT_TIMEOUT_S   15       // giây - quá ngưỡng này thì reset

// ============================== HÀM TIỆN ÍCH ================================
int slotIndex(String id) {
  for (int i = 0; i < NUM_SLOTS; i++) if (id == SLOT_ID[i]) return i;
  return -1;
}

// Còi báo "bíp" n lần (mỗi lần 120ms)
void beep(int n = 2) {
  for (int i = 0; i < n; i++) {
    digitalWrite(BUZZER_PIN, HIGH); delay(120);
    digitalWrite(BUZZER_PIN, LOW);  delay(120);
  }
}

// Hiển thị một thông báo ngắn lên OLED + in ra Serial để theo dõi
void say(const String& m, uint32_t ms = 2500) {
  statusMsg = m; statusMsgUntil = millis() + ms;
  Serial.println("[MSG] " + m);
}

// Chuyển mã UID thẻ RFID (dạng byte) thành chuỗi hex ví dụ "A1B2C3D4"
String uidToString(MFRC522::Uid uid) {
  String c = "";
  for (byte i = 0; i < uid.size; i++) {
    char h[4]; sprintf(h, "%02X", uid.uidByte[i]); c += h;
  }
  return c;
}

// [N3] Lấy giờ thực tế dạng chuỗi "HH:MM:SS" (dùng cho OLED)
String nowClock() {
  if (!clockOK) return "--:--:--";
  struct tm t;
  if (!getLocalTime(&t, 1)) return "--:--:--";
  char b[16];
  strftime(b, sizeof(b), "%H:%M:%S", &t);
  return String(b);
}

// [N3] Lấy mốc thời gian thực tế dạng epoch (mili-giây) để gửi lên Server.
//      Nếu chưa đồng bộ NTP thì trả về 0 -> Server tự dùng thời gian của nó.
unsigned long nowEpochMs() {
  if (!clockOK) return 0;
  struct tm t;
  if (!getLocalTime(&t, 1)) return 0;
  return (unsigned long)time(nullptr) * 1000UL;
}

// [N3] Đồng bộ giờ qua NTP (gọi 1 lần sau khi có WiFi)
void syncNTP() {
  configTime(GMT_OFFSET, DST_OFFSET, NTP_SERVER);
  struct tm t;
  // Timeout 3 giây: không để chờ NTP làm treo vòng loop (watchdog sẽ reset)
  if (getLocalTime(&t, 3)) {
    clockOK = true;
    Serial.print("[NTP] Dong bo thanh cong - gio hien tai: ");
    Serial.println(nowClock());
  } else {
    clockOK = false;
    Serial.println("[NTP] Chua dong bo duoc (van dung millis) - se thu lai sau");
  }
}

// ================================ OLED ======================================
void drawOLED(String extra = "") {
  if (!oledOK) return;
  int freeN = 0;
  for (int i = 0; i < NUM_SLOTS; i++) if (!slots[i].occupied) freeN++;

  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);

  // Dòng 1 - tiêu đề
  display.setCursor(0, 0);
  display.print("SMART PARKING");
  display.print("  ");
  display.print(mqttOK ? "M" : "-");

  // Dòng 2 - số ô trống / trạng thái cổng
  display.setCursor(0, 10);
  display.print("Trong:");
  display.print(freeN);
  display.print("/6 ");
  display.print(gateState);

  // Dòng 3 - bảng trạng thái 6 ô (X = có xe, R = đã đặt, _ = trống)
  display.setCursor(0, 20);
  display.print("P1-6:");
  for (int i = 0; i < NUM_SLOTS; i++) {
    if (slots[i].occupied)             display.print("X");
    else if (slots[i].reservedBy != "") display.print("R");
    else                               display.print("_");
  }

  // Dòng 4 - doanh thu / thông báo
  display.setCursor(0, 30);
  if (extra != "") {
    display.print(extra.substring(0, 20));
  } else if (millis() < statusMsgUntil) {
    display.print(statusMsg.substring(0, 20));
  } else {
    display.print("DT:");
    display.print(revenueToday);
    display.print("d");
  }

  // Dòng 5 - đồng hồ thực tế + trạng thái MQTT
  display.setCursor(0, 40);
  display.print(nowClock());
  display.print(" ");
  display.print(mqttOK ? "MQTT:OK" : "MQTT:WAIT");

  // Dòng 6 - thẻ RFID gần nhất (góc phải)
  display.setCursor(0, 52);
  if (lastRfidCard != "") {
    String rf = "RFID:" + lastRfidCard;
    display.print(rf.substring(0, 18));
  } else {
    display.print("RFID: --");
  }

  display.display();
}

// ============================ MQTT PUBLISH =================================
// Gửi trạng thái của 1 ô đỗ lên broker (retain = giữ lại giá trị mới nhất,
// nên App mở lên là thấy ngay trạng thái, không phải chờ có xe mới cập nhật)
void pubSlot(int i) {
  if (!mqtt.connected()) return;
  StaticJsonDocument<384> d;
  d["id"] = SLOT_ID[i];
  d["occupied"] = slots[i].occupied;
  d["reservedBy"] = slots[i].reservedBy;
  d["currentUser"] = slots[i].currentUser;
  d["updatedAt"] = millis();
  d["clock"] = nowEpochMs();     // [N3] mốc thời gian thực tế
  char t[64]; snprintf(t, sizeof(t), "parking/slot/%s/status", SLOT_ID[i]);
  char b[384]; serializeJson(d, b);
  mqtt.publish(t, b, true);
}

// Gửi ảnh chụp toàn bộ bãi (retain) - App/Server dùng để vẽ lại ngay khi vào
void pubSnapshot() {
  if (!mqtt.connected()) return;
  StaticJsonDocument<1024> d;
  JsonArray a = d.createNestedArray("slots");
  for (int i = 0; i < NUM_SLOTS; i++) {
    JsonObject o = a.createNestedObject();
    o["id"] = SLOT_ID[i];
    o["occupied"] = slots[i].occupied;
    o["reservedBy"] = slots[i].reservedBy;
    o["currentUser"] = slots[i].currentUser;
  }
  d["gate"] = gateState;
  int freeN = 0;
  for (int i = 0; i < NUM_SLOTS; i++) if (!slots[i].occupied) freeN++;
  d["free"] = freeN;
  d["revenue"] = revenueToday;
  d["ts"] = millis();
  d["clock"] = nowEpochMs();     // [N3]
  char b[1024]; serializeJson(d, b);
  mqtt.publish("parking/slots/snapshot", b, true);
}

// Gửi kết quả của 1 lệnh đặt/hủy chỗ (kèm requestId để App khớp đúng
// yêu cầu nó vừa gửi - tránh hiển thị nhầm khi có nhiều request cùng lúc)
void pubBookingState(String slot, String state, String user, String req, bool ok, String msg) {
  if (!mqtt.connected()) return;
  StaticJsonDocument<512> d;
  d["slot"] = slot; d["state"] = state; d["user"] = user;
  d["requestId"] = req; d["ok"] = ok; d["msg"] = msg;
  d["clock"] = nowEpochMs();     // [N3]
  char t[64]; snprintf(t, sizeof(t), "parking/booking/%s/state", slot.c_str());
  char b[512]; serializeJson(d, b);
  mqtt.publish(t, b, true);
}

// Gửi trạng thái cổng barrier
void pubGate() {
  if (!mqtt.connected()) return;
  StaticJsonDocument<256> d;
  d["gate"] = gateState; d["openedBy"] = gateOpenedBy; d["ts"] = millis();
  d["clock"] = nowEpochMs();     // [N3]
  char b[256]; serializeJson(d, b);
  mqtt.publish("parking/gate/barrier/state", b, true);
}

// Gửi sự kiện quét thẻ RFID
void pubRfid(String card, String slot, String ev, String user) {
  if (!mqtt.connected()) return;
  StaticJsonDocument<320> d;
  d["card"] = card; d["slot"] = slot; d["event"] = ev; d["user"] = user; d["ts"] = millis();
  d["clock"] = nowEpochMs();     // [N3]
  char b[320]; serializeJson(d, b);
  mqtt.publish("parking/gate/rfid", b, false);
}

// Gửi hoá đơn khi xe ra (Server dùng để tính doanh thu + lưu lịch sử)
void pubReceipt(String slot, String user, int minutes, long fee) {
  if (!mqtt.connected()) return;
  StaticJsonDocument<384> d;
  d["slot"] = slot; d["user"] = user; d["minutes"] = minutes;
  d["fee"] = fee; d["ts"] = millis();
  d["clock"] = nowEpochMs();     // [N3] giờ giác thực xuất hoá đơn
  char b[384]; serializeJson(d, b);
  mqtt.publish("parking/billing/receipt", b, true);
}

// ================================ LOGIC ======================================
// Mở / đóng cổng barrier (đồng thời đẩy trạng thái lên broker)
void setGate(String g, String by) {
  gateState = g;
  gateOpenedBy = (g == "OPEN") ? by : "";
  if (g == "OPEN") gateOpenedAt = millis();
  barrier.write(g == "OPEN" ? 90 : 0);
  pubGate();
  drawOLED();
}

// Tính tiền theo thời gian gửi xe (ms): 30 phút đầu miễn phí, sau đó tính
// theo giờ và làm tròn lên (61 phút -> 2 giờ)
long calcFee(unsigned long ms) {
  int minutes = max(1, (int)(ms / 60000UL));
  if (minutes <= FREE_MINUTES) return 0;
  return (long)(((minutes + 59) / 60) * FEE_PER_HOUR);
}

// Xe vào 1 ô
void carEnters(int i, String user) {
  slots[i].occupied = true;
  slots[i].enterAt = millis();
  slots[i].currentUser = user;
  pubSlot(i); pubSnapshot();
}

// Xe ra khỏi ô -> tính phí + phát hành hoá đơn
void carLeaves(int i) {
  unsigned long dur = slots[i].enterAt ? (millis() - slots[i].enterAt) : 60000UL;
  int minutes = max(1, (int)(dur / 60000UL));
  long fee = calcFee(dur);
  String user = slots[i].currentUser != "" ? slots[i].currentUser : slots[i].reservedBy;
  if (user == "") user = "KHACH";

  revenueToday += fee;
  Serial.printf("[EXIT] %s user=%s %d phút - %ld VND\n", SLOT_ID[i], user.c_str(), minutes, fee);
  pubReceipt(SLOT_ID[i], user, minutes, fee);
  if (fee > 0) beep(2);
  say("Cam ong " + String(fee) + "d", 3000);

  slots[i].occupied = false;
  slots[i].reservedBy = "";
  slots[i].currentUser = "";
  slots[i].enterAt = 0;
  pubSlot(i); pubSnapshot();
}

// Quét thẻ RFID -> mở barrier cho ô đã đặt chỗ + ghi nhận vào Server
void onRfidCard(String card) {
  lastRfidCard = card;
  Serial.println("[RFID] " + card);

  // Tìm ô đã được đặt chỗ (và chưa có xe)
  int target = -1;
  String owner = "";
  for (int i = 0; i < NUM_SLOTS; i++) {
    if (!slots[i].occupied && slots[i].reservedBy != "") { target = i; owner = slots[i].reservedBy; break; }
  }

  // Ghi nhớ thẻ -> user (tối đa 8 thẻ)
  int ci = -1;
  for (int i = 0; i < 8; i++) if (cardOwner[i] == card) { ci = i; break; }
  if (ci < 0) {
    for (int i = 0; i < 8; i++) if (cardOwner[i] == "") { ci = i; cardOwner[i] = card; ownerCard[i] = owner; break; }
  } else if (owner != "" && ownerCard[ci] == "") {
    ownerCard[ci] = owner;
  }
  if (ci >= 0 && owner == "") owner = ownerCard[ci];

  if (target >= 0) {
    // Thẻ hợp lệ -> mở cổng cho xe vào ô đã đặt
    pubRfid(card, SLOT_ID[target], "ENTER", owner);
    say("THE " + card + " -> " + SLOT_ID[target], 3000);
    setGate("OPEN", owner);
    beep(1);
  } else {
    // Không có ô nào đặt chỗ -> từ chối, còi báo 3 tiếng
    pubRfid(card, "", "DEN", owner);
    say("THE KHONG DUOC DAT", 3000);
    beep(3);
  }
  drawOLED("RFID:" + card);
}

// Xử lý lệnh đặt chỗ / hủy chỗ / xác nhận xe vào - xe ra
void handleBooking(String slot, String user, String act, String req) {
  int i = slotIndex(slot);
  if (i < 0) { pubBookingState(slot, "ERROR", user, req, false, "Sai ma o"); return; }

  if (act == "reserve") {
    // Đặt chỗ: chặn nếu ô đã có xe hoặc đã có người khác đặt
    if (slots[i].occupied) { pubBookingState(slot, "OCCUPIED", user, req, false, "O da co xe"); beep(3); return; }
    if (slots[i].reservedBy != "" && slots[i].reservedBy != user) {
      pubBookingState(slot, "RESERVED", user, req, false, "O da duoc dat boi " + slots[i].reservedBy);
      beep(3); return;
    }
    slots[i].reservedBy = user;
    slots[i].reserveAt = millis();
    pubBookingState(slot, "RESERVED", user, req, true, "Dat o thanh cong, giu cho 5 phut");
    pubSlot(i); pubSnapshot();
    say("DAT " + slot + " OK", 2500);
    beep(1);
  }
  else if (act == "cancel") {
    // Huỷ chỗ: chỉ chính chủ đặt mới được huỷ
    if (slots[i].reservedBy == user) {
      slots[i].reservedBy = "";
      pubBookingState(slot, "FREE", user, req, true, "Da huy dat");
      pubSlot(i); pubSnapshot();
      say("HUY " + slot, 2000);
    } else {
      pubBookingState(slot, "ERROR", user, req, false, "Ban khong phai nguoi dat");
    }
  }
  else if (act == "enter") {
    // App/Serial xác nhận xe vào -> chuyển ô sang chế độ điều khiển thủ công
    manualMode[i] = true;
    carEnters(i, user);
    pubBookingState(slot, "ENTERED", user, req, true, "Da ghi nhan xe vao");
    say("XE VAO " + slot, 2000);
    beep(1);
  }
  else if (act == "exit") {
    // App/Serial xác nhận xe ra -> tính phí, trả ô về chế độ cảm biến bình thường
    manualMode[i] = false;
    bool v = (digitalRead(IR_PIN[i]) == LOW);
    irShadow[i] = v; irRaw[i] = v; irStable[i] = v;
    carLeaves(i);
    pubBookingState(slot, "FREE", user, req, true, "Da ghi nhan xe ra");
  }
}

// Callback khi nhận được message từ broker
void onMsg(char* topic, byte* p, unsigned len) {
  String s; for (unsigned i = 0; i < len; i++) s += (char)p[i];
  StaticJsonDocument<512> d;
  if (deserializeJson(d, s)) return;   // payload hỏng -> bỏ qua, không treo
  String T(topic);

  if (T == "parking/gate/barrier/cmd") {
    // Lệnh mở/đóng cổng từ App
    String c = d["cmd"] | "";
    String by = d["by"] | "APP";
    if (c == "OPEN") { setGate("OPEN", by); beep(1); }
    else setGate("CLOSED", by);
  }
  else if (T.startsWith("parking/booking/")) {
    // Lệnh đặt/hủy chỗ từ App
    String slot  = d["slot"] | "";
    String user  = d["user"] | "";
    String act   = d["action"] | "";
    String req   = d["requestId"] | "";
    handleBooking(slot, user, act, req);
  }
}

// ===================== [N4] WATCHDOG TIMER (TASK WDT) ======================
// Cơ chế: ESP32 có sẵn "Task Watchdog" của ESP-IDF. Ta đăng ký vòng loop()
// vào watchdog với thời gian chờ 15 giây; nếu vòng loop() không "báo sống"
// (gọi esp_task_wdt_reset()) trong 15 giây thì ESP32 tự khởi động lại.
//
// Ý nghĩa thực tế: nếu firmware bị treo (deadlock khi đọc Serial, OLED treo,
// vòng lặp vô hạn...) thì thiết bị TỰ PHỤC HỒI thay vì "chết lặng" im
// lặng. Đây chính là tiêu chí "xử lý mất kết nối / độ ổn định" của Lab 1.
#define WDT_TIMEOUT_S   15       // giây - quá ngưỡng này thì reset
bool wdtEnabled = false;         // watchdog đã bật thành công hay chưa

// Bật watchdog cho vòng loop() chính
void wdtSetup() {
#if HAVE_TASK_WDT
  // ESP32 Arduino core 3.x dùng cấu hình có cấu trúc, core 2.x dùng tham số
  // kiểu cũ -> dùng #if để tương thích cả hai.
#if ESP_ARDUINO_VERSION_MAJOR >= 3
  esp_task_wdt_config_t cfg = {
    .timeout_ms = WDT_TIMEOUT_S * 1000,
    .idle_core_mask = 0,
    .trigger_panic = true
  };
  esp_task_wdt_init(&cfg);
#else
  esp_task_wdt_init(WDT_TIMEOUT_S, true);
#endif
  // Đăng ký chính task đang chạy (Arduino loop task) vào watchdog
  esp_task_wdt_add(NULL);
  wdtEnabled = true;
  Serial.println("[WDT] Watchdog timer da bat (nguong " + String(WDT_TIMEOUT_S) + "s)");
#else
  Serial.println("[WDT] Task WDT khong kha dung tren nen moi - bo qua");
#endif
}

// Báo "vòng loop còn sống" cho watchdog (gọi mỗi vòng lặp)
void wdtKick() {
#if HAVE_TASK_WDT
  if (wdtEnabled) esp_task_wdt_reset();
#endif
}

// Đọc 1 dòng lệnh từ Serial KHÔNG chặn (non-blocking).
// Vì sao không dùng Serial.readStringUntil('\n')? Vì hàm đó đứng im chờ ký tự
// Enter vô hạn -> treo firmware (và watchdog sẽ khởi động lại liên tục).
// Cách này đọc từng ký tự, có giới hạn thời gian chờ -> không bao giờ treo.
String readSerialLine() {
  static String buf = "";
  static unsigned long lastByteAt = 0;
  while (Serial.available() > 0) {
    char c = (char)Serial.read();
    if (c == '\n' || c == '\r') {
      String out = buf;
      buf = "";
      return out;
    }
    if (buf.length() < 64) buf += c;   // giới hạn độ dài để không tràn RAM
    lastByteAt = millis();
  }
  // Quá 3 giây không có ký tự nào -> coi như dòng lệnh bị bỏ dở, xoá bộ đệm
  if (buf.length() > 0 && millis() - lastByteAt > 3000) {
    buf = "";
  }
  return "";
}

// ========================== [N2] KẾT NỐI LẠI WIFI ==========================
// Hàm này được gọi trong loop() mỗi khi mất mạng.
// Trước đây WiFi.begin() chỉ chạy 1 lần trong setup() -> nếu WiFi rớt giữa
// chừng thì ESP32 không bao giờ kết nối lại được (và MQTT reconnect cũng
// vô ích vì không có mạng). Đây là lỗi "mất kết nối" kinh điển cần sửa.
//
// LƯU Ý QUAN TRỌNG: hàm này KHÔNG được dùng delay() dài, vì vòng loop()
// chính sẽ bị treo -> watchdog sẽ khởi động lại ESP32. Vì vậy ta dùng
// cơ chế "trạng thái" (non-blocking): mỗi lần gọi chỉ làm 1 việc nhỏ.
enum WifiStep { WF_IDLE, WF_DISCONNECT, WF_BEGIN, WF_WAITING, WF_OK };
WifiStep wfStep = WF_IDLE;
unsigned long wfStepAt = 0;
bool wifiReady = false;        // đã kết nối WiFi thành công ít nhất 1 lần

bool ensureWifi() {
  if (WiFi.status() == WL_CONNECTED) {
    if (!wifiReady) {
      wifiReady = true;
      Serial.print("[WiFi] Ket noi thanh cong - IP=");
      Serial.println(WiFi.localIP().toString());
      syncNTP();   // có mạng rồi thì đồng bộ lại đồng hồ NTP
    }
    return true;
  }

  // Chưa tới hạn thử lại -> trả về ngay, không chặn
  if (millis() - lastWifiTry < WIFI_RETRY_MS) return false;
  lastWifiTry = millis();

  switch (wfStep) {
    case WF_IDLE:
      Serial.println("[WiFi] Mat ket noi -> thu ket noi lai...");
      WiFi.disconnect();
      WiFi.mode(WIFI_STA);
      wfStep = WF_BEGIN;
      break;

    case WF_BEGIN:
      WiFi.begin(WIFI_SSID, WIFI_PASS);
      wfStepAt = millis();
      wfStep = WF_WAITING;
      break;

    case WF_WAITING:
      if (WiFi.status() == WL_CONNECTED) {
        wfStep = WF_IDLE;
        wifiReady = false;          // ép chạy lại nhánh "thành công" ở lần gọi sau
        Serial.println("[WiFi] Da ket noi lai OK");
      } else if (millis() - wfStepAt > WIFI_MAX_WAIT) {
        Serial.println("[WiFi] Van khong ket noi duoc - se thu lai sau");
        wfStep = WF_IDLE;
      }
      break;

    default:
      wfStep = WF_IDLE;
      break;
  }
  return false;
}

// ============================== SETUP =======================================
void setup() {
  Serial.begin(115200);
  Serial.println("\n=========================================");
  Serial.println(" SMART PARKING - ESP32 (ban nang cap 3.0)");
  Serial.println("=========================================");

  // --- Khởi tạo 6 cảm biến IR ---
  for (int i = 0; i < NUM_SLOTS; i++) {
    pinMode(IR_PIN[i], INPUT_PULLUP);
    bool v = (digitalRead(IR_PIN[i]) == LOW);
    irRaw[i] = v; irStable[i] = v; irShadow[i] = v;
    irChangeAt[i] = millis();
  }
  pinMode(BUZZER_PIN, OUTPUT);
  barrier.attach(SERVO_PIN); barrier.write(0);   // barrier đóng từ đầu

  // --- [N4] Bật watchdog timer cho vòng loop() ---
  wdtSetup();

  // --- OLED SSD1306 (I2C: SDA=D21, SCL=D22) ---
  Wire.begin(21, 22);
  if (!display.begin(SSD1306_EXTERNALVCC, SCREEN_ADDRESS)) {
    Serial.println("[OLED] INIT FAIL - kiem tra DATA=D21 CLK=D22 VCC=3V3");
  } else {
    oledOK = true;
    display.clearDisplay();
    display.setTextSize(1);
    display.setTextColor(SSD1306_WHITE);
    display.setCursor(0, 0); display.println("SMART PARKING");
    display.setCursor(0, 12); display.println("Dang khoi dong...");
    display.setCursor(0, 26); display.println("Dong anh bang thong minh");
    display.setCursor(0, 40); display.println("Ban do xe thong minh");
    display.display();
    Serial.println("[OLED] OK - 128x64 @ 0x3C");
  }

  // --- SPI + RFID RC522 ---
  SPI.begin(18, 19, 23, 5);
  rfid.PCD_Init();
  Serial.println("[RFID] RC522 khoi dong OK");

  // --- WiFi ---
  // BẮT BUỘC phải gọi WiFi.begin() trước khi chờ kết nối.
  // Nếu quên, WiFi.status() sẽ mãi là WL_DISCONNECTED, IP ra 0.0.0.0 và
  // các lệnh mạng (MQTT) sau đó sẽ làm ESP32 bị crash (assert).
  Serial.print("[WiFi] ");
  if (strlen(WIFI_PASS) > 0) WiFi.begin(WIFI_SSID, WIFI_PASS);
  else                        WiFi.begin(WIFI_SSID);   // mạng không mật khẩu
  int t = 0;
  while (WiFi.status() != WL_CONNECTED && t < 60) {
    delay(400); Serial.print(".");
    wdtKick();      // giữ watchdog "sống" trong lúc chờ kết nối
    t++;
  }
  Serial.println(" IP=" + WiFi.localIP().toString());
  wifiReady = (WiFi.status() == WL_CONNECTED);
  if (!wifiReady) {
    Serial.println("[WiFi] Chua ket noi duoc - se thu lai trong vong loop()");
  }

  // --- [N3] Đồng bộ đồng hồ thực tế qua NTP ---
  if (WiFi.status() == WL_CONNECTED) syncNTP();

  if (oledOK) {
    display.clearDisplay();
    display.setCursor(0, 0);  display.println(WiFi.localIP().toString());
    display.setCursor(0, 14); display.println("MQTT...");
    display.display();
  }

  // --- Cấu hình client MQTT ---
#if MQTT_USE_WS
  // Chế độ WebSocket: địa chỉ broker đã nằm trong WebSocketClient250,
  // nên không cần (và không được) gọi mqtt.setServer() cho chế độ này.
  // Thay vào đó ta MỞ kết nối WebSocket tới đường dẫn /mqtt.
  wsClient.begin(MQTT_PATH);
  Serial.print("[MQTT] Ket noi WebSocket ");
  Serial.print(MQTT_HOST);
  Serial.print(MQTT_PATH);
  Serial.println(" ...");
#else
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
#endif
  mqtt.setCallback(onMsg);
  mqtt.setBufferSize(2048);
  mqtt.setKeepAlive(30);          // timeout 30s -> broker tự ngắt nếu ESP32 im lặng
  mqtt.setSocketTimeout(5);       // không chờ socket quá 5s khi mạng chậm
#if MQTT_USE_WS
  // [N1] Đường truyền = wss:// (TLS + WebSocket) -> dữ liệu được mã hoá.
#if MQTT_USE_CA
  espSecureClient.setCACert(MQTT_CA);   // có nhúng CA -> xác thực chứng thư broker
#else
  espSecureClient.setInsecure();        // Wokwi: chưa nhúng CA -> bỏ xác thực chữ ký
#endif
  espSecureClient.setHandshakeTimeout(10000);
  // Broker cloud dùng chứng thư hợp lệ (Let's Encrypt) nên không cần
  // nhúng CA riêng. Vòng loop() sẽ tự gọi mqttTryConnect() lại mỗi 3 giây
  // nếu kết nối rớt -> tự phục hồi.
#else
#if MQTT_USE_TLS
  // Chế độ local: MQTT/TCP + TLS tới cổng 8883 của broker Mosquitto
  mqtt.setTransport(espSecureClient, true);
#if MQTT_USE_CA
  espSecureClient.setCACert(MQTT_CA);
#else
  espSecureClient.setInsecure();
#endif
#endif
#endif
  // CHỈ thử MQTT khi đã có mạng. Gọi mqtt.connect() khi chưa có IP sẽ làm
  // ESP32 crash (assert trong thư viện network) -> phải chặn trước.
  if (wifiReady) mqttTryConnect();
  else           Serial.println("[MQTT] Chua co mang - tam doi ket noi MQTT");
  drawOLED();
}

// ======================= KẾT NỐI / KẾT NỐI LẠI MQTT =========================
bool mqttTryConnect() {
  String id = "esp32-parking-" + String(random(0xffff), HEX);

  // [N1] Đăng nhập broker bằng user/password.
  //      - Nếu broker yêu cầu xác thực (đúng cấu hình ACL của Lab 2) thì bắt buộc
  //        có user/pass, nếu không broker sẽ từ chối kết nối.
  //      - Nếu broker cho phép anonymous thì để MQTT_USER/MQTT_PASS rỗng.
  bool ok;
  if (strlen(MQTT_USER) > 0) {
    // LWT: broker sẽ tự publish "offline" khi ESP32 mất kết nối đột ngột
    ok = mqtt.connect(id.c_str(), MQTT_USER, MQTT_PASS,
                      "parking/system/status", 1, true, "{\"online\":false}");
  } else {
    ok = mqtt.connect(id.c_str(), "parking/system/status", 1, true, "{\"online\":false}");
  }

  if (ok) {
    Serial.println("[MQTT] OK -> " + String(MQTT_HOST));
    mqtt.publish("parking/system/status", "{\"online\":true}", true);
    mqtt.subscribe("parking/booking/+/set", 1);
    mqtt.subscribe("parking/gate/barrier/cmd", 1);
    pubSnapshot();
    for (int i = 0; i < NUM_SLOTS; i++) pubSlot(i);
    pubGate();
  } else {
    Serial.print("[MQTT] fail rc="); Serial.println(mqtt.state());
    // Giải thích mã lỗi để dễ debug
    if (mqtt.state() == -4) Serial.println("       -> Sai user/password hoac broker tu choi");
    if (mqtt.state() == -2) Serial.println("       -> Khong ket noi duoc den broker");
    if (mqtt.state() == -3) Serial.println("       -> MQTT ket noi bi dong");
  }
  return ok;
}

// ================================ LOOP ======================================
// Xử lý lệnh Serial để demo nhanh trên Wokwi (không cần MQTT)
//   RFID:A1B2C3      -> giả quét thẻ
//   BOOK:P1:SV01     -> đặt chỗ P1 cho SV01
//   CANCEL:P1:SV01   -> hủy đặt chỗ
//   ENTER:P1:SV01    -> giả xe vào P1
//   EXIT:P1          -> giả xe ra P1 (tính phí)
//   GATE:OPEN / GATE:CLOSE
//   DEMO              -> bật/tắt chế độ demo tự động
bool demoMode = false;

void handleSerialCmd(String l) {
  l.trim();
  if (l == "") return;
  if (l.startsWith("RFID:")) { onRfidCard(l.substring(5)); return; }
  if (l.startsWith("BOOK:")) {
    int a = l.indexOf(':'); int b = l.indexOf(':', a + 1);
    if (a > 0 && b > a) {
      handleBooking(l.substring(a + 1, b), l.substring(b + 1), "reserve", "serial");
    }
    return;
  }
  if (l.startsWith("CANCEL:")) {
    int a = l.indexOf(':'); int b = l.indexOf(':', a + 1);
    if (a > 0 && b > a) {
      handleBooking(l.substring(a + 1, b), l.substring(b + 1), "cancel", "serial");
    }
    return;
  }
  if (l.startsWith("ENTER:")) {
    int a = l.indexOf(':'); int b = l.indexOf(':', a + 1);
    if (a > 0 && b > a) {
      handleBooking(l.substring(a + 1, b), l.substring(b + 1), "enter", "serial");
    }
    return;
  }
  if (l.startsWith("EXIT:")) {
    handleBooking(l.substring(5), "KHACH", "exit", "serial");
    return;
  }
  if (l == "GATE:OPEN")  { setGate("OPEN", "SERIAL"); beep(1); return; }
  if (l == "GATE:CLOSE") { setGate("CLOSED", "SERIAL"); return; }
  if (l == "DEMO") { demoMode = !demoMode; say(demoMode ? "DEMO BAT" : "DEMO TAT", 2000); return; }
  Serial.println("LENH KHONG HOP LE: " + l);
}

unsigned long lastDemo = 0;

void loop() {
  // [N4] Báo "vòng loop còn sống" cho watchdog (nếu quá 15s không gọi lại
  //      hàm này thì ESP32 tự khởi động lại - tự phục hồi khi firmware treo)
  wdtKick();

  // --- [N2] Đảm bảo có WiFi (tự kết nối lại nếu rớt mạng) ---
  ensureWifi();

  // --- MQTT ---
  // Chỉ thử kết nối/kết nối lại MQTT khi đã có mạng WiFi.
  // (mqtt.connect() khi chưa có IP sẽ làm ESP32 crash)
  if (!mqtt.connected()) {
    mqttOK = false;
    if (wifiReady && millis() - lastMqttTry > 3000) {
      lastMqttTry = millis();
      Serial.println("[MQTT] Thu ket noi lai...");
      mqttTryConnect();
    }
  } else {
    mqttOK = true;
    mqtt.loop();
  }

  // --- Đọc cảm biến IR 6 ô (có lọc nhiễu debounce) ---
  // Bước 1: đọc tín hiệu thô mỗi 50ms
  // Bước 2: chỉ chấp nhận khi tín hiệu giữ liên tục DEBOUNCE_MS (200ms)
  //         -> loại bỏ hiện tượng bounce của nút bấm
  // Bước 3: khi trạng thái đã ổn định -> ghi nhận xe vào / xe ra
  static unsigned long lastRead = 0;
  if (millis() - lastRead > 50) {
    lastRead = millis();
    bool ch = false;
    for (int i = 0; i < NUM_SLOTS; i++) {
      bool raw = (digitalRead(IR_PIN[i]) == LOW);
      if (raw != irRaw[i]) {
        irRaw[i] = raw;
        irChangeAt[i] = millis();
      } else if (raw != irStable[i] && millis() - irChangeAt[i] >= DEBOUNCE_MS) {
        // Đã giữ ổn định >= 200ms -> chấp nhận trạng thái mới
        irStable[i] = raw;
        if (manualMode[i]) { irShadow[i] = raw; continue; }  // ô thủ công -> bỏ qua
        if (raw) {
          // Xe vào: giữ user đã đặt chỗ nếu có
          String u = slots[i].reservedBy;
          carEnters(i, u);
          Serial.printf("[IN ] %s xe vao%s\n", SLOT_ID[i], u != "" ? (" user=" + u).c_str() : "");
          beep(1);
          say("XE VAO " + String(SLOT_ID[i]), 2000);
        } else {
          carLeaves(i);
        }
        irShadow[i] = raw;
        ch = true;
      }
    }
    if (ch) drawOLED();
  }

  // --- Hết hạn giữ chỗ sau 5 phút ---
  if (millis() - lastExpiry > 5000) {
    lastExpiry = millis();
    for (int i = 0; i < NUM_SLOTS; i++) {
      if (slots[i].reservedBy != "" && !slots[i].occupied &&
          millis() - slots[i].reserveAt > BOOKING_TIMEOUT) {
        Serial.printf("[EXP] %s het han giu cho (%s)\n", SLOT_ID[i], slots[i].reservedBy.c_str());
        pubBookingState(SLOT_ID[i], "EXPIRED", slots[i].reservedBy, "", false, "Het han giu cho 5 phut");
        slots[i].reservedBy = "";
        pubSlot(i); pubSnapshot();
        say("HET HAN " + String(SLOT_ID[i]), 2500);
      }
    }
  }

  // --- Barrier tự đóng ---
  if (gateState == "OPEN" && millis() - gateOpenedAt > GATE_OPEN_MS) {
    setGate("CLOSED", "AUTO");
  }

  // --- RFID ---
  if (rfid.PICC_IsNewCardPresent() && rfid.PICC_ReadCardSerial()) {
    String c = uidToString(rfid.uid);
    rfid.PICC_HaltA();
    onRfidCard(c);
  }

  // --- Lệnh Serial (đọc không chặn để không treo firmware) ---
  String l = readSerialLine();
  if (l.length() > 0) handleSerialCmd(l);

  // --- Chế độ demo tự động (giả xe ra vào) ---
  if (demoMode && millis() - lastDemo > 8000) {
    lastDemo = millis();
    int freeIdx[NUM_SLOTS], busyIdx[NUM_SLOTS];
    int nf = 0, nb = 0;
    for (int i = 0; i < NUM_SLOTS; i++) {
      if (!slots[i].occupied) freeIdx[nf++] = i; else busyIdx[nb++] = i;
    }
    if (nf > 0 && (nb == 0 || random(100) < 60)) {
      int i = freeIdx[random(nf)];
      slots[i].reservedBy = "KHACH" + String(random(1, 9));
      carEnters(i, slots[i].reservedBy);
      Serial.printf("[DEMO] Xe vao %s\n", SLOT_ID[i]);
    } else if (nb > 0) {
      carLeaves(busyIdx[random(nb)]);
    }
  }

  // --- Refresh OLED + log Serial ---
  if (millis() - lastLcd > 1000) {
    lastLcd = millis();
    drawOLED();
    Serial.print("Slots: ");
    for (int i = 0; i < NUM_SLOTS; i++) Serial.print(slots[i].occupied ? "X" : "_");
    Serial.print(" MQTT:");
    Serial.print(mqttOK ? "OK" : "WAIT");
    Serial.print(" Clock:");
    Serial.print(clockOK ? nowClock() : "--:--:--");
    Serial.print(" DT:");
    Serial.print(revenueToday);
    Serial.println("d");
  }

  // --- Heartbeat (nhịp sống) gửi lên Server mỗi 15 giây ---
  if (mqtt.connected() && millis() - lastBeat > 15000) {
    lastBeat = millis();
    StaticJsonDocument<384> h;
    h["uptime"] = millis() / 1000;        // số giây đã chạy
    h["wifi"] = WiFi.RSSI();              // cường độ tín hiệu WiFi (dBm)
    h["freeHeap"] = ESP.getFreeHeap();    // RAM còn trống (byte)
    h["revenue"] = revenueToday;
    h["firmware"] = "3.0";
    h["clockOK"] = clockOK;               // [N3] đã đồng bộ NTP hay chưa
    h["clock"] = nowEpochMs();            // [N3] giờ thực tế
    h["wdt"] = wdtEnabled;                // [N4] watchdog đang bật
    char b[384]; serializeJson(h, b);
    mqtt.publish("parking/system/heartbeat", b, false);
  }

  // --- Snapshot định kỳ (mỗi 30 giây) ---
  if (mqtt.connected() && millis() - lastSnapshot > 30000) {
    lastSnapshot = millis();
    pubSnapshot();
  }
}
