import { useEffect, useMemo, useState } from "react";
import { BarChart3, AlertTriangle, Activity, Clock, TrendingUp } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
  LineChart,
  Line,
  ReferenceLine,
} from "recharts";

import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useSettings } from "@/hooks/useSettings";
import { toast } from "sonner";

interface Row {
  rms: number;
  created_at: string;
}

const computeEtat = (rms: number) =>
  rms < 200 ? "Normal" : rms <= 500 ? "Attention" : "Critique";

const COLORS = {
  Normal: "hsl(var(--status-normal))",
  Attention: "hsl(var(--status-warning))",
  Critique: "hsl(var(--status-critical))",
};

const Analysis = () => {
  const { settings } = useSettings();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const since = new Date();
      since.setDate(since.getDate() - 35);
      const { data, error } = await supabase
        .from("vibration_history")
        .select("rms, created_at")
        .gte("created_at", since.toISOString())
        .order("created_at", { ascending: false })
        .limit(5000);
      if (error) toast.error("Erreur de chargement");
      else setRows((data as Row[]) || []);
      setLoading(false);
    })();
  }, []);

  const stats = useMemo(() => {
    const now = new Date();
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthly = rows.filter((r) => new Date(r.created_at) >= startMonth);
    const rmsValues = monthly.map((r) => Number(r.rms));
    const avg = rmsValues.length
      ? rmsValues.reduce((a, b) => a + b, 0) / rmsValues.length
      : 0;
    const alerts = monthly.filter((r) => Number(r.rms) > 200).length;
    const criticalCount = monthly.filter((r) => Number(r.rms) > 500).length;
    // Estimation: 1 mesure ≈ 2s
    const criticalHours = (criticalCount * 2) / 3600;

    const distribution = ["Normal", "Attention", "Critique"].map((label) => ({
      name: label,
      value: monthly.filter((r) => computeEtat(Number(r.rms)) === label).length,
    }));

    // Alertes par semaine sur 4 dernières semaines
    const weekly: { name: string; alertes: number }[] = [];
    for (let i = 3; i >= 0; i--) {
      const start = new Date();
      start.setDate(start.getDate() - (i + 1) * 7);
      const end = new Date();
      end.setDate(end.getDate() - i * 7);
      const count = rows.filter((r) => {
        const d = new Date(r.created_at);
        return d >= start && d < end && Number(r.rms) > 200;
      }).length;
      weekly.push({ name: `S-${i}`, alertes: count });
    }

    // Tendance RMS par jour sur le mois en cours
    const trendMap = new Map<string, number[]>();
    for (const r of monthly) {
      const d = new Date(r.created_at);
      const key = `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1).toString().padStart(2, "0")}`;
      if (!trendMap.has(key)) trendMap.set(key, []);
      trendMap.get(key)!.push(Number(r.rms));
    }
    const trend = Array.from(trendMap.entries())
      .sort((a, b) => {
        const [da, ma] = a[0].split("/").map(Number);
        const [db, mb] = b[0].split("/").map(Number);
        return ma === mb ? da - db : ma - mb;
      })
      .map(([label, vals]) => ({
        label,
        rms: vals.reduce((s, v) => s + v, 0) / vals.length,
      }));

    return { avg, alerts, criticalHours, distribution, weekly, trend, total: monthly.length };
  }, [rows]);

  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 border border-primary/30">
            <BarChart3 className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
              Analyse Mensuelle
            </h1>
            <p className="text-sm text-muted-foreground">
              Statistiques du mois en cours — {stats.total} mesure(s)
            </p>
          </div>
        </header>

        {/* KPI */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="p-5 bg-card/60 backdrop-blur border-border/60">
            <div className="flex items-center gap-3">
              <Activity className="h-8 w-8 text-primary" />
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">
                  RMS Moyen
                </p>
                <p className="text-2xl font-bold">{stats.avg.toFixed(0)}</p>
              </div>
            </div>
          </Card>
          <Card className="p-5 bg-card/60 backdrop-blur border-border/60">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-8 w-8 text-status-warning" />
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">
                  Alertes ce mois
                </p>
                <p className="text-2xl font-bold">{stats.alerts}</p>
              </div>
            </div>
          </Card>
          <Card className="p-5 bg-card/60 backdrop-blur border-border/60">
            <div className="flex items-center gap-3">
              <Clock className="h-8 w-8 text-status-critical" />
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">
                  Temps Critique (est.)
                </p>
                <p className="text-2xl font-bold">{stats.criticalHours.toFixed(2)} h</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Charts */}
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-5 bg-card/60 backdrop-blur border-border/60">
            <h3 className="text-sm font-semibold mb-4">Alertes par semaine (4 dernières)</h3>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={stats.weekly}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                  }}
                />
                <Bar dataKey="alertes" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card className="p-5 bg-card/60 backdrop-blur border-border/60">
            <h3 className="text-sm font-semibold mb-4">Distribution des états (mois en cours)</h3>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={stats.distribution}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  label={(e) => `${e.name}: ${e.value}`}
                >
                  {stats.distribution.map((entry) => (
                    <Cell key={entry.name} fill={COLORS[entry.name as keyof typeof COLORS]} />
                  ))}
                </Pie>
                <Legend />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </Card>
        </div>

        {/* Monthly Trend */}
        <Card className="p-5 bg-card/60 backdrop-blur border-border/60">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            Tendance RMS — mois en cours
          </h3>
          {stats.trend.length > 0 ? (
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={stats.trend}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis
                  dataKey="label"
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={11}
                  interval="preserveStartEnd"
                />
                <YAxis
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                  }}
                />
                <ReferenceLine
                  y={settings.warningThreshold}
                  stroke="hsl(var(--status-warning))"
                  strokeDasharray="5 5"
                  label={{
                    value: "Warning",
                    position: "insideTopRight",
                    fill: "hsl(var(--status-warning))",
                    fontSize: 11,
                  }}
                />
                <ReferenceLine
                  y={settings.criticalThreshold}
                  stroke="hsl(var(--status-critical))"
                  strokeDasharray="5 5"
                  label={{
                    value: "Critical",
                    position: "insideTopRight",
                    fill: "hsl(var(--status-critical))",
                    fontSize: 11,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="rms"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
              <div className="text-4xl mb-3">📉</div>
              <p className="text-sm">Pas assez de données pour afficher la tendance</p>
            </div>
          )}
        </Card>

        {loading && (
          <p className="text-center text-sm text-muted-foreground">Chargement…</p>
        )}
      </div>
    </div>
  );
};

export default Analysis;
