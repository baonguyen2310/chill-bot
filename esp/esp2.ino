#include <ESP8266WiFi.h>
#include <Servo.h>
#include <WiFiUdp.h>

// Network configuration
const char* ssid = "Hehe12343";
const char* password = "018695762411";
const int UDP_PORT = 4210;

// Hardware pins
const int SERVO1_PIN = D1;
const int SERVO2_PIN = D2;
const int LAZE_PIN = D3;
const int LED_PIN = LED_BUILTIN;

// Objects
Servo servo1;
Servo servo2;
WiFiUDP UDP;

// Broadcast configuration
unsigned long lastBroadcast = 0;
const unsigned long BROADCAST_INTERVAL = 1000; // broadcast every 1 second
const int BROADCAST_PORT = 4211;              // separate port for broadcast

void sendBroadcast() {
    String message = "ESP2_IP:" + WiFi.localIP().toString();
    IPAddress broadcastIP(255, 255, 255, 255);
    UDP.beginPacket(broadcastIP, BROADCAST_PORT);
    UDP.write(message.c_str());
    UDP.endPacket();
}

void setup() {
    Serial.begin(115200);
    
    // Setup pins
    pinMode(LED_PIN, OUTPUT);
    pinMode(LAZE_PIN, OUTPUT);
    
    // Initialize devices
    digitalWrite(LAZE_PIN, HIGH); // Active LOW
    servo1.attach(SERVO1_PIN);
    servo2.attach(SERVO2_PIN);
    servo1.write(90);
    servo2.write(90);

    // Connect to WiFi
    WiFi.begin(ssid, password);
    while (WiFi.status() != WL_CONNECTED) {
        digitalWrite(LED_PIN, !digitalRead(LED_PIN));
        delay(500);
    }
    digitalWrite(LED_PIN, HIGH);

    // Start UDP
    UDP.begin(UDP_PORT);
    Serial.printf("Connected! IP: %s, UDP Port: %d, Broadcast Port: %d\n", 
                 WiFi.localIP().toString().c_str(), UDP_PORT, BROADCAST_PORT);
}

void handleCommand(String command) {
    // Format: ESP2:DEVICE:VALUE
    if (!command.startsWith("ESP2:")) return;
    
    int firstColon = command.indexOf(':');
    int secondColon = command.indexOf(':', firstColon + 1);
    
    String device = command.substring(firstColon + 1, secondColon);
    String value = command.substring(secondColon + 1);
    
    if (device == "SERVO1") {
        int angle = value.toInt();
        servo1.write(angle);
        Serial.printf("Servo1 set to %d°\n", angle);
    }
    else if (device == "SERVO2") {
        int angle = value.toInt();
        servo2.write(angle);
        Serial.printf("Servo2 set to %d°\n", angle);
    }
    else if (device == "LAZE") {
        digitalWrite(LAZE_PIN, value == "1" ? HIGH : LOW);
        Serial.printf("Laze set to %s\n", value == "1" ? "ON" : "OFF");
    }
}

void loop() {
    // Handle broadcast
    unsigned long currentMillis = millis();
    if (currentMillis - lastBroadcast >= BROADCAST_INTERVAL) {
        sendBroadcast();
        lastBroadcast = currentMillis;
    }

    // Handle incoming packets
    int packetSize = UDP.parsePacket();
    if (packetSize) {
        char packet[255];
        int len = UDP.read(packet, 255);
        if (len > 0) {
            packet[len] = 0;
            handleCommand(String(packet));
        }
    }
}
