// ============================================================================
//  LAB1 - SMART PARKING (Bai do xe thong minh) - ESP32 + Wokwi
//  Ban nang cap hoan chinh cho do an ket thuc hoc phan LTDD2
//
//  Phan cung:
//    ESP32 DevKit V1  |  6 cam bien IR (P1..P6)  |  RFID RC522  |  Servo barrier
//                      |  Buzzer  |  OLED SSD1306 128x64 (I2C)  |  WiFi + MQTT
//
//  Thu vien Wokwi: PubSubClient, ArduinoJson, ESP32Servo, MFRC522,
//                   Adafruit SSD1306, Adafruit GFX Library
//
//  Topic MQTT (xem README.md):
//    ESP32 -> App : parking/slot/<ID>/status, parking/slots/snapshot,
//                   parking/booking/<ID>/state, parking/gate/barrier/state,
//                   parking/gate/rfid, parking/billing/receipt,
//                   parking/system/status, parking/system/heartbeat
//    App -> ESP32 : parking/booking/<ID>/set, parking/gate/barrier/cmd
// ============================================================================

#include <WiFi.h>
#include <Wire.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <ESP32Servo.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <SPI.h>
#include <MFRC522.h>

// ----------------------------- CAU HINH -------------------------------------
const char* WIFI_SSID = "Wokwi-GUEST";
const char* WIFI_PASS = "";
const char* MQTT_HOST = "test.mosquitto.org";
const int   MQTT_PORT = 1883;

#define NUM_SLOTS 6
const char* SLOT_ID[NUM_SLOTS] = {"P1","P2","P3","P4","P5","P6"};
const int IR_PIN[NUM_SLOTS] = {13, 12, 14, 27, 26, 25};
const int SERVO_PIN = 15;
const int BUZZER_PIN = 2;
#define RFID_SS 5
#define RFID_RST 4

#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET -1
#define SCREEN_ADDRESS 0x3C

#define FEE_PER_HOUR      3000L   // 3000 VND / gio
#define FREE_MINUTES      30      // 30 phut dau mien phi
#define BOOKING_TIMEOUT   300000UL // 5 phut (ms) giu cho
#define GATE_OPEN_MS      5000UL  // barrier tu dong dong sau 5s

// ----------------------------- BIEN ----------------------------------------
WiFiClient espClient;
PubSubClient mqtt(espClient);
Servo barrier;
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);
MFRC522 rfid(RFID_SS, RFID_RST);

struct Slot {
  bool occupied = false;
  String reservedBy = "";     // nguoi dat cho
  String currentUser = "";    // nguoi co xe dang dung o o
  unsigned long reserveAt = 0;
  unsigned long enterAt = 0;
};
Slot slots[NUM_SLOTS];

// " Bong" cam bien IR: gia tri cua cam bien gan nhat.
// Vong lap doc IR so sanh irShadow voi tin hieu hien tai.
// Khong dung slots[].occupied de so sanh, vi lenh thu cong (ENTER/EXIT
// qua Serial) cung set occupied -> se bi vong lap ghi de ngay lap tuc.
bool irShadow[NUM_SLOTS] = {false, false, false, false, false, false};

// O nao dang duoc dieu khien thu cong (lenh ENTER/EXIT tu Serial).
// Vong lap doc IR bo qua cac o nay de khong ghi de lenh cua nguoi dung.
bool manualMode[NUM_SLOTS] = {false, false, false, false, false, false};
String gateState = "CLOSED";
String gateOpenedBy = "";
unsigned long gateOpenedAt = 0;
long revenueToday = 0;         // tong doanh thu trong ngay
unsigned long lastLcd = 0, lastMqttTry = 0, lastBeat = 0, lastSnapshot = 0, lastExpiry = 0;
bool mqttOK = false;
bool oledOK = false;
String lastRfidCard = "";
String statusMsg = "SAN SANG";
unsigned long statusMsgUntil = 0;
String cardOwner[8];          // the RFID -> user ( toi da 8 the)
String ownerCard[8];

// ----------------------------- TIEN ICH -------------------------------------
int slotIndex(String id) {
  for (int i = 0; i < NUM_SLOTS; i++) if (id == SLOT_ID[i]) return i;
  return -1;
}

void beep(int n = 2) {
  for (int i = 0; i < n; i++) {
    digitalWrite(BUZZER_PIN, HIGH); delay(120);
    digitalWrite(BUZZER_PIN, LOW);  delay(120);
  }
}

void say(const String& m, uint32_t ms = 2500) {
  statusMsg = m; statusMsgUntil = millis() + ms;
  Serial.println("[MSG] " + m);
}

String uidToString(MFRC522::Uid uid) {
  String c = "";
  for (byte i = 0; i < uid.size; i++) {
    char h[4]; sprintf(h, "%02X", uid.uidByte[i]); c += h;
  }
  return c;
}

// ----------------------------- OLED ----------------------------------------
void drawOLED(String extra = "") {
  if (!oledOK) return;
  int freeN = 0;
  for (int i = 0; i < NUM_SLOTS; i++) if (!slots[i].occupied) freeN++;

  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);

  // Dong 1 - tieu de
  display.setCursor(0, 0);
  display.print("SMART PARKING");
  display.print("  ");
  display.print(mqttOK ? "M" : "-");

  // Dong 2 - trong / barrier
  display.setCursor(0, 10);
  display.print("Trong:");
  display.print(freeN);
  display.print("/6 ");
  display.print(gateState);

  // Dong 3 - bang trang thai 6 o
  display.setCursor(0, 20);
  display.print("P1-6:");
  for (int i = 0; i < NUM_SLOTS; i++) {
    if (slots[i].occupied)          display.print("X");
    else if (slots[i].reservedBy != "") display.print("R");
    else                            display.print("_");
  }

  // Dong 4 - doanh thu / thong bao
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

  // Dong 5 - dong ho + trang thai
  display.setCursor(0, 40);
  unsigned long up = millis() / 1000;
  display.print("Up:");
  display.print(up / 60);
  display.print("m");
  display.print(up % 60);
  display.print("s ");
  display.print(mqttOK ? "MQTT:OK" : "MQTT:WAIT");

  // Dong 6 - dong ke (the RFID gan nhat) o goc phai
  display.setCursor(0, 52);
  if (lastRfidCard != "") {
    String rf = "RFID:" + lastRfidCard;
    display.print(rf.substring(0, 18));
  } else {
    display.print("RFID: --");
  }

  display.display();
}

// ----------------------------- MQTT PUBLISH --------------------------------
void pubSlot(int i) {
  if (!mqtt.connected()) return;
  StaticJsonDocument<384> d;
  d["id"] = SLOT_ID[i];
  d["occupied"] = slots[i].occupied;
  d["reservedBy"] = slots[i].reservedBy;
  d["currentUser"] = slots[i].currentUser;
  d["updatedAt"] = millis();
  char t[64]; snprintf(t, sizeof(t), "parking/slot/%s/status", SLOT_ID[i]);
  char b[384]; serializeJson(d, b);
  mqtt.publish(t, b, true);
}

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
  d["free"] = 0;
  int freeN = 0;
  for (int i = 0; i < NUM_SLOTS; i++) if (!slots[i].occupied) freeN++;
  d["free"] = freeN;
  d["revenue"] = revenueToday;
  d["ts"] = millis();
  char b[1024]; serializeJson(d, b);
  mqtt.publish("parking/slots/snapshot", b, true);
}

void pubBookingState(String slot, String state, String user, String req, bool ok, String msg) {
  if (!mqtt.connected()) return;
  StaticJsonDocument<512> d;
  d["slot"] = slot; d["state"] = state; d["user"] = user;
  d["requestId"] = req; d["ok"] = ok; d["msg"] = msg;
  char t[64]; snprintf(t, sizeof(t), "parking/booking/%s/state", slot.c_str());
  char b[512]; serializeJson(d, b);
  mqtt.publish(t, b, true);
}

void pubGate() {
  if (!mqtt.connected()) return;
  StaticJsonDocument<256> d;
  d["gate"] = gateState; d["openedBy"] = gateOpenedBy; d["ts"] = millis();
  char b[256]; serializeJson(d, b);
  mqtt.publish("parking/gate/barrier/state", b, true);
}

void pubRfid(String card, String slot, String ev, String user) {
  if (!mqtt.connected()) return;
  StaticJsonDocument<320> d;
  d["card"] = card; d["slot"] = slot; d["event"] = ev; d["user"] = user; d["ts"] = millis();
  char b[320]; serializeJson(d, b);
  mqtt.publish("parking/gate/rfid", b, false);
}

void pubReceipt(String slot, String user, int minutes, long fee) {
  if (!mqtt.connected()) return;
  StaticJsonDocument<384> d;
  d["slot"] = slot; d["user"] = user; d["minutes"] = minutes;
  d["fee"] = fee; d["ts"] = millis();
  char b[384]; serializeJson(d, b);
  mqtt.publish("parking/billing/receipt", b, true);
}

// ----------------------------- LOGIC ---------------------------------------
void setGate(String g, String by) {
  gateState = g;
  gateOpenedBy = (g == "OPEN") ? by : "";
  if (g == "OPEN") gateOpenedAt = millis();
  barrier.write(g == "OPEN" ? 90 : 0);
  pubGate();
  drawOLED();
}

// Tinh phi: 30 phut dau mien phi, sau do lam tron len theo gio
long calcFee(unsigned long ms) {
  int minutes = max(1, (int)(ms / 60000UL));
  if (minutes <= FREE_MINUTES) return 0;
  return (long)(((minutes + 59) / 60) * FEE_PER_HOUR);
}

// Xe vao o
void carEnters(int i, String user) {
  slots[i].occupied = true;
  slots[i].enterAt = millis();
  slots[i].currentUser = user;
  pubSlot(i); pubSnapshot();
}

// Xe ra khoi o -> tinh phi + phat han
void carLeaves(int i) {
  unsigned long dur = slots[i].enterAt ? (millis() - slots[i].enterAt) : 60000UL;
  int minutes = max(1, (int)(dur / 60000UL));
  long fee = calcFee(dur);
  String user = slots[i].currentUser != "" ? slots[i].currentUser : slots[i].reservedBy;
  if (user == "") user = "KHACH";

  revenueToday += fee;
  Serial.printf("[EXIT] %s user=%s %d phut - %ld VND\n", SLOT_ID[i], user.c_str(), minutes, fee);
  pubReceipt(SLOT_ID[i], user, minutes, fee);
  if (fee > 0) beep(2);
  say("Cam ong " + String(fee) + "d", 3000);

  slots[i].occupied = false;
  slots[i].reservedBy = "";
  slots[i].currentUser = "";
  slots[i].enterAt = 0;
  pubSlot(i); pubSnapshot();
}
// Quet the RFID -> mo barrier + ghi nhan
void onRfidCard(String card) {
  lastRfidCard = card;
  Serial.println("[RFID] " + card);

  // Tim o da duoc dat cho (va chua co xe)
  int target = -1;
  String owner = "";
  for (int i = 0; i < NUM_SLOTS; i++) {
    if (!slots[i].occupied && slots[i].reservedBy != "") { target = i; owner = slots[i].reservedBy; break; }
  }

  // Ghi nho the -> user
  int ci = -1;
  for (int i = 0; i < 8; i++) if (cardOwner[i] == card) { ci = i; break; }
  if (ci < 0) {
    for (int i = 0; i < 8; i++) if (cardOwner[i] == "") { ci = i; cardOwner[i] = card; ownerCard[i] = owner; break; }
  } else if (owner != "" && ownerCard[ci] == "") {
    ownerCard[ci] = owner;
  }
  if (ci >= 0 && owner == "") owner = ownerCard[ci];

  if (target >= 0) {
    pubRfid(card, SLOT_ID[target], "ENTER", owner);
    say("THE " + card + " -> " + SLOT_ID[target], 3000);
    setGate("OPEN", owner);
    beep(1);
  } else {
    pubRfid(card, "", "DEN", owner);
    say("THE KHONG DUOC DAT", 3000);
    beep(3);
  }
  drawOLED("RFID:" + card);
}

// Dat cho / huy cho
void handleBooking(String slot, String user, String act, String req) {
  int i = slotIndex(slot);
  if (i < 0) { pubBookingState(slot, "ERROR", user, req, false, "Sai ma o"); return; }

  if (act == "reserve") {
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
    // App/Serial xac nhan xe da vao -> chuyen o sang che do dieu khien thu cong
    manualMode[i] = true;
    carEnters(i, user);
    pubBookingState(slot, "ENTERED", user, req, true, "Da ghi nhan xe vao");
    say("XE VAO " + slot, 2000);
    beep(1);
  }
  else if (act == "exit") {
    // App/Serial xac nhan xe ra -> tinh phi, tra o ve che do cam bien binh thuong
    manualMode[i] = false;
    irShadow[i] = (digitalRead(IR_PIN[i]) == LOW);
    carLeaves(i);
    pubBookingState(slot, "FREE", user, req, true, "Da ghi nhan xe ra");
  }
}

void onMsg(char* topic, byte* p, unsigned len) {
  String s; for (unsigned i = 0; i < len; i++) s += (char)p[i];
  StaticJsonDocument<512> d;
  if (deserializeJson(d, s)) return;
  String T(topic);

  if (T == "parking/gate/barrier/cmd") {
    String c = d["cmd"] | "";
    String by = d["by"] | "APP";
    if (c == "OPEN") { setGate("OPEN", by); beep(1); }
    else setGate("CLOSED", by);
  }
  else if (T.startsWith("parking/booking/")) {
    String slot  = d["slot"] | "";
    String user  = d["user"] | "";
    String act   = d["action"] | "";
    String req   = d["requestId"] | "";
    handleBooking(slot, user, act, req);
  }
}

// ----------------------------- SETUP ----------------------------------------
void setup() {
  Serial.begin(115200);
  Serial.println("\n=========================================");
  Serial.println(" SMART PARKING - ESP32 (ban nang cap)");
  Serial.println("=========================================");

  for (int i = 0; i < NUM_SLOTS; i++) {
    pinMode(IR_PIN[i], INPUT_PULLUP);
    irShadow[i] = (digitalRead(IR_PIN[i]) == LOW);
  }
  pinMode(BUZZER_PIN, OUTPUT);
  barrier.attach(SERVO_PIN); barrier.write(0);

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

  SPI.begin(18, 19, 23, 5);
  rfid.PCD_Init();
  Serial.println("[RFID] RC522 khoi dong OK");

  // --- WiFi ---
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("[WiFi] ");
  int t = 0;
  while (WiFi.status() != WL_CONNECTED && t < 60) { delay(400); Serial.print("."); t++; }
  Serial.println(" IP=" + WiFi.localIP().toString());

  if (oledOK) {
    display.clearDisplay();
    display.setCursor(0, 0);  display.println(WiFi.localIP().toString());
    display.setCursor(0, 14); display.println("MQTT...");
    display.display();
  }

  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setCallback(onMsg);
  mqtt.setBufferSize(2048);
  mqttTryConnect();
  drawOLED();
}

bool mqttTryConnect() {
  String id = "esp32-parking-" + String(random(0xffff), HEX);
  // LWT: broker tu publish "offline" khi ESP32 mat ket noi
  bool ok = mqtt.connect(id.c_str(), "parking/system/status", 1, true, "{\"online\":false}");
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
  }
  return ok;
}

// ----------------------------- LOOP -----------------------------------------
// Xu ly lenh Serial de demo nhanh tren Wokwi (khong can MQTT)
//   RFID:A1B2C3   -> gia quet the
//   BOOK:P1:SV01  -> dat cho P1 cho SV01
//   CANCEL:P1:SV01-> huy dat cho
//   ENTER:P1:SV01 -> gia xe vao P1
//   EXIT:P1       -> gia xe ra P1 (tinh phi)
//   GATE:OPEN / GATE:CLOSE
//   DEMO          -> bat/tat che do demo tu dong
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
  // --- MQTT ---
  if (!mqtt.connected()) {
    mqttOK = false;
    if (millis() - lastMqttTry > 3000) {
      lastMqttTry = millis();
      Serial.println("[MQTT] Thu ket noi lai...");
      mqttTryConnect();
    }
  } else {
    mqttOK = true;
    mqtt.loop();
  }

  // --- Doc cam bien IR 6 o ---
  // So sanh voi irShadow (khong phai slots[].occupied) de lenh thu cong
  // (ENTER/EXIT qua Serial) khong bi vong lap nay ghi de ngay.
  static unsigned long lastRead = 0;
  if (millis() - lastRead > 200) {
    lastRead = millis();
    bool ch = false;
    for (int i = 0; i < NUM_SLOTS; i++) {
      bool occ = (digitalRead(IR_PIN[i]) == LOW);
      if (occ == irShadow[i]) continue;   // khong doi -> bo qua
      irShadow[i] = occ;
      if (manualMode[i]) continue;        // o do nguoi dung dieu khien -> bo qua
      if (occ) {
          // Xe vao: giu user da dat cho neu co
          String u = slots[i].reservedBy;
          carEnters(i, u);
          Serial.printf("[IN ] %s xe vao%s\n", SLOT_ID[i], u != "" ? (" user=" + u).c_str() : "");
          beep(1);
          say("XE VAO " + String(SLOT_ID[i]), 2000);
        } else {
          carLeaves(i);
        }
        ch = true;
      }
    }
    if (ch) drawOLED();
  }

  // --- Het han giu cho 5 phut ---
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

  // --- Barrier tu dong dong ---
  if (gateState == "OPEN" && millis() - gateOpenedAt > GATE_OPEN_MS) {
    setGate("CLOSED", "AUTO");
  }

  // --- RFID ---
  if (rfid.PICC_IsNewCardPresent() && rfid.PICC_ReadCardSerial()) {
    String c = uidToString(rfid.uid);
    rfid.PICC_HaltA();
    onRfidCard(c);
  }

  // --- Lenh Serial ---
  if (Serial.available()) {
    String l = Serial.readStringUntil('\n');
    handleSerialCmd(l);
  }

  // --- Che do demo tu dong (gia xe ra vao) ---
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
    Serial.print(" DT:");
    Serial.print(revenueToday);
    Serial.println("d");
  }

  // --- Heartbeat ---
  if (mqtt.connected() && millis() - lastBeat > 15000) {
    lastBeat = millis();
    StaticJsonDocument<256> h;
    h["uptime"] = millis() / 1000;
    h["wifi"] = WiFi.RSSI();
    h["freeHeap"] = ESP.getFreeHeap();
    h["revenue"] = revenueToday;
    h["firmware"] = "2.0";
    char b[256]; serializeJson(h, b);
    mqtt.publish("parking/system/heartbeat", b, false);
  }

  // --- Snapshot dinh ky ---
  if (mqtt.connected() && millis() - lastSnapshot > 30000) {
    lastSnapshot = millis();
    pubSnapshot();
  }
}
