import { ArrowRight, Activity, Cpu, Radio, ShieldAlert, Waves, Zap } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import heroImg from "@/assets/hero-iot.jpg";

const features = [
  {
    icon: Cpu,
    title: "ESP32 → MQTT",
    desc: "Microcontrôleur Wi-Fi qui publie les mesures de vibration en temps réel.",
  },
  {
    icon: Waves,
    title: "Capteur de vibration",
    desc: "Accéléromètre (ADXL345 / MPU6050) calcule le RMS du signal.",
  },
  {
    icon: Radio,
    title: "Broker HiveMQ",
    desc: "Transport MQTT WebSocket public, aucune configuration serveur.",
  },
  {
    icon: ShieldAlert,
    title: "Alertes critiques",
    desc: "Déclenchement visuel et sonore dès que l'état passe en critical.",
  },
];

const Landing = () => {
  return (
    <div className="relative">
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          className="absolute inset-0 -z-10 opacity-40"
          style={{
            backgroundImage: `url(${heroImg})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
          aria-hidden
        />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-background/60 via-background/85 to-background" aria-hidden />

        <div className="mx-auto max-w-7xl px-4 py-20 md:px-8 md:py-32">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary mb-6">
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-blink" />
              Surveillance vibratoire IoT • temps réel
            </div>

            <h1 className="text-4xl md:text-6xl font-bold tracking-tight leading-tight">
              Détectez les <span className="text-primary">vibrations</span> de vos machines avant qu'elles ne tombent en panne.
            </h1>

            <p className="mt-6 text-lg text-muted-foreground max-w-2xl">
              VibraSense connecte un <strong className="text-foreground">ESP32</strong> équipé d'un capteur d'accélération à un broker MQTT.
              Les mesures RMS sont diffusées en direct dans le tableau de bord — aucune donnée simulée, tout vient de votre matériel.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" className="gap-2">
                <Link to="/dashboard">
                  Ouvrir le dashboard <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="gap-2">
                <Link to="/esp32">
                  <Cpu className="h-4 w-4" /> Connecter mon ESP32
                </Link>
              </Button>
            </div>

            <div className="mt-10 flex flex-wrap items-center gap-6 text-sm text-muted-foreground">
              <span className="flex items-center gap-2"><Zap className="h-4 w-4 text-primary" /> Latence &lt; 100 ms</span>
              <span className="flex items-center gap-2"><Activity className="h-4 w-4 text-primary" /> 100% données réelles</span>
              <span className="flex items-center gap-2"><Radio className="h-4 w-4 text-primary" /> MQTT WebSocket</span>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-7xl px-4 py-16 md:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold">Comment ça fonctionne</h2>
          <p className="mt-3 text-muted-foreground max-w-2xl mx-auto">
            Une chaîne simple : capteur → ESP32 → MQTT → navigateur. Aucune base de données, aucun backend custom.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map(({ icon: Icon, title, desc }) => (
            <Card key={title} className="p-6 bg-card/60 backdrop-blur border-border/60 hover:border-primary/40 transition-colors">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/15 border border-primary/30 mb-4">
                <Icon className="h-5 w-5 text-primary" />
              </div>
              <h3 className="font-semibold mb-1.5">{title}</h3>
              <p className="text-sm text-muted-foreground">{desc}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* Flow diagram */}
      <section className="mx-auto max-w-7xl px-4 pb-20 md:px-8">
        <Card className="p-8 md:p-12 bg-card/60 backdrop-blur border-border/60">
          <h2 className="text-2xl md:text-3xl font-bold mb-8 text-center">Architecture</h2>
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <FlowNode icon={Waves} label="Capteur" sub="ADXL345 / MPU6050" />
            <FlowArrow />
            <FlowNode icon={Cpu} label="ESP32" sub="Calcul RMS + Wi-Fi" highlight />
            <FlowArrow />
            <FlowNode icon={Radio} label="Broker MQTT" sub="broker.hivemq.com" />
            <FlowArrow />
            <FlowNode icon={Activity} label="Dashboard" sub="Ce navigateur" highlight />
          </div>

          <div className="mt-10 text-center">
            <Button asChild size="lg">
              <Link to="/dashboard" className="gap-2">
                Voir les données en direct <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </Card>
      </section>
    </div>
  );
};

const FlowNode = ({
  icon: Icon,
  label,
  sub,
  highlight,
}: {
  icon: typeof Activity;
  label: string;
  sub: string;
  highlight?: boolean;
}) => (
  <div className="flex flex-col items-center text-center">
    <div
      className={`flex h-20 w-20 items-center justify-center rounded-2xl border ${
        highlight
          ? "bg-primary/15 border-primary/40 glow-normal"
          : "bg-muted/40 border-border"
      }`}
    >
      <Icon className={`h-9 w-9 ${highlight ? "text-primary" : "text-foreground"}`} />
    </div>
    <div className="mt-3 font-semibold">{label}</div>
    <div className="text-xs text-muted-foreground">{sub}</div>
  </div>
);

const FlowArrow = () => (
  <div className="flex items-center text-primary/60">
    <ArrowRight className="h-6 w-6 hidden md:block" />
    <ArrowRight className="h-6 w-6 rotate-90 md:hidden" />
  </div>
);

export default Landing;
