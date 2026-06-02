import { Settings as SettingsIcon, RotateCcw, Save } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSettings } from "@/hooks/useSettings";
import { toast } from "sonner";

const Settings = () => {
  const { settings, updateSettings, resetStats } = useSettings();
  const [machineName, setMachineName] = useState(settings.machineName);
  const [warning, setWarning] = useState(settings.warningThreshold);
  const [critical, setCritical] = useState(settings.criticalThreshold);

  const save = () => {
    if (warning >= critical) {
      toast.error("Le seuil warning doit être inférieur au seuil critical");
      return;
    }
    updateSettings({
      machineName: machineName.trim() || "Machine_01",
      warningThreshold: warning,
      criticalThreshold: critical,
    });
    toast.success("Paramètres enregistrés");
  };

  const handleReset = () => {
    resetStats();
    toast.success("Statistiques réinitialisées");
  };

  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15 border border-primary/30">
            <SettingsIcon className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Paramètres</h1>
            <p className="text-sm text-muted-foreground">Configurer la machine et les seuils</p>
          </div>
        </header>

        <Card className="p-6 space-y-5 bg-card/60 backdrop-blur border-border/60">
          <div className="space-y-2">
            <Label htmlFor="machine">Nom de la machine</Label>
            <Input
              id="machine"
              value={machineName}
              onChange={(e) => setMachineName(e.target.value)}
              placeholder="Machine_01"
            />
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="warn">Seuil Warning (RMS)</Label>
              <Input
                id="warn"
                type="number"
                min={0}
                max={4095}
                value={warning}
                onChange={(e) => setWarning(Number(e.target.value))}
              />
              <p className="text-xs text-muted-foreground">Au-dessus = warning</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="crit">Seuil Critical (RMS)</Label>
              <Input
                id="crit"
                type="number"
                min={0}
                max={4095}
                value={critical}
                onChange={(e) => setCritical(Number(e.target.value))}
              />
              <p className="text-xs text-muted-foreground">Au-dessus = critical</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 pt-2">
            <Button onClick={save} className="gap-2">
              <Save className="h-4 w-4" /> Enregistrer
            </Button>
            <Button variant="destructive" onClick={handleReset} className="gap-2">
              <RotateCcw className="h-4 w-4" /> Réinitialiser les statistiques
            </Button>
          </div>
        </Card>

        <Card className="p-5 bg-card/40 border-border/60 text-sm text-muted-foreground">
          <p>
            <strong className="text-foreground">Broker MQTT :</strong> wss://broker.hivemq.com:8884/mqtt
          </p>
          <p>
            <strong className="text-foreground">Topic :</strong> iot/vibration/data
          </p>
          <p className="mt-2">
            Format JSON attendu : <code className="text-primary">{`{ timestamp, rms, etat, machine }`}</code>
          </p>
        </Card>
      </div>
    </div>
  );
};

export default Settings;
