import { Check, Copy, Cpu, Radio, Wifi, Zap } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

const piezoCode = `#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

// ====== CONFIG WIFI ======
const char* WIFI_SSID = "VOTRE_SSID";
const char* WIFI_PASS = "VOTRE_MOT_DE_PASSE";

// ====== CONFIG MQTT ======
const char* MQTT_BROKER = "broker.hivemq.com";
const int   MQTT_PORT   = 1883;
const char* TOPIC_DATA  = "iot/vibration/data";
const char* TOPIC_ALERT = "iot/vibration/alert";
const char* MACHINE_ID  = "Machine_01";

// ====== CAPTEUR PIEZO ======
// Branchement: piezo (+) -> GPIO34 (ADC), piezo (-) -> GND
// Resistance 1MΩ en parallèle entre GPIO34 et GND (clamp / décharge).
// Diode zener 3.3V optionnelle pour protéger l'ADC contre les pics.
const int   PIEZO_PIN    = 34;       // ADC1_CH6, entrée seule
const int   N_SAMPLES    = 200;      // ~200 échantillons par mesure
const int   SAMPLE_DELAY = 1;        // ms entre échantillons (~1 kHz)

// Seuils RMS (à calibrer, valeurs ADC 0–4095)
const float SEUIL_WARNING  = 300.0;
const float SEUIL_CRITICAL = 800.0;

WiFiClient   espClient;
PubSubClient mqtt(espClient);

void connectWiFi() {
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("Wi-Fi");
  while (WiFi.status() != WL_CONNECTED) { delay(300); Serial.print("."); }
  Serial.println(" OK  IP=" + WiFi.localIP().toString());
}

void connectMQTT() {
  mqtt.setServer(MQTT_BROKER, MQTT_PORT);
  while (!mqtt.connected()) {
    String id = "esp32-piezo-" + String((uint32_t)ESP.getEfuseMac(), HEX);
    if (mqtt.connect(id.c_str())) Serial.println("MQTT OK");
    else { Serial.print("."); delay(1000); }
  }
}

float computeRMS() {
  // 1) Lecture + moyenne (offset DC du piezo)
  long sum = 0;
  int  buf[N_SAMPLES];
  for (int i = 0; i < N_SAMPLES; i++) {
    buf[i] = analogRead(PIEZO_PIN);
    sum += buf[i];
    delay(SAMPLE_DELAY);
  }
  float mean = (float)sum / N_SAMPLES;

  // 2) RMS de la composante AC (vibration)
  double sq = 0;
  for (int i = 0; i < N_SAMPLES; i++) {
    float ac = buf[i] - mean;
    sq += ac * ac;
  }
  return sqrt(sq / N_SAMPLES);
}

void publishMeasurement(float rms) {
  const char* etat =
    (rms >= SEUIL_CRITICAL) ? "critical" :
    (rms >= SEUIL_WARNING)  ? "warning"  : "normal";

  StaticJsonDocument<200> doc;
  doc["timestamp"] = millis();
  doc["rms"]       = rms;
  doc["etat"]      = etat;
  doc["machine"]   = MACHINE_ID;

  char payload[200];
  size_t n = serializeJson(doc, payload);

  mqtt.publish(TOPIC_DATA, payload, n);
  if (strcmp(etat, "critical") == 0) {
    mqtt.publish(TOPIC_ALERT, payload, n);
  }
  Serial.println(payload);
}

void setup() {
  Serial.begin(115200);
  analogReadResolution(12);                       // 0..4095
  analogSetPinAttenuation(PIEZO_PIN, ADC_11db);   // plage ~0..3.3V
  connectWiFi();
  connectMQTT();
}

void loop() {
  if (!mqtt.connected()) connectMQTT();
  mqtt.loop();

  float rms = computeRMS();
  publishMeasurement(rms);
  delay(500);
}`;

const arduinoCode = `#include <WiFi.h>
#include <PubSubClient.h>
#include <Wire.h>
#include <ArduinoJson.h>
// Remplacez par votre capteur (ex: ADXL345, MPU6050)
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>

// ====== CONFIG WIFI ======
const char* WIFI_SSID = "VOTRE_SSID";
const char* WIFI_PASS = "VOTRE_MOT_DE_PASSE";

// ====== CONFIG MQTT ======
const char* MQTT_BROKER = "broker.hivemq.com";
const int   MQTT_PORT   = 1883;          // TCP standard pour ESP32
const char* TOPIC_DATA  = "iot/vibration/data";
const char* TOPIC_ALERT = "iot/vibration/alert";
const char* MACHINE_ID  = "Machine_01";

// Seuils RMS (à calibrer selon votre capteur)
const float SEUIL_WARNING  = 1500.0;
const float SEUIL_CRITICAL = 2500.0;

WiFiClient   espClient;
PubSubClient mqtt(espClient);
Adafruit_MPU6050 mpu;

// Buffer pour calcul RMS
const int N_SAMPLES = 100;
float samples[N_SAMPLES];

void connectWiFi() {
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("Wi-Fi");
  while (WiFi.status() != WL_CONNECTED) { delay(300); Serial.print("."); }
  Serial.println(" OK");
}

void connectMQTT() {
  mqtt.setServer(MQTT_BROKER, MQTT_PORT);
  while (!mqtt.connected()) {
    String id = "esp32-" + String((uint32_t)ESP.getEfuseMac(), HEX);
    if (mqtt.connect(id.c_str())) Serial.println("MQTT OK");
    else { Serial.print("."); delay(1000); }
  }
}

float computeRMS() {
  sensors_event_t a, g, temp;
  for (int i = 0; i < N_SAMPLES; i++) {
    mpu.getEvent(&a, &g, &temp);
    // amplitude vibratoire (m/s²) -> mise à l'échelle libre (μm/s)
    float v = sqrt(a.acceleration.x * a.acceleration.x +
                   a.acceleration.y * a.acceleration.y +
                   a.acceleration.z * a.acceleration.z);
    samples[i] = v * 100.0; // facteur d'échelle
    delay(2);
  }
  double sum = 0;
  for (int i = 0; i < N_SAMPLES; i++) sum += samples[i] * samples[i];
  return sqrt(sum / N_SAMPLES);
}

void publishMeasurement(float rms) {
  const char* etat =
    (rms >= SEUIL_CRITICAL) ? "critical" :
    (rms >= SEUIL_WARNING)  ? "warning"  : "normal";

  StaticJsonDocument<200> doc;
  doc["timestamp"] = millis();
  doc["rms"]       = rms;
  doc["etat"]      = etat;
  doc["machine"]   = MACHINE_ID;

  char payload[200];
  size_t n = serializeJson(doc, payload);

  mqtt.publish(TOPIC_DATA, payload, n);
  if (strcmp(etat, "critical") == 0) {
    mqtt.publish(TOPIC_ALERT, payload, n);
  }
  Serial.println(payload);
}

void setup() {
  Serial.begin(115200);
  Wire.begin();
  if (!mpu.begin()) { Serial.println("MPU introuvable !"); while (1); }
  connectWiFi();
  connectMQTT();
}

void loop() {
  if (!mqtt.connected()) connectMQTT();
  mqtt.loop();

  float rms = computeRMS();
  publishMeasurement(rms);
  delay(500); // ~2 mesures/seconde
}`;

const Esp32Page = () => {
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (code: string, key: string) => {
    await navigator.clipboard.writeText(code);
    setCopied(key);
    toast.success("Code copié dans le presse-papier");
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 md:px-8 md:py-16 space-y-10">
      <div className="text-center">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 border border-primary/30 mb-4">
          <Cpu className="h-7 w-7 text-primary" />
        </div>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
          Connecter votre ESP32
        </h1>
        <p className="mt-3 text-muted-foreground max-w-2xl mx-auto">
          Téléversez ce sketch Arduino sur votre ESP32 pour publier les mesures RMS sur le broker
          public HiveMQ. Le dashboard les affichera automatiquement.
        </p>
      </div>

      {/* Étapes */}
      <div className="grid gap-4 md:grid-cols-3">
        <StepCard
          n={1}
          icon={Cpu}
          title="Câblage"
          desc="Branchez le capteur MPU6050 / ADXL345 sur les broches I²C de l'ESP32 (SDA=21, SCL=22)."
        />
        <StepCard
          n={2}
          icon={Wifi}
          title="Wi-Fi"
          desc="Renseignez votre SSID et mot de passe dans le code ci-dessous."
        />
        <StepCard
          n={3}
          icon={Radio}
          title="Publication"
          desc="L'ESP32 publie sur iot/vibration/data toutes les 500 ms. Aucune donnée simulée."
        />
      </div>

      {/* Topics */}
      <Card className="p-6 bg-card/60 backdrop-blur border-border/60">
        <h2 className="font-semibold mb-4">Topics MQTT utilisés</h2>
        <div className="space-y-2 font-mono text-sm">
          <div className="flex items-center justify-between rounded-lg bg-muted/40 px-4 py-2.5">
            <span className="text-primary">iot/vibration/data</span>
            <span className="text-xs text-muted-foreground">mesures continues</span>
          </div>
          <div className="flex items-center justify-between rounded-lg bg-muted/40 px-4 py-2.5">
            <span className="text-status-critical">iot/vibration/alert</span>
            <span className="text-xs text-muted-foreground">alertes critiques</span>
          </div>
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          Format JSON :{" "}
          <code className="text-foreground">
            {`{ "timestamp": 12345, "rms": 1800, "etat": "normal", "machine": "Machine_01" }`}
          </code>
        </p>
      </Card>

      {/* Code – choix du capteur */}
      <Tabs defaultValue="piezo" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="piezo" className="gap-1.5">
            <Zap className="h-4 w-4" /> Piézoélectrique
          </TabsTrigger>
          <TabsTrigger value="mpu" className="gap-1.5">
            <Cpu className="h-4 w-4" /> MPU6050 / I²C
          </TabsTrigger>
        </TabsList>

        <TabsContent value="piezo">
          <Card className="overflow-hidden bg-card/60 backdrop-blur border-border/60">
            <div className="flex items-center justify-between border-b border-border/60 px-4 py-2.5">
              <span className="font-mono text-xs text-muted-foreground">esp32_piezo.ino</span>
              <Button size="sm" variant="ghost" onClick={() => copy(piezoCode, "piezo")} className="gap-1.5">
                {copied === "piezo" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied === "piezo" ? "Copié" : "Copier"}
              </Button>
            </div>
            <pre className="overflow-x-auto p-4 text-xs leading-relaxed">
              <code className="font-mono text-foreground/90">{piezoCode}</code>
            </pre>
          </Card>
          <p className="mt-3 text-sm text-muted-foreground">
            Branchement : piézo (+) → <code className="text-foreground">GPIO34</code>, piézo (−) → GND,
            résistance 1 MΩ en parallèle. Calibrez les seuils <code>SEUIL_WARNING</code> /
            <code> SEUIL_CRITICAL</code> selon l'amplitude de vos vibrations.
          </p>
        </TabsContent>

        <TabsContent value="mpu">
          <Card className="overflow-hidden bg-card/60 backdrop-blur border-border/60">
            <div className="flex items-center justify-between border-b border-border/60 px-4 py-2.5">
              <span className="font-mono text-xs text-muted-foreground">esp32_vibration.ino</span>
              <Button size="sm" variant="ghost" onClick={() => copy(arduinoCode, "mpu")} className="gap-1.5">
                {copied === "mpu" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied === "mpu" ? "Copié" : "Copier"}
              </Button>
            </div>
            <pre className="overflow-x-auto p-4 text-xs leading-relaxed">
              <code className="font-mono text-foreground/90">{arduinoCode}</code>
            </pre>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Bibliothèques */}
      <Card className="p-6 bg-card/60 backdrop-blur border-border/60">
        <h2 className="font-semibold mb-3">Bibliothèques requises (Arduino IDE)</h2>
        <ul className="space-y-1.5 text-sm text-muted-foreground">
          <li>• <code className="text-foreground">PubSubClient</code> — client MQTT</li>
          <li>• <code className="text-foreground">ArduinoJson</code> — sérialisation JSON</li>
          <li>• <code className="text-foreground">Adafruit MPU6050</code> + <code className="text-foreground">Adafruit Unified Sensor</code> (uniquement pour le sketch MPU6050)</li>
        </ul>
      </Card>
    </div>
  );
};

const StepCard = ({
  n,
  icon: Icon,
  title,
  desc,
}: {
  n: number;
  icon: typeof Cpu;
  title: string;
  desc: string;
}) => (
  <Card className="p-5 bg-card/60 backdrop-blur border-border/60">
    <div className="flex items-center gap-3 mb-3">
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 border border-primary/30 text-sm font-bold text-primary">
        {n}
      </span>
      <Icon className="h-5 w-5 text-primary" />
      <span className="font-semibold">{title}</span>
    </div>
    <p className="text-sm text-muted-foreground">{desc}</p>
  </Card>
);

export default Esp32Page;
