// LAB1 - Smart Parking firmware ESP32 (chay that + Wokwi)
// Thu vien: PubSubClient, ArduinoJson, LiquidCrystal_I2C, MFRC522, ESP32Servo
// Wokwi: nut nhan = cam bien IR tung o (LOW = co xe), RFID mo phong bang Serial: "RFID:A1B2C3"

#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <ESP32Servo.h>
#include <LiquidCrystal_I2C.h>
#include <SPI.h>
#include <MFRC522.h>

// ---------- Cau hinh WiFi / Broker (doi theo may) ----------
const char* WIFI_SSID = "Wokwi-GUEST";
const char* WIFI_PASS = "";
const char* MQTT_HOST = "test.mosquitto.org"; // demo; khi co broker docker thi doi IP
const int   MQTT_PORT = 1883;
const char* MQTT_USER = "esp32";
const char* MQTT_PASS = "esp32123";

#define NUM_SLOTS 6
const char* SLOT_ID[NUM_SLOTS] = {"P1","P2","P3","P4","P5","P6"};
const int IR_PIN[NUM_SLOTS] = {13, 12, 14, 27, 26, 25}; // IR tung o
const int SERVO_PIN = 18;
const int BUZZER_PIN = 23;
#define RFID_SS 5
#define RFID_RST 22

#define BOOKING_TIMEOUT_MS (5UL*60UL*1000UL)
#define FEE_PER_HOUR 3000
#define FEE_FIRST_30MIN_FREE true

WiFiClient espClient;
PubSubClient mqtt(espClient);
Servo barrier;
LiquidCrystal_I2C lcd(0x27, 16, 2);
MFRC522 rfid(RFID_SS, RFID_RST);

struct Slot {
  bool occupied = false;
  String reservedBy = "";
  unsigned long reserveAt = 0;
  unsigned long enterAt = 0;
  String parkedCard = "";
};
Slot slots[NUM_SLOTS];
String gateState = "CLOSED";
unsigned long lastSnapshot = 0, lastBeat = 0, lastLcd = 0;

int slotIndex(String id){ for(int i=0;i<NUM_SLOTS;i++) if(id==SLOT_ID[i]) return i; return -1; }
void beep(int n=2){ for(int i=0;i<n;i++){ digitalWrite(BUZZER_PIN,HIGH); delay(120); digitalWrite(BUZZER_PIN,LOW); delay(120);} }

void pubSlot(int i){
  StaticJsonDocument<256> d;
  d["id"]=SLOT_ID[i]; d["occupied"]=slots[i].occupied;
  d["reservedBy"]=slots[i].reservedBy; d["updatedAt"]=millis();
  char t[64]; snprintf(t,sizeof(t),"parking/slot/%s/status",SLOT_ID[i]);
  char buf[256]; serializeJson(d,buf);
  mqtt.publish(t,buf,true); // retain: client moi vao thay ngay
}
void pubSnapshot(){
  StaticJsonDocument<1024> d; JsonArray a=d.createNestedArray("slots");
  for(int i=0;i<NUM_SLOTS;i++){ JsonObject o=a.createNestedObject();
    o["id"]=SLOT_ID[i]; o["occupied"]=slots[i].occupied; o["reservedBy"]=slots[i].reservedBy; }
  d["gate"]=gateState; d["ts"]=millis();
  char buf[1024]; serializeJson(d,buf);
  mqtt.publish("parking/slots/snapshot",buf,true);
}
void pubBookingState(String slot, String state, String user, String reqId, bool ok, String msg){
  StaticJsonDocument<384> d;
  d["slot"]=slot; d["state"]=state; d["user"]=user; d["requestId"]=reqId; d["ok"]=ok; d["msg"]=msg;
  char t[64]; snprintf(t,sizeof(t),"parking/booking/%s/state",slot.c_str());
  char buf[384]; serializeJson(d,buf); mqtt.publish(t,buf,true);
}
void pubGate(){ StaticJsonDocument<256> d; d["gate"]=gateState; d["ts"]=millis();
  char buf[256]; serializeJson(d,buf); mqtt.publish("parking/gate/barrier/state",buf,true); }
void pubReceipt(int i, String user){
  unsigned long mins = (millis()-slots[i].enterAt)/60000; if(mins<1) mins=1;
  long fee = 0;
  if(!(FEE_FIRST_30MIN_FREE && mins<=30)) fee = ((mins+59)/60)*FEE_PER_HOUR;
  StaticJsonDocument<256> d; d["slot"]=SLOT_ID[i]; d["user"]=user;
  d["minutes"]=(int)mins; d["fee"]=fee;
  char buf[256]; serializeJson(d,buf); mqtt.publish("parking/billing/receipt",buf,false);
}
void setGate(String g){ gateState=g; barrier.write(g=="OPEN"?90:0); pubGate(); }

void onMsg(char* topic, byte* p, unsigned int len){
  String s; for(unsigned i=0;i<len;i++) s+=(char)p[i];
  StaticJsonDocument<384> d; if(deserializeJson(d,s)) return;
  String T(topic);
  if(T=="parking/gate/barrier/cmd"){
    String cmd=d["cmd"]|"", by=d["by"]|"", req=d["requestId"]|"";
    if(cmd=="OPEN"){ setGate("OPEN"); beep(1); }
    else setGate("CLOSED");
  } else if(T.startsWith("parking/booking/") && T.endsWith("/set")){
    String slot=d["slot"]|"", user=d["user"]|"", act=d["action"]|"", req=d["requestId"]|"";
    int i=slotIndex(slot);
    if(i<0){ pubBookingState(slot,"ERROR",user,req,false,"Sai ma o"); return; }
    if(act=="reserve"){
      if(slots[i].occupied){ pubBookingState(slot,"OCCUPIED",user,req,false,"O da co xe"); beep(3); return; }
      if(slots[i].reservedBy!="" && slots[i].reservedBy!=user){ pubBookingState(slot,"RESERVED",user,req,false,"O da duoc dat boi "+slots[i].reservedBy); beep(3); return; }
      slots[i].reservedBy=user; slots[i].reserveAt=millis();
      pubBookingState(slot,"RESERVED",user,req,true,"Dat o thanh cong, giu cho 5 phut");
      pubSlot(i); pubSnapshot(); beep(1);
    } else if(act=="cancel"){
      if(slots[i].reservedBy==user){ slots[i].reservedBy=""; pubBookingState(slot,"FREE",user,req,true,"Da huy dat"); pubSlot(i); pubSnapshot(); }
      else pubBookingState(slot,"ERROR",user,req,false,"Ban khong phai nguoi dat");
    }
  }
}

void setup(){
  Serial.begin(115200);
  for(int i=0;i<NUM_SLOTS;i++) pinMode(IR_PIN[i],INPUT_PULLUP);
  pinMode(BUZZER_PIN,OUTPUT);
  barrier.attach(SERVO_PIN); barrier.write(0);
  lcd.init(); lcd.backlight();
  SPI.begin(); rfid.PCD_Init();
  WiFi.begin(WIFI_SSID,WIFI_PASS);
  Serial.print("WiFi..."); while(WiFi.status()!=WL_CONNECTED){ delay(400); Serial.print("."); }
  Serial.println(WiFi.localIP());
  mqtt.setServer(MQTT_HOST,MQTT_PORT); mqtt.setCallback(onMsg); mqtt.setBufferSize(2048);
}

void reconnect(){
  while(!mqtt.connected()){
    String id="esp32-parking-"+String(random(0xffff),HEX);
    // LWT: neu ESP32 rot mang, App thay offline ngay
    if(mqtt.connect(id.c_str(),MQTT_USER,MQTT_PASS,"parking/system/status",1,true,"{\"online\":false}")){
      mqtt.publish("parking/system/status","{\"online\":true}",true);
      mqtt.subscribe("parking/booking/+/set",1);
      mqtt.subscribe("parking/gate/barrier/cmd",1);
      pubSnapshot(); for(int i=0;i<NUM_SLOTS;i++) pubSlot(i); pubGate();
    } else delay(2000);
  }
}

void loop(){
  if(!mqtt.connected()) reconnect();
  mqtt.loop();
  // 1) Doc IR (Wokwi: nhan nut = co xe). Chong doi: on dinh 200ms
  static unsigned long lastRead=0; 
  if(millis()-lastRead>200){
    lastRead=millis();
    for(int i=0;i<NUM_SLOTS;i++){
      bool occ = (digitalRead(IR_PIN[i])==LOW);
      if(occ!=slots[i].occupied){
        slots[i].occupied=occ;
        if(occ){ slots[i].enterAt=millis();
          StaticJsonDocument<192> e; e["card"]=slots[i].parkedCard; e["slot"]=SLOT_ID[i]; e["event"]="ENTER";
          char b[192]; serializeJson(e,b); mqtt.publish("parking/gate/rfid",b,false);
          if(slots[i].reservedBy!="") { /* xe cua nguoi dat da vao -> khoa dat */ }
        } else { // xe ra -> tinh tien, xoa dat
          if(slots[i].enterAt>0) pubReceipt(i, slots[i].reservedBy!=""?slots[i].reservedBy:"guest");
          slots[i].reservedBy=""; slots[i].enterAt=0; slots[i].parkedCard="";
          pubBookingState(SLOT_ID[i],"FREE","", "",true,"O trong");
        }
        pubSlot(i); pubSnapshot();
      }
    }
    // het han giu cho 5 phut
    for(int i=0;i<NUM_SLOTS;i++)
      if(slots[i].reservedBy!="" && !slots[i].occupied && millis()-slots[i].reserveAt>BOOKING_TIMEOUT_MS){
        slots[i].reservedBy=""; pubBookingState(SLOT_ID[i],"FREE","", "",true,"Het han giu cho");
        pubSlot(i); pubSnapshot(); beep(2);
      }
  }
  // 2) RFID that (Wokwi go Serial "RFID:A1B2C3")
  if(rfid.PICC_IsNewCardPresent() && rfid.PICC_ReadCardSerial()){
    String c=""; for(byte i=0;i<rfid.uid.size;i++){ char h[4]; sprintf(h,"%02X",rfid.uid.uidByte[i]); c+=h; }
    StaticJsonDocument<192> e; e["card"]=c; e["event"]="SCAN"; char b[192]; serializeJson(e,b);
    mqtt.publish("parking/gate/rfid",b,false); beep(1); rfid.PICC_HaltA();
  }
  if(Serial.available()){ String l=Serial.readStringUntil('\n'); l.trim();
    if(l.startsWith("RFID:")){ String c=l.substring(5);
      StaticJsonDocument<192> e; e["card"]=c; e["event"]="SCAN"; char b[192]; serializeJson(e,b);
      mqtt.publish("parking/gate/rfid",b,false); } }
  // 3) LCD + heartbeat
  if(millis()-lastLcd>1000){ lastLcd=millis(); int free=0; for(int i=0;i<NUM_SLOTS;i++) if(!slots[i].occupied) free++;
    lcd.clear(); lcd.setCursor(0,0); lcd.print("Trong:"+String(free)+"/"+String(NUM_SLOTS)+" Gate:"+gateState); lcd.setCursor(0,1);
    String s=""; for(int i=0;i<NUM_SLOTS;i++) s+= slots[i].occupied?"X":(slots[i].reservedBy!=""?"R":"_"); lcd.print(s); }
  if(millis()-lastBeat>15000){ lastBeat=millis();
    StaticJsonDocument<192> h; h["uptime"]=millis()/1000; h["wifi"]=WiFi.RSSI(); h["freeHeap"]=ESP.getFreeHeap();
    char b[192]; serializeJson(h,b); mqtt.publish("parking/system/heartbeat",b,false); }
  if(millis()-lastSnapshot>30000){ lastSnapshot=millis(); pubSnapshot(); }
}
