// LAB1 - Smart Parking firmware ESP32 (ban chot Wokwi LCD song song)
// Thu vien Wokwi: PubSubClient, ArduinoJson, ESP32Servo, MFRC522
// LiquidCrystal la thu vien mac dinh, khong can cai

#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <ESP32Servo.h>
#include <LiquidCrystal.h>
#include <SPI.h>
#include <MFRC522.h>

const char* WIFI_SSID = "Wokwi-GUEST";
const char* WIFI_PASS = "";
const char* MQTT_HOST = "test.mosquitto.org";
const int   MQTT_PORT = 1883;
const char* MQTT_USER = "";
const char* MQTT_PASS = "";

#define NUM_SLOTS 6
const char* SLOT_ID[NUM_SLOTS] = {"P1","P2","P3","P4","P5","P6"};
const int IR_PIN[NUM_SLOTS] = {13, 12, 14, 27, 26, 25};
const int SERVO_PIN = 15;
const int BUZZER_PIN = 2;
#define RFID_SS 5
#define RFID_RST 4
#define LCD_RS 16
#define LCD_E  17
#define LCD_D4 21
#define LCD_D5 22
#define LCD_D6 32
#define LCD_D7 33

#define BOOKING_TIMEOUT_MS (5UL*60UL*1000UL)
#define FEE_PER_HOUR 3000
#define FEE_FIRST_30MIN_FREE true

WiFiClient espClient;
PubSubClient mqtt(espClient);
Servo barrier;
LiquidCrystal lcd(LCD_RS, LCD_E, LCD_D4, LCD_D5, LCD_D6, LCD_D7);
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
unsigned long lastSnapshot = 0, lastBeat = 0, lastLcd = 0, lastMqttTry = 0;
bool mqttOK = false;

int slotIndex(String id){ for(int i=0;i<NUM_SLOTS;i++) if(id==SLOT_ID[i]) return i; return -1; }
void beep(int n=2){ for(int i=0;i<n;i++){ digitalWrite(BUZZER_PIN,HIGH); delay(120); digitalWrite(BUZZER_PIN,LOW); delay(120);} }

void drawLCD(String line2extra = "") {
  int freeN = 0; for(int i=0;i<NUM_SLOTS;i++) if(!slots[i].occupied) freeN++;
  lcd.clear(); lcd.setCursor(0,0);
  String l1 = "Trong:" + String(freeN) + "/6 " + gateState;
  lcd.print(l1.substring(0,16));
  lcd.setCursor(0,1);
  String s="";
  for(int i=0;i<NUM_SLOTS;i++) s += slots[i].occupied?"X":(slots[i].reservedBy!=""?"R":"_");
  if(line2extra != "") s = line2extra.substring(0,16);
  lcd.print(s);
}

void pubSlot(int i){
  if(!mqtt.connected()) return;
  StaticJsonDocument<256> d;
  d["id"]=SLOT_ID[i]; d["occupied"]=slots[i].occupied;
  d["reservedBy"]=slots[i].reservedBy; d["updatedAt"]=millis();
  char t[64]; snprintf(t,sizeof(t),"parking/slot/%s/status",SLOT_ID[i]);
  char buf[256]; serializeJson(d,buf);
  mqtt.publish(t,buf,true);
}
void pubSnapshot(){
  if(!mqtt.connected()) return;
  StaticJsonDocument<1024> d; JsonArray a=d.createNestedArray("slots");
  for(int i=0;i<NUM_SLOTS;i++){ JsonObject o=a.createNestedObject();
    o["id"]=SLOT_ID[i]; o["occupied"]=slots[i].occupied; o["reservedBy"]=slots[i].reservedBy; }
  d["gate"]=gateState; d["ts"]=millis();
  char buf[1024]; serializeJson(d,buf);
  mqtt.publish("parking/slots/snapshot",buf,true);
}
void pubBookingState(String slot, String state, String user, String reqId, bool ok, String msg){
  if(!mqtt.connected()) return;
  StaticJsonDocument<384> d;
  d["slot"]=slot; d["state"]=state; d["user"]=user; d["requestId"]=reqId; d["ok"]=ok; d["msg"]=msg;
  char t[64]; snprintf(t,sizeof(t),"parking/booking/%s/state",slot.c_str());
  char buf[384]; serializeJson(d,buf); mqtt.publish(t,buf,true);
}
void pubGate(){
  if(!mqtt.connected()) return;
  StaticJsonDocument<256> d; d["gate"]=gateState; d["ts"]=millis();
  char buf[256]; serializeJson(d,buf); mqtt.publish("parking/gate/barrier/state",buf,true);
}
void pubReceipt(int i, String user){
  if(!mqtt.connected()) return;
  unsigned long mins = (millis()-slots[i].enterAt)/60000; if(mins<1) mins=1;
  long fee = 0;
  if(!(FEE_FIRST_30MIN_FREE && mins<=30)) fee = ((mins+59)/60)*FEE_PER_HOUR;
  StaticJsonDocument<256> d; d["slot"]=SLOT_ID[i]; d["user"]=user;
  d["minutes"]=(int)mins; d["fee"]=fee;
  char buf[256]; serializeJson(d,buf); mqtt.publish("parking/billing/receipt",buf,false);
}
void setGate(String g){ gateState=g; barrier.write(g=="OPEN"?90:0); pubGate(); drawLCD(); }

void onMsg(char* topic, byte* p, unsigned int len){
  String s; for(unsigned i=0;i<len;i++) s+=(char)p[i];
  StaticJsonDocument<384> d; if(deserializeJson(d,s)) return;
  String T(topic);
  if(T=="parking/gate/barrier/cmd"){
    String cmd=d["cmd"]|"";
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
      pubSlot(i); pubSnapshot(); beep(1); drawLCD();
    } else if(act=="cancel"){
      if(slots[i].reservedBy==user){ slots[i].reservedBy=""; pubBookingState(slot,"FREE",user,req,true,"Da huy dat"); pubSlot(i); pubSnapshot(); drawLCD(); }
      else pubBookingState(slot,"ERROR",user,req,false,"Ban khong phai nguoi dat");
    }
  }
}

void setup(){
  Serial.begin(115200);
  for(int i=0;i<NUM_SLOTS;i++) pinMode(IR_PIN[i],INPUT_PULLUP);
  pinMode(BUZZER_PIN,OUTPUT);
  barrier.attach(SERVO_PIN); barrier.write(0);
  lcd.begin(16,2);
  lcd.clear(); lcd.setCursor(0,0); lcd.print("Smart Parking");
  lcd.setCursor(0,1); lcd.print("WiFi...");
  SPI.begin(18,19,23,5);
  rfid.PCD_Init();
  WiFi.begin(WIFI_SSID,WIFI_PASS);
  Serial.print("WiFi..."); int t=0; while(WiFi.status()!=WL_CONNECTED && t<50){ delay(400); Serial.print("."); t++; }
  Serial.println(WiFi.localIP());
  lcd.clear(); lcd.setCursor(0,0); lcd.print(WiFi.localIP().toString());
  lcd.setCursor(0,1); lcd.print("MQTT...");
  delay(800);
  mqtt.setServer(MQTT_HOST,MQTT_PORT); mqtt.setCallback(onMsg); mqtt.setBufferSize(2048);
  drawLCD();
}

bool mqttTryConnect(){
  String id="esp32-parking-"+String(random(0xffff),HEX);
  bool ok = mqtt.connect(id.c_str(),"parking/system/status",1,true,"{\"online\":false}");
  if(ok){
    Serial.println("MQTT OK");
    mqtt.publish("parking/system/status","{\"online\":true}",true);
    mqtt.subscribe("parking/booking/+/set",1);
    mqtt.subscribe("parking/gate/barrier/cmd",1);
    pubSnapshot(); for(int i=0;i<NUM_SLOTS;i++) pubSlot(i); pubGate();
  } else {
    Serial.print("MQTT fail rc="); Serial.println(mqtt.state());
  }
  return ok;
}

void loop(){
  if(!mqtt.connected()){
    mqttOK = false;
    if(millis()-lastMqttTry > 3000){ lastMqttTry = millis(); Serial.println("Thu ket noi MQTT..."); mqttTryConnect(); }
  } else { mqttOK = true; mqtt.loop(); }

  static unsigned long lastRead=0;
  if(millis()-lastRead>200){
    lastRead=millis();
    bool changed=false;
    for(int i=0;i<NUM_SLOTS;i++){
      bool occ = (digitalRead(IR_PIN[i])==LOW);
      if(occ!=slots[i].occupied){
        slots[i].occupied=occ; changed=true;
        if(occ){ slots[i].enterAt=millis();
          if(mqtt.connected()){
            StaticJsonDocument<192> e; e["slot"]=SLOT_ID[i]; e["event"]="ENTER";
            char b[192]; serializeJson(e,b); mqtt.publish("parking/gate/rfid",b,false);
          }
        } else {
          if(slots[i].enterAt>0) pubReceipt(i, slots[i].reservedBy!=""?slots[i].reservedBy:"guest");
          slots[i].reservedBy=""; slots[i].enterAt=0; slots[i].parkedCard="";
          pubBookingState(SLOT_ID[i],"FREE","", "",true,"O trong");
        }
        pubSlot(i); pubSnapshot();
      }
    }
    for(int i=0;i<NUM_SLOTS;i++)
      if(slots[i].reservedBy!="" && !slots[i].occupied && millis()-slots[i].reserveAt>BOOKING_TIMEOUT_MS){
        slots[i].reservedBy=""; pubBookingState(SLOT_ID[i],"FREE","", "",true,"Het han giu cho");
        pubSlot(i); pubSnapshot(); beep(2); changed=true;
      }
    if(changed) drawLCD();
  }
  if(rfid.PICC_IsNewCardPresent() && rfid.PICC_ReadCardSerial()){
    String c=""; for(byte i=0;i<rfid.uid.size;i++){ char h[4]; sprintf(h,"%02X",rfid.uid.uidByte[i]); c+=h; }
    if(mqtt.connected()){
      StaticJsonDocument<192> e; e["card"]=c; e["event"]="SCAN"; char b[192]; serializeJson(e,b);
      mqtt.publish("parking/gate/rfid",b,false);
    }
    Serial.print("RFID: "); Serial.println(c);
    beep(1); rfid.PICC_HaltA(); drawLCD(c);
  }
  if(Serial.available()){ String l=Serial.readStringUntil('\n'); l.trim();
    if(l.startsWith("RFID:")){ String c=l.substring(5);
      Serial.print("RFID manual: "); Serial.println(c);
      if(mqtt.connected()){
        StaticJsonDocument<192> e; e["card"]=c; e["event"]="SCAN"; char b[192]; serializeJson(e,b);
        mqtt.publish("parking/gate/rfid",b,false);
      }
      drawLCD(c); } }
  if(millis()-lastLcd>1000){
    lastLcd=millis();
    drawLCD();
    Serial.print("Slots: ");
    for(int i=0;i<NUM_SLOTS;i++) Serial.print(slots[i].occupied?"X":"_");
    Serial.print(" MQTT:"); Serial.println(mqttOK?"OK":"WAIT");
  }
  if(mqtt.connected() && millis()-lastBeat>15000){ lastBeat=millis();
    StaticJsonDocument<192> h; h["uptime"]=millis()/1000; h["wifi"]=WiFi.RSSI(); h["freeHeap"]=ESP.getFreeHeap();
    char b[192]; serializeJson(h,b); mqtt.publish("parking/system/heartbeat",b,false); }
  if(mqtt.connected() && millis()-lastSnapshot>30000){ lastSnapshot=millis(); pubSnapshot(); }
}
