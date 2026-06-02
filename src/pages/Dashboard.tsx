import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Bell,
  CheckCircle2,
  Lightbulb,
  Radio,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useMqtt, VibrationData, VibrationState } from "@/hooks/useMqtt";
import { useSettings } from "@/hooks/useSettings";
import { playCriticalAlert } from "@/lib/alertSound";
import { cn } from "@/lib/utils";

const RMS_MAX = 4095;

const stateLabel: Record<VibrationState, string> = {
  normal: "NORMAL",
  warning: "WARNING",
  critical: "CRITICAL",
};

const stateColorVar: Record<VibrationState, string> = {
  normal: "hsl(var(--status-normal))",
  warning: "hsl(var(--status-warning))",
  critical: "hsl(var(--status-critical))",
};

const stateBg: Record<VibrationState, string> = {
  normal: "bg-status-normal/15 text-status-normal border-status-normal/40",
  warning: "bg-status-warning/15 text-status-warning border-status-warning/40",
  critical: "bg-status-critical/20 text-status-critical border-status-critical/50",
};

const Dashboard = () => {
  const { status, latest, history } = useMqtt();
  const { settings } = useSettings();
  const lastBeepRef = useRef<number>(0);

  // Buzzer mute & volume (persisted)
  const [muted, setMuted] = useState<boolean>(() => {
    try { return localStorage.getItem("vibrasense.muted") === "1"; } catch { return false; }
  });
  const [volume, setVolume] = useState<number>(() => {
    try {
      const v = parseInt(localStorage.getItem("vibrasense.volume") ?? "70", 10);
      return Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 70;
    } catch { return 70; }
  });
  useEffect(() => { try { localStorage.setItem("vibrasense.muted", muted ? "1" : "0"); } catch {} }, [muted]);
  useEffect(() => { try { localStorage.setItem("vibrasense.volume", String(volume)); } catch {} }, [volume]);
  const effectiveVolume = muted ? 0 : volume / 100;
  // Stats accumulators (reset by settings.resetToken)
  const [stats, setStats] = useState({
    min: Infinity,
    max: -Infinity,
    countNormal: 0,
    countWarning: 0,
    countCritical: 0,
    totalAlerts: 0,
  });
  const [alertsLog, setAlertsLog] = useState<VibrationData[]>([]);
  const [unreadAlerts, setUnreadAlerts] = useState(0);
  const [acknowledgedTs, setAcknowledgedTs] = useState<number>(0);
  const seenRef = useRef<number>(0);

  // Reset on token change
  useEffect(() => {
    setStats({
      min: Infinity,
      max: -Infinity,
      countNormal: 0,
      countWarning: 0,
      countCritical: 0,
      totalAlerts: 0,
    });
    setAlertsLog([]);
    setUnreadAlerts(0);
    setAcknowledgedTs(0);
    seenRef.current = 0;
  }, [settings.resetToken]);

  // Live state: prend le pire entre l'état envoyé par l'ESP32 et la ré-évaluation locale
  const liveState: VibrationState = useMemo(() => {
    if (!latest) return "normal";
    const bySeuil: VibrationState =
      latest.rms >= settings.criticalThreshold
        ? "critical"
        : latest.rms >= settings.warningThreshold
        ? "warning"
        : "normal";
    const rank = { normal: 0, warning: 1, critical: 2 } as const;
    return rank[latest.etat] >= rank[bySeuil] ? latest.etat : bySeuil;
  }, [latest, settings.warningThreshold, settings.criticalThreshold]);

  // Process new sample
  useEffect(() => {
    if (!latest || latest.receivedAt === seenRef.current) return;
    seenRef.current = latest.receivedAt;

    const s = liveState;

    setStats((prev) => ({
      min: Math.min(prev.min, latest.rms),
      max: Math.max(prev.max, latest.rms),
      countNormal: prev.countNormal + (s === "normal" ? 1 : 0),
      countWarning: prev.countWarning + (s === "warning" ? 1 : 0),
      countCritical: prev.countCritical + (s === "critical" ? 1 : 0),
      totalAlerts: prev.totalAlerts + (s !== "normal" ? 1 : 0),
    }));

    if (s !== "normal") {
      const entry: VibrationData = { ...latest, etat: s };
      setAlertsLog((prev) => [entry, ...prev].slice(0, 10));
      setUnreadAlerts((u) => u + 1);
    }

    if (s === "critical" && Date.now() - lastBeepRef.current > 1500) {
      lastBeepRef.current = Date.now();
      playCriticalAlert(effectiveVolume);
    }
  }, [latest, liveState]);

  // Critical popup state
  const isCriticalActive =
    liveState === "critical" && (latest?.receivedAt ?? 0) > acknowledgedTs;

  const acknowledge = () => {
    setAcknowledgedTs(Date.now());
    setUnreadAlerts(0);
  };

  // Chart data with last 50
  const chartData = useMemo(
    () =>
      history.slice(-50).map((d, i) => ({
        idx: i,
        rms: d.rms,
        time: new Date(d.receivedAt).toLocaleTimeString(),
      })),
    [history]
  );

  // Average over last 50
  const avg50 = useMemo(() => {
    const last = history.slice(-50);
    if (!last.length) return 0;
    return last.reduce((a, b) => a + b.rms, 0) / last.length;
  }, [history]);

  // Trend: current vs avg of previous 5
  const trend = useMemo(() => {
    const last = history.slice(-6);
    if (last.length < 2 || !latest) return { dir: "stable" as const, pct: 0 };
    const prev = last.slice(0, -1);
    const avg = prev.reduce((a, b) => a + b.rms, 0) / prev.length;
    if (avg === 0) return { dir: "stable" as const, pct: 0 };
    const pct = ((latest.rms - avg) / avg) * 100;
    const dir: "up" | "down" | "stable" =
      pct > 5 ? "up" : pct < -5 ? "down" : "stable";
    return { dir, pct };
  }, [history, latest]);

  // Health score
  const health = useMemo(() => {
    if (!latest) return 100;
    const r = latest.rms;
    if (r < 1000) return 100;
    if (r < settings.warningThreshold) return 75;
    if (r < settings.criticalThreshold) return 40;
    return 10;
  }, [latest, settings.warningThreshold, settings.criticalThreshold]);

  const totalSamples =
    stats.countNormal + stats.countWarning + stats.countCritical || 1;
  const pctNormal = (stats.countNormal / totalSamples) * 100;
  const pctWarning = (stats.countWarning / totalSamples) * 100;
  const pctCritical = (stats.countCritical / totalSamples) * 100;

  return (
    <div
      className={cn(
        "min-h-screen p-4 md:p-8 transition-colors",
        isCriticalActive && "critical-flash"
      )}
    >
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header */}
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15 border border-primary/30">
              <Activity className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
                {settings.machineName}
              </h1>
              <p className="text-sm text-muted-foreground">
                Maintenance prédictive · MQTT temps réel
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {unreadAlerts > 0 && (
              <Badge variant="destructive" className="gap-1.5">
                <Bell className="h-3 w-3" />
                {unreadAlerts} non lue{unreadAlerts > 1 ? "s" : ""}
              </Badge>
            )}
            <div className="flex items-center gap-2 rounded-md border border-border/60 bg-card/60 backdrop-blur px-3 py-1.5">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setMuted((m) => !m)}
                aria-label={muted ? "Activer le son" : "Couper le son"}
                title={muted ? "Activer le son" : "Couper le son"}
              >
                {muted || volume === 0 ? (
                  <VolumeX className="h-4 w-4 text-status-critical" />
                ) : (
                  <Volume2 className="h-4 w-4 text-primary" />
                )}
              </Button>
              <Slider
                value={[muted ? 0 : volume]}
                min={0}
                max={100}
                step={1}
                onValueChange={(v) => {
                  const nv = v[0] ?? 0;
                  setVolume(nv);
                  if (nv > 0 && muted) setMuted(false);
                }}
                className="w-28"
                aria-label="Volume du buzzer"
              />
              <span className="w-8 text-right text-xs font-mono text-muted-foreground">
                {muted ? "0" : volume}%
              </span>
            </div>
            <ConnectionPill status={status} />
          </div>
        </header>

        {/* Top row: gauge + status + alerts count */}
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="p-6 bg-card/60 backdrop-blur border-border/60 flex flex-col items-center">
            <div className="text-xs uppercase tracking-wider text-muted-foreground self-start">
              Valeur RMS
            </div>
            <CircularGauge value={latest?.rms ?? 0} max={RMS_MAX} state={liveState} />
          </Card>

          <Card
            className={cn(
              "p-6 bg-card/60 backdrop-blur border-border/60 flex flex-col justify-center",
              liveState === "normal" && "border-status-normal/40 glow-normal",
              liveState === "warning" && "border-status-warning/40 glow-warning",
              liveState === "critical" && "border-status-critical/50 animate-pulse-critical"
            )}
          >
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              État machine
            </div>
            <div className="mt-3 flex items-center gap-3">
              <span
                className="h-4 w-4 rounded-full animate-blink shrink-0"
                style={{
                  backgroundColor: stateColorVar[liveState],
                  boxShadow: `0 0 14px ${stateColorVar[liveState]}`,
                }}
              />
              <span
                className="text-4xl font-bold tracking-tight"
                style={{ color: stateColorVar[liveState] }}
              >
                {stateLabel[liveState]}
              </span>
            </div>
            <div className="mt-4 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Score de santé</span>
                <span className="font-mono font-semibold">{health}%</span>
              </div>
              <Progress
                value={health}
                className="h-2"
                style={{
                  ["--progress-bg" as any]: stateColorVar[liveState],
                }}
              />
              <div className="flex items-center gap-2 pt-1">
                <TrendBadge dir={trend.dir} pct={trend.pct} />
              </div>
            </div>
          </Card>

          <div className="grid gap-4 grid-cols-2">
            <Card className="p-5 bg-card/60 backdrop-blur border-border/60">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                Alertes totales
              </div>
              <div className="mt-2 text-4xl font-bold text-status-warning">
                {stats.totalAlerts}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">depuis démarrage</p>
            </Card>
            <Card className="p-5 bg-card/60 backdrop-blur border-border/60">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                Critiques
              </div>
              <div className="mt-2 text-4xl font-bold text-status-critical">
                {stats.countCritical}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">événements</p>
            </Card>
            <ActuatorCard
              label="LED"
              icon={Lightbulb}
              active={liveState !== "normal"}
              activeClass="text-status-warning bg-status-warning/15 border-status-warning/40"
            />
            <ActuatorCard
              label="Buzzer"
              icon={Volume2}
              active={liveState !== "normal"}
              activeClass={
                liveState === "critical"
                  ? "text-status-critical bg-status-critical/15 border-status-critical/50 animate-buzzer"
                  : "text-status-warning bg-status-warning/15 border-status-warning/40 animate-buzzer"
              }
            />
          </div>
        </div>

        {/* Chart */}
        <Card className="p-4 md:p-6 bg-card/60 backdrop-blur border-border/60">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Signal RMS — temps réel</h2>
              <p className="text-xs text-muted-foreground">
                {chartData.length} dernières mesures · seuils {settings.warningThreshold} /{" "}
                {settings.criticalThreshold}
              </p>
            </div>
            <Badge variant="outline" className="gap-1.5">
              <span
                className="h-2 w-2 rounded-full animate-blink"
                style={{ background: stateColorVar[liveState] }}
              />
              live
            </Badge>
          </div>

          <div className="h-[360px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={chartData}
                margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="rmsGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="0%"
                      stopColor={stateColorVar[liveState]}
                      stopOpacity={0.55}
                    />
                    <stop
                      offset="100%"
                      stopColor={stateColorVar[liveState]}
                      stopOpacity={0}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="hsl(var(--border))"
                  opacity={0.4}
                />
                <XAxis
                  dataKey="idx"
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                />
                <YAxis
                  domain={[0, RMS_MAX]}
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "0.5rem",
                    color: "hsl(var(--foreground))",
                  }}
                  labelFormatter={(_, p) => p?.[0]?.payload?.time ?? ""}
                  formatter={(v: number) => [`${v.toFixed(0)}`, "RMS"]}
                />
                <ReferenceArea
                  y1={0}
                  y2={settings.warningThreshold}
                  fill="hsl(var(--status-normal))"
                  fillOpacity={0.07}
                />
                <ReferenceArea
                  y1={settings.warningThreshold}
                  y2={settings.criticalThreshold}
                  fill="hsl(var(--status-warning))"
                  fillOpacity={0.1}
                />
                <ReferenceArea
                  y1={settings.criticalThreshold}
                  y2={RMS_MAX}
                  fill="hsl(var(--status-critical))"
                  fillOpacity={0.12}
                />
                <ReferenceLine
                  y={settings.warningThreshold}
                  stroke="hsl(var(--status-warning))"
                  strokeDasharray="4 4"
                  label={{
                    value: `Warning ${settings.warningThreshold}`,
                    fill: "hsl(var(--status-warning))",
                    fontSize: 10,
                    position: "insideTopRight",
                  }}
                />
                <ReferenceLine
                  y={settings.criticalThreshold}
                  stroke="hsl(var(--status-critical))"
                  strokeDasharray="4 4"
                  label={{
                    value: `Critical ${settings.criticalThreshold}`,
                    fill: "hsl(var(--status-critical))",
                    fontSize: 10,
                    position: "insideTopRight",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="rms"
                  stroke={stateColorVar[liveState]}
                  strokeWidth={2.5}
                  fill="url(#rmsGrad)"
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Stats + Alerts log */}
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-5 bg-card/60 backdrop-blur border-border/60">
            <h2 className="mb-4 text-lg font-semibold">Statistiques temps réel</h2>
            <div className="grid grid-cols-3 gap-3">
              <StatBox
                label="RMS min"
                value={stats.min === Infinity ? "—" : stats.min.toFixed(0)}
              />
              <StatBox
                label="RMS max"
                value={stats.max === -Infinity ? "—" : stats.max.toFixed(0)}
              />
              <StatBox label="Moy. (50)" value={avg50 ? avg50.toFixed(0) : "—"} />
            </div>
            <div className="mt-5 space-y-2">
              <div className="text-xs text-muted-foreground">
                Répartition du temps de fonctionnement
              </div>
              <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="bg-status-normal"
                  style={{ width: `${pctNormal}%` }}
                />
                <div
                  className="bg-status-warning"
                  style={{ width: `${pctWarning}%` }}
                />
                <div
                  className="bg-status-critical"
                  style={{ width: `${pctCritical}%` }}
                />
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-status-normal">
                  Normal {pctNormal.toFixed(1)}%
                </span>
                <span className="text-status-warning">
                  Warning {pctWarning.toFixed(1)}%
                </span>
                <span className="text-status-critical">
                  Critical {pctCritical.toFixed(1)}%
                </span>
              </div>
            </div>
          </Card>

          <Card className="p-5 bg-card/60 backdrop-blur border-border/60">
            <div className="mb-3 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-status-warning" />
              <h2 className="text-lg font-semibold">10 dernières alertes</h2>
              <Badge variant="secondary" className="ml-auto">
                {alertsLog.length}
              </Badge>
            </div>
            <ScrollArea className="h-[260px] pr-3">
              {alertsLog.length === 0 ? (
                <div className="flex h-[220px] flex-col items-center justify-center text-muted-foreground">
                  <CheckCircle2 className="mb-2 h-10 w-10 text-status-normal/70" />
                  <p className="text-sm">Aucune alerte. Tout va bien.</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs uppercase text-muted-foreground border-b border-border/60">
                      <th className="py-2 text-left font-medium">Heure</th>
                      <th className="py-2 text-left font-medium">RMS</th>
                      <th className="py-2 text-left font-medium">État</th>
                      <th className="py-2 text-right font-medium">Durée</th>
                    </tr>
                  </thead>
                  <tbody>
                    {alertsLog.map((a, i) => {
                      const next = alertsLog[i - 1];
                      const dur = next
                        ? Math.max(0, Math.round((next.receivedAt - a.receivedAt) / 1000))
                        : Math.max(
                            0,
                            Math.round((Date.now() - a.receivedAt) / 1000)
                          );
                      return (
                        <tr
                          key={`${a.receivedAt}-${i}`}
                          className="border-b border-border/30 last:border-0"
                        >
                          <td className="py-2 text-xs font-mono">
                            {new Date(a.receivedAt).toLocaleTimeString()}
                          </td>
                          <td className="py-2 font-mono font-semibold">
                            {a.rms.toFixed(0)}
                          </td>
                          <td className="py-2">
                            <span
                              className={cn(
                                "inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold",
                                stateBg[a.etat]
                              )}
                            >
                              {stateLabel[a.etat]}
                            </span>
                          </td>
                          <td className="py-2 text-right text-xs text-muted-foreground">
                            {dur}s
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </ScrollArea>
          </Card>
        </div>

        <footer className="text-center text-xs text-muted-foreground pt-2">
          broker.hivemq.com · topic{" "}
          <code className="text-primary/80">iot/vibration/data</code>
        </footer>
      </div>

      {/* Critical popup */}
      {isCriticalActive && latest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm p-4">
          <Card className="w-full max-w-md border-status-critical/60 bg-card animate-pulse-critical">
            <div className="p-6 space-y-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-status-critical/20 border border-status-critical/50">
                    <AlertTriangle className="h-6 w-6 text-status-critical" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-status-critical">
                      ALERTE CRITIQUE
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {settings.machineName}
                    </p>
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={acknowledge}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-border bg-background/50 p-3">
                  <div className="text-xs text-muted-foreground">RMS</div>
                  <div className="text-2xl font-bold text-status-critical">
                    {latest.rms.toFixed(0)}
                  </div>
                </div>
                <div className="rounded-lg border border-border bg-background/50 p-3">
                  <div className="text-xs text-muted-foreground">Heure</div>
                  <div className="text-lg font-mono font-semibold">
                    {new Date(latest.receivedAt).toLocaleTimeString()}
                  </div>
                </div>
              </div>
              <Button
                onClick={acknowledge}
                variant="destructive"
                className="w-full"
              >
                Acquitter l'alerte
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};

/* ------------------ Sub-components ------------------ */

function ConnectionPill({ status }: { status: ReturnType<typeof useMqtt>["status"] }) {
  const map = {
    connected: {
      icon: Wifi,
      label: "Connecté",
      cls: "bg-status-normal/15 text-status-normal border-status-normal/40",
    },
    connecting: {
      icon: Radio,
      label: "Connexion…",
      cls: "bg-status-warning/15 text-status-warning border-status-warning/40 animate-blink",
    },
    disconnected: {
      icon: WifiOff,
      label: "Déconnecté",
      cls: "bg-status-critical/15 text-status-critical border-status-critical/40",
    },
    error: {
      icon: WifiOff,
      label: "Erreur",
      cls: "bg-status-critical/15 text-status-critical border-status-critical/40",
    },
  } as const;
  const { icon: Icon, label, cls } = map[status];
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium",
        cls
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </div>
  );
}

function CircularGauge({
  value,
  max,
  state,
}: {
  value: number;
  max: number;
  state: VibrationState;
}) {
  const pct = Math.min(1, Math.max(0, value / max));
  const size = 200;
  const stroke = 14;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - pct);
  const color = stateColorVar[state];

  return (
    <div className="relative mt-2" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="hsl(var(--muted))"
          strokeWidth={stroke}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{
            filter: `drop-shadow(0 0 8px ${color})`,
            transition: "stroke-dashoffset 0.4s ease, stroke 0.3s ease",
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="text-4xl font-bold tabular-nums tracking-tight"
          style={{ color }}
        >
          {value.toFixed(0)}
        </span>
        <span className="text-xs text-muted-foreground">/ {max}</span>
      </div>
    </div>
  );
}

function TrendBadge({
  dir,
  pct,
}: {
  dir: "up" | "down" | "stable";
  pct: number;
}) {
  const map = {
    up: {
      Icon: ArrowUp,
      cls: "text-status-critical bg-status-critical/15 border-status-critical/40",
      label: "Hausse",
    },
    down: {
      Icon: ArrowDown,
      cls: "text-status-normal bg-status-normal/15 border-status-normal/40",
      label: "Baisse",
    },
    stable: {
      Icon: ArrowRight,
      cls: "text-status-warning bg-status-warning/15 border-status-warning/40",
      label: "Stable",
    },
  } as const;
  const { Icon, cls, label } = map[dir];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold",
        cls
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label} {pct >= 0 ? "+" : ""}
      {pct.toFixed(1)}%
    </span>
  );
}

function ActuatorCard({
  label,
  icon: Icon,
  active,
  activeClass,
}: {
  label: string;
  icon: typeof Lightbulb;
  active: boolean;
  activeClass: string;
}) {
  return (
    <Card
      className={cn(
        "p-4 bg-card/60 backdrop-blur border-border/60 flex flex-col items-center justify-center gap-2 transition-all",
        active ? activeClass : "text-muted-foreground"
      )}
    >
      <Icon className="h-7 w-7" />
      <div className="text-xs font-semibold uppercase">{label}</div>
      <div className="text-[10px] opacity-80">{active ? "ACTIF" : "INACTIF"}</div>
    </Card>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/40 p-3 text-center">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-xl font-bold font-mono tabular-nums">{value}</div>
    </div>
  );
}

export default Dashboard;
