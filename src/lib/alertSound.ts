// Web Audio beep generator for critical alerts (no asset needed)
let ctx: AudioContext | null = null;
let lastPlay = 0;

export function playCriticalAlert(volume: number = 1) {
  if (volume <= 0) return; // muted
  const now = Date.now();
  if (now - lastPlay < 1500) return; // throttle
  lastPlay = now;
  const vol = Math.max(0, Math.min(1, volume));
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const audio = ctx;
    if (audio.state === "suspended") audio.resume();

    const playBeep = (freq: number, start: number, dur: number) => {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = "square";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, audio.currentTime + start);
      gain.gain.linearRampToValueAtTime(0.25 * vol, audio.currentTime + start + 0.02);
      gain.gain.linearRampToValueAtTime(0, audio.currentTime + start + dur);
      osc.connect(gain).connect(audio.destination);
      osc.start(audio.currentTime + start);
      osc.stop(audio.currentTime + start + dur + 0.05);
    };
    playBeep(880, 0, 0.18);
    playBeep(660, 0.22, 0.18);
    playBeep(880, 0.44, 0.22);
  } catch (e) {
    console.warn("Audio alert failed", e);
  }
}
