import { useEffect, useMemo, useState } from "react";
import { History as HistoryIcon, Trash2, RefreshCw, Download, FileSpreadsheet } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useMqtt } from "@/hooks/useMqtt";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Row {
  id: string;
  machine: string;
  rms: number;
  etat: string;
  device_timestamp: number | null;
  created_at: string;
}

type FilterRange = "today" | "7d" | "30d" | "custom";

const computeEtat = (rms: number): "Normal" | "Attention" | "Critique" =>
  rms < 200 ? "Normal" : rms <= 500 ? "Attention" : "Critique";

const etatColor: Record<string, string> = {
  Normal: "bg-status-normal/15 text-status-normal border-status-normal/40",
  Attention: "bg-status-warning/15 text-status-warning border-status-warning/40",
  Critique: "bg-status-critical/20 text-status-critical border-status-critical/50",
};

// ARGB hex for xlsx cell coloring
const etatFill: Record<string, string> = {
  Normal: "FF22C55E",
  Attention: "FFF59E0B",
  Critique: "FFEF4444",
};

const HistoryPage = () => {
  useMqtt();

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<FilterRange>("7d");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("vibration_history")
      .select("id, machine, rms, etat, device_timestamp, created_at")
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) toast.error("Impossible de charger l'historique");
    else setRows((data as Row[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const channel = supabase
      .channel("vibration_history_changes")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "vibration_history" },
        (payload) => setRows((prev) => [payload.new as Row, ...prev].slice(0, 1000))
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Filter by date range
  const filtered = useMemo(() => {
    const now = new Date();
    let start: Date | null = null;
    let end: Date | null = null;
    if (range === "today") {
      start = new Date(now);
      start.setHours(0, 0, 0, 0);
    } else if (range === "7d") {
      start = new Date(now);
      start.setDate(start.getDate() - 7);
    } else if (range === "30d") {
      start = new Date(now);
      start.setDate(start.getDate() - 30);
    } else if (range === "custom") {
      if (from) start = new Date(from);
      if (to) {
        end = new Date(to);
        end.setHours(23, 59, 59, 999);
      }
    }
    return rows.filter((r) => {
      const d = new Date(r.created_at);
      if (start && d < start) return false;
      if (end && d > end) return false;
      return true;
    });
  }, [rows, range, from, to]);

  // Chart data: sort ascending
  const chartData = useMemo(
    () =>
      [...filtered]
        .sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at))
        .map((r) => ({
          t: new Date(r.created_at).toLocaleString(),
          rms: Number(r.rms),
        })),
    [filtered]
  );

  const clearAll = async () => {
    if (!confirm("Supprimer tout l'historique ?")) return;
    const { data: userRes } = await supabase.auth.getUser();
    const uid = userRes.user?.id;
    if (!uid) return;
    const { error } = await supabase
      .from("vibration_history")
      .delete()
      .eq("user_id", uid);
    if (error) toast.error("Échec suppression");
    else {
      setRows([]);
      toast.success("Historique vidé");
    }
  };

  const exportCsv = () => {
    const header = "Date/Heure,RMS,Température,Fréquence,État\n";
    const body = filtered
      .map((r) => {
        const etat = computeEtat(Number(r.rms));
        return `${new Date(r.created_at).toLocaleString()},${r.rms},—,—,${etat}`;
      })
      .join("\n");
    const blob = new Blob([header + body], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vibrations_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportExcel = async () => {
    const XLSX = await import("xlsx");
    const aoa: (string | number)[][] = [
      ["Date/Heure", "Valeur RMS", "Température", "Fréquence", "État"],
    ];
    filtered.forEach((r) => {
      aoa.push([
        new Date(r.created_at).toLocaleString(),
        Number(r.rms),
        "—",
        "—",
        computeEtat(Number(r.rms)),
      ]);
    });
    const ws = XLSX.utils.aoa_to_sheet(aoa);

    // Color the État column (col index 4 = E)
    for (let i = 1; i < aoa.length; i++) {
      const addr = XLSX.utils.encode_cell({ r: i, c: 4 });
      const etat = aoa[i][4] as string;
      const fill = etatFill[etat];
      if (ws[addr] && fill) {
        ws[addr].s = {
          fill: { fgColor: { rgb: fill } },
          font: { color: { rgb: "FFFFFFFF" }, bold: true },
          alignment: { horizontal: "center" },
        };
      }
    }

    ws["!cols"] = [{ wch: 22 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Vibrations");
    XLSX.writeFile(wb, `vibrations_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success("Export Excel téléchargé");
  };

  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 border border-primary/30">
              <HistoryIcon className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
                Historique + Export
              </h1>
              <p className="text-sm text-muted-foreground">
                {filtered.length} / {rows.length} mesure(s) affichée(s)
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={load} className="gap-1.5">
              <RefreshCw className="h-4 w-4" /> Actualiser
            </Button>
            <Button variant="outline" size="sm" onClick={exportCsv} className="gap-1.5">
              <Download className="h-4 w-4" /> CSV
            </Button>
            <Button size="sm" onClick={exportExcel} className="gap-1.5">
              <FileSpreadsheet className="h-4 w-4" /> Exporter Excel
            </Button>
            <Button variant="destructive" size="sm" onClick={clearAll} className="gap-1.5">
              <Trash2 className="h-4 w-4" /> Vider
            </Button>
          </div>
        </header>

        {/* Filters */}
        <Card className="p-4 bg-card/60 backdrop-blur border-border/60">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex gap-1">
              {(
                [
                  ["today", "Aujourd'hui"],
                  ["7d", "7 jours"],
                  ["30d", "30 jours"],
                  ["custom", "Personnalisé"],
                ] as [FilterRange, string][]
              ).map(([k, label]) => (
                <Button
                  key={k}
                  size="sm"
                  variant={range === k ? "default" : "outline"}
                  onClick={() => setRange(k)}
                >
                  {label}
                </Button>
              ))}
            </div>
            {range === "custom" && (
              <div className="flex gap-3">
                <div>
                  <Label htmlFor="from" className="text-xs">Du</Label>
                  <Input
                    id="from"
                    type="date"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                    className="h-9"
                  />
                </div>
                <div>
                  <Label htmlFor="to" className="text-xs">Au</Label>
                  <Input
                    id="to"
                    type="date"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    className="h-9"
                  />
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* Evolution chart */}
        <Card className="p-5 bg-card/60 backdrop-blur border-border/60">
          <h3 className="text-sm font-semibold mb-4">Évolution des vibrations</h3>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="t" stroke="hsl(var(--muted-foreground))" fontSize={10} hide />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                }}
              />
              <Line
                type="monotone"
                dataKey="rms"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        <Card className="bg-card/60 backdrop-blur border-border/60">
          <ScrollArea className="h-[60vh]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date/Heure</TableHead>
                  <TableHead className="text-right">Valeur RMS</TableHead>
                  <TableHead className="text-right">Température</TableHead>
                  <TableHead className="text-right">Fréquence</TableHead>
                  <TableHead>État</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-10">
                      Chargement…
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-10">
                      Aucune donnée pour cette période.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((r) => {
                    const etat = computeEtat(Number(r.rms));
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="font-mono text-xs">
                          {new Date(r.created_at).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {Number(r.rms).toFixed(0)}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">—</TableCell>
                        <TableCell className="text-right text-muted-foreground">—</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn("border", etatColor[etat])}>
                            {etat}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </Card>
      </div>
    </div>
  );
};

export default HistoryPage;
