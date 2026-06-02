import { createContext, ReactNode, useContext, useEffect, useState } from "react";

export interface AppSettings {
  machineName: string;
  warningThreshold: number;
  criticalThreshold: number;
  resetToken: number; // bumped to force stats reset
  powerBiUrl: string;
}

const DEFAULTS: AppSettings = {
  machineName: "Machine_01",
  warningThreshold: 2500,
  criticalThreshold: 3500,
  resetToken: 0,
  powerBiUrl: "",
};

const KEY = "vibrasense.settings";

interface Ctx {
  settings: AppSettings;
  updateSettings: (patch: Partial<AppSettings>) => void;
  resetStats: () => void;
}

const SettingsContext = createContext<Ctx | undefined>(undefined);

export const SettingsProvider = ({ children }: { children: ReactNode }) => {
  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
    } catch {}
    return DEFAULTS;
  });

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(settings));
  }, [settings]);

  const updateSettings = (patch: Partial<AppSettings>) =>
    setSettings((s) => ({ ...s, ...patch }));

  const resetStats = () =>
    setSettings((s) => ({ ...s, resetToken: s.resetToken + 1 }));

  return (
    <SettingsContext.Provider value={{ settings, updateSettings, resetStats }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
};
