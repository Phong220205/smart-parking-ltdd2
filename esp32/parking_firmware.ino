// LAB1 - Smart Parking firmware ESP32 (ban OLED SSD1306 thay LCD)
// Thu vien Wokwi: PubSubClient, ArduinoJson, ESP32Servo, MFRC522, Adafruit GFX, Adafruit SSD1306

#include <WiFi.h>
#include <Wire.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <ESP32Servo.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <SPI.h>
#include <MFRC522.h>

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

WiFiClient espClient;
PubSubClient mqtt(espClient);
Servo barrier;
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);
MFRC522 rfid(RFID_SS, RFID_RST);

struct Slot { bool occupied=false; String reservedBy=""; unsigned long reserveAt=0; unsigned long enterAt=0; };
Slot slots[NUM_SLOTS];
String gateState="CLOSED";
unsigned long lastLcd=0, lastMqttTry=0, lastBeat=0, lastSnapshot=0;
bool mqttOK=false;

int slotIndex(String id){ for(int i=0;i<NUM_SLOTS;i++) if(id==SLOT_ID[i]) return i; return -1; }
void beep(int n=2){ for(int i=0;i<n;i++){ digitalWrite(BUZZER_PIN,HIGH); delay(120); digitalWrite(BUZZER_PIN,LOW); delay(120);} }

void drawOLED(String extra=""){
  int freeN=0; for(int i=0;i<NUM_SLOTS;i++) if(!slots[i].occupied) freeN++;
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0,0);
  display.println("Smart Parking");
  display.setCursor(0,12);
  display.print("Trong:");
  display.print(freeN);
  display.print("/6 ");
  display.println(gateState);
  display.setCursor(0,24);
  String s=""; for(int i=0;i<NUM_SLOTS;i++) s+=slots[i].occupied?"X":(slots[i].reservedBy!=""?"R":"_");
  if(extra!="") s=extra.substring(0,16);
  display.println(s);
  display.setCursor(0,36);
  display.print("P1-6: ");
  display.println(s);
  display.setCursor(0,48);
  display.print(mqttOK?"MQTT:OK":"MQTT:WAIT");
  display.display();
}
void pubSlot(int i){
  if(!mqtt.connected()) return;
  StaticJsonDocument<256> d; d["id"]=SLOT_ID[i]; d["occupied"]=slots[i].occupied; d["reservedBy"]=slots[i].reservedBy; d["updatedAt"]=millis();
  char t[64]; snprintf(t,sizeof(t),"parking/slot/%s/status",SLOT_ID[i]);
  char b[256]; serializeJson(d,b); mqtt.publish(t,b,true);
}
void pubSnapshot(){
  if(!mqtt.connected()) return;
  StaticJsonDocument<1024> d; JsonArray a=d.createNestedArray("slots");
  for(int i=0;i<NUM_SLOTS;i++){ JsonObject o=a.createNestedObject(); o["id"]=SLOT_ID[i]; o["occupied"]=slots[i].occupied; o["reservedBy"]=slots[i].reservedBy; }
  d["gate"]=gateState; d["ts"]=millis(); char b[1024]; serializeJson(d,b);
  mqtt.publish("parking/slots/snapshot",b,true);
}
void pubBookingState(String slot,String state,String user,String req,bool ok,String msg){
  if(!mqtt.connected()) return;
  StaticJsonDocument<384> d; d["slot"]=slot; d["state"]=state; d["user"]=user; d["requestId"]=req; d["ok"]=ok; d["msg"]=msg;
  char t[64]; snprintf(t,sizeof(t),"parking/booking/%s/state",slot.c_str());
  char b[384]; serializeJson(d,b); mqtt.publish(t,b,true);
}
void pubGate(){
  if(!mqtt.connected()) return;
  StaticJsonDocument<256> d; d["gate"]=gateState; d["ts"]=millis(); char b[256]; serializeJson(d,b);
  mqtt.publish("parking/gate/barrier/state",b,true);
}
void setGate(String g){ gateState=g; barrier.write(g=="OPEN"?90:0); pubGate(); drawOLED(); }
void onMsg(char* topic,byte* p,unsigned len){
  String s; for(unsigned i=0;i<len;i++) s+=(char)p[i];
  StaticJsonDocument<384> d; if(deserializeJson(d,s)) return;
  String T(topic);
  if(T=="parking/gate/barrier/cmd"){ String c=d["cmd"]|""; if(c=="OPEN"){ setGate("OPEN"); beep(1);} else setGate("CLOSED"); }
  else if(T.startsWith("parking/booking/")){
    String slot=d["slot"]|"", user=d["user"]|"", act=d["action"]|"", req=d["requestId"]|"";
    int i=slotIndex(slot); if(i<0){ pubBookingState(slot,"ERROR",user,req,false,"Sai ma o"); return; }
    if(act=="reserve"){
      if(slots[i].occupied){ pubBookingState(slot,"OCCUPIED",user,req,false,"O da co xe"); beep(3); return; }
      if(slots[i].reservedBy!=""&&slots[i].reservedBy!=user){ pubBookingState(slot,"RESERVED",user,req,false,"O da co nguoi dat"); beep(3); return; }
      slots[i].reservedBy=user; slots[i].reserveAt=millis();
      pubBookingState(slot,"RESERVED",user,req,true,"Dat o thanh cong");
      pubSlot(i); pubSnapshot(); beep(1); drawOLED();
    } else if(act=="cancel"){
      if(slots[i].reservedBy==user){ slots[i].reservedBy=""; pubBookingState(slot,"FREE",user,req,true,"Da huy"); pubSlot(i); pubSnapshot(); drawOLED(); }
      else pubBookingState(slot,"ERROR",user,req,false,"Khong phai nguoi dat");
    }
  }
}
void setup(){
  Serial.begin(115200);
  Serial.println("SMART PARKING OLED START");
  for(int i=0;i<NUM_SLOTS;i++) pinMode(IR_PIN[i],INPUT_PULLUP);
  pinMode(BUZZER_PIN,OUTPUT);
  barrier.attach(SERVO_PIN); barrier.write(0);
  Wire.begin(21, 22);
  if(!display.begin(SSD1306_SWITCHCAPVCC, SCREEN_ADDRESS)){
    Serial.println("OLED khong thay 0x3C");
    for(;;) delay(100);
  }
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0,0);
  display.println("Smart Parking");
  display.println("Trong:6/6 CLOSED");
  display.display();
  Serial.println("OLED DA GHI CHU");
  SPI.begin(18,19,23,5); rfid.PCD_Init();
  WiFi.begin(WIFI_SSID,WIFI_PASS);
  Serial.print("WiFi"); int t=0; while(WiFi.status()!=WL_CONNECTED&&t<50){ delay(400); Serial.print("."); t++; }
  Serial.println(WiFi.localIP());
  display.clearDisplay();
  display.setCursor(0,0);
  display.println(WiFi.localIP().toString());
  display.println("MQTT...");
  display.display();
  delay(800);
  mqtt.setServer(MQTT_HOST,MQTT_PORT); mqtt.setCallback(onMsg); mqtt.setBufferSize(2048);
  drawOLED();
}
bool mqttTryConnect(){
  String id="esp32-parking-"+String(random(0xffff),HEX);
  bool ok=mqtt.connect(id.c_str(),"parking/system/status",1,true,"{\"online\":false}");
  if(ok){ Serial.println("MQTT OK"); mqtt.publish("parking/system/status","{\"online\":true}",true); mqtt.subscribe("parking/booking/+/set",1); mqtt.subscribe("parking/gate/barrier/cmd",1); pubSnapshot(); for(int i=0;i<NUM_SLOTS;i++) pubSlot(i); pubGate(); }
  else { Serial.print("MQTT fail rc="); Serial.println(mqtt.state()); }
  return ok;
}
void loop(){
  if(!mqtt.connected()){ mqttOK=false; if(millis()-lastMqttTry>3000){ lastMqttTry=millis(); Serial.println("Thu ket noi MQTT..."); mqttTryConnect(); } }
  else { mqttOK=true; mqtt.loop(); }
  static unsigned long lastRead=0;
  if(millis()-lastRead>200){
    lastRead=millis(); bool ch=false;
    for(int i=0;i<NUM_SLOTS;i++){
      bool occ=(digitalRead(IR_PIN[i])==LOW);
      if(occ!=slots[i].occupied){ slots[i].occupied=occ; ch=true; if(occ) slots[i].enterAt=millis(); else slots[i].reservedBy=""; pubSlot(i); pubSnapshot(); }
    }
    if(ch) drawOLED();
  }
  if(rfid.PICC_IsNewCardPresent()&&rfid.PICC_ReadCardSerial()){
    String c=""; for(byte i=0;i<rfid.uid.size;i++){ char h[4]; sprintf(h,"%02X",rfid.uid.uidByte[i]); c+=h; }
    Serial.print("RFID: "); Serial.println(c); beep(1); rfid.PICC_HaltA(); drawOLED(c);
  }
  if(Serial.available()){ String l=Serial.readStringUntil('\n'); l.trim(); if(l.startsWith("RFID:")){ drawOLED(l.substring(5)); } }
  if(millis()-lastLcd>1000){
    lastLcd=millis(); drawOLED();
    Serial.print("Slots: "); for(int i=0;i<NUM_SLOTS;i++) Serial.print(slots[i].occupied?"X":"_");
    Serial.print(" MQTT:"); Serial.println(mqttOK?"OK":"WAIT");
  }
  if(mqtt.connected()&&millis()-lastBeat>15000){ lastBeat=millis(); StaticJsonDocument<192> h; h["uptime"]=millis()/1000; h["wifi"]=WiFi.RSSI(); char b[192]; serializeJson(h,b); mqtt.publish("parking/system/heartbeat",b,false); }
  if(mqtt.connected()&&millis()-lastSnapshot>30000){ lastSnapshot=millis(); pubSnapshot(); }
}
