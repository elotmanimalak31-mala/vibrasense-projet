import { useEffect, useRef, useState } from "react";
import mqtt, { MqttClient } from "mqtt";
import { supabase } from "@/integrations/supabase/client";

export type VibrationState = "normal" | "warning" | "critical";

export interface VibrationData {
  timestamp: number;
  rms: number;
  etat: VibrationState;
  machine: string;
  receivedAt: number;
  type: "data" | "alert";
}

export type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";

const BROKER_URL = "wss://broker.hivemq.com:8884/mqtt";
const TOPICS = ["iot/vibration/data", "iot/vibration/alert"];

export function useMqtt() {
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [latest, setLatest] = useState<VibrationData | null>(null);
  const [history, setHistory] = useState<VibrationData[]>([]);
  const [alerts, setAlerts] = useState<VibrationData[]>([]);
  const clientRef = useRef<MqttClient | null>(null);
  const lastPersistRef = useRef<number>(0);

  useEffect(() => {
    const client = mqtt.connect(BROKER_URL, {
      keepalive: 30,
      reconnectPeriod: 3000,
      clean: true,
      clientId: "lovable-iot-" + Math.random().toString(16).slice(2, 10),
    });
    clientRef.current = client;

    client.on("connect", () => {
      setStatus("connected");
      client.subscribe(TOPICS, { qos: 0 });
    });
    client.on("reconnect", () => setStatus("connecting"));
    client.on("close", () => setStatus("disconnected"));
    client.on("error", () => setStatus("error"));

    client.on("message", async (topic, payload) => {
      const raw = payload.toString();
      console.log("[MQTT] message reçu sur", topic, "→", raw);
      try {
        const parsed = JSON.parse(raw);
        const rawEtat = String(parsed.etat ?? "normal").trim().toLowerCase();
        const etat: VibrationState =
          rawEtat === "warning" || rawEtat === "warn"
            ? "warning"
            : rawEtat === "critical" || rawEtat === "alert" || rawEtat === "danger"
            ? "critical"
            : "normal";
        const data: VibrationData = {
          timestamp: Number(parsed.timestamp) || Date.now(),
          rms: Number(parsed.rms) || 0,
          etat,
          machine: String(parsed.machine || "Unknown"),
          receivedAt: Date.now(),
          type: topic.endsWith("/alert") ? "alert" : "data",
        };
        setLatest(data);
        setHistory((prev) => [...prev.slice(-59), data]);
        if (data.type === "alert" || data.etat === "critical") {
          setAlerts((prev) => [data, ...prev].slice(0, 20));
        }

        // Persist to history (throttle: 1 row / 2s, but always persist alerts)
        const now = Date.now();
        const shouldPersist =
          data.etat !== "normal" || now - lastPersistRef.current > 2000;
        if (shouldPersist) {
          lastPersistRef.current = now;
          const { data: userRes } = await supabase.auth.getUser();
          const uid = userRes.user?.id;
          if (uid) {
            await supabase.from("vibration_history").insert({
              user_id: uid,
              machine: data.machine,
              rms: data.rms,
              etat: data.etat,
              device_timestamp: data.timestamp,
            });
          }
        }
      } catch (e) {
        console.error("MQTT parse error", e, payload.toString());
      }
    });

    return () => {
      client.end(true);
    };
  }, []);

  return { status, latest, history, alerts };
}
