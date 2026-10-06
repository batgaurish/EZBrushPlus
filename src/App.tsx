import { useEffect, useState } from "react";
import * as P from "./progress";
import { ZONES } from "./detector";
import { TIPS, ZONE_LABEL, type Result } from "./game";
import Home from "./screens/Home";
import Play, { type Outcome } from "./screens/Play";
import Results from "./screens/Results";
import { music } from "./assets";
import { playMusic, isMuted, setMuted } from "./sound";

type Screen = "home" | "play" | "results";

export default function App() {
  const [progress, setProgress] = useState(P.load);
  const [screen, setScreen] = useState<Screen>("home");
  const [result, setResult] = useState<Result | null>(null);
  const [demo, setDemo] = useState(false);

  function finish(o: Outcome) {
    const coverage = ZONES.map(z => Math.min(1, o.zoneMs[z] / o.targetMs));
    const score = Math.round((coverage.reduce((a, b) => a + b, 0) / 6) * 100);
    const clean = coverage.filter(c => c >= 1).length;

    // Rewards track real coverage, so brushing well (not only long) is what pays.
    let xp = 20 + Math.round(score * 0.8) + clean * 5 + Math.floor(o.bestComboMs / 10_000) * 5;
    if (P.todayCount(progress) === 1) xp += 15; // second brush of the day
    xp = Math.round(xp * (1 + Math.min(P.streak(progress), 10) * 0.05));

    const session: P.Session = { date: P.dayKey(), ts: Date.now(), score, xp };
    const next: P.Progress = { ...progress, xp: progress.xp + xp, sessions: [...progress.sessions, session] };
    // Demo runs (teeth model) show the full results but don't touch the kid's real progress.
    const fresh = o.demo ? [] : P.BADGES.filter(b => !next.badges.includes(b.id) && b.test(next, session)).map(b => b.id);
    next.badges = [...next.badges, ...fresh];
    if (!o.demo) { P.save(next); setProgress(next); }

    const before = P.levelInfo(progress.xp).lvl, after = o.demo ? before : P.levelInfo(next.xp).lvl;
    setResult({
      score, coverage, xp,
      missed: ZONES.filter((_, i) => coverage[i] < 0.6).map(z => ZONE_LABEL[z].toLowerCase()),
      newBadges: fresh,
      levelUp: after > before ? after : null,
      tip: TIPS[Math.floor(Math.random() * TIPS.length)],
    });
    setScreen("results");
  }

  function setTheme(theme: P.ThemeId) {
    const next = { ...progress, theme };
    P.save(next); setProgress(next);
  }

  const [muted, setMutedState] = useState(isMuted);
  useEffect(() => { document.documentElement.dataset.theme = progress.theme; }, [progress.theme]);
  // Music follows the theme; quieter while brushing so coaching sounds stand out.
  useEffect(() => {
    const start = () => playMusic(music[progress.theme], screen === "play" ? 0.2 : 0.35);
    start();
    window.addEventListener("pointerdown", start, { once: true }); // autoplay needs a first tap
    return () => window.removeEventListener("pointerdown", start);
  }, [progress.theme, screen, muted]);
  const toggleMute = () => { setMuted(!muted, music[progress.theme]); setMutedState(!muted); };

  if (screen === "play") return <Play theme={progress.theme} demo={demo} onDone={finish} onQuit={() => setScreen("home")} />;
  if (screen === "results" && result) return <Results result={result} theme={progress.theme} onContinue={() => setScreen("home")} />;
  return <Home progress={progress} onStart={() => { setDemo(false); setScreen("play"); }} onDemo={() => { setDemo(true); setScreen("play"); }} onTheme={setTheme} muted={muted} onMute={toggleMute} />;
}
