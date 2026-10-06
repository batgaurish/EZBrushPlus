import { useEffect, useRef, useState } from "react";
import { X } from "@phosphor-icons/react";
import { BrushDetector, ZONES, type Zone, type Frame } from "../detector";
import { TOTAL_MS, ZONE_LABEL, ZONE_TARGET_MS } from "../game";
import { germ, kenney, lottie, sfx } from "../assets";
import type { ThemeId } from "../progress";
import Lottie from "../Lottie";
import { play } from "../sound";

export interface Outcome { zoneMs: Record<Zone, number>; bestComboMs: number }

let detector: BrushDetector | null = null; // models are reused across sessions

const blank = () => Object.fromEntries(ZONES.map(z => [z, 0])) as Record<Zone, number>;
const SHORT: Record<Zone, string> = { UL: "Top L", UF: "Top", UR: "Top R", LL: "Bottom L", LF: "Bottom", LR: "Bottom R" };

export default function Play({ theme, onDone, onQuit }: { theme: ThemeId; onDone: (o: Outcome) => void; onQuit: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState("Starting camera…");
  const [hud, setHud] = useState({ left: TOTAL_MS, zoneMs: blank(), zone: null as Zone | null, combo: 0, frame: null as Frame | null });
  const [pop, setPop] = useState<{ zone: Zone; key: number } | null>(null);
  const done = useRef(onDone); done.current = onDone;
  const themeRef = useRef(theme); themeRef.current = theme;

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0, alive = true;

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: 640, height: 480 }, audio: false });
        if (!alive) return;
        video.current!.srcObject = stream;
        await video.current!.play();
        if (!detector) {
          setStatus("Warming up the germ radar…");
          const d = new BrushDetector();
          await d.init();
          detector = d;
        }
      } catch (e) {
        console.error(e);
        setStatus("Camera blocked. Allow camera access and try again.");
        return;
      }
      if (!alive) return;
      setStatus("");
      play(sfx.start);

      const zoneMs = blank();
      const cleaned = new Set<Zone>();
      let elapsed = 0, started = false, combo = 0, best = 0, last = performance.now(), lastHud = 0;
      const tick = () => {
        if (!alive) return;
        const now = performance.now();
        const dt = Math.min(100, now - last); last = now;
        const v = video.current!;
        const f = v.readyState >= 2 ? detector!.detect(v, now) : null;

        if (f?.brushing) started = true;
        if (started) elapsed += dt;
        if (f?.brushing && f.zone) {
          zoneMs[f.zone] += dt;
          if (Math.floor((combo + dt) / 5000) > Math.floor(combo / 5000)) play(sfx.combo, 0.5);
          combo += dt; best = Math.max(best, combo);
          if (zoneMs[f.zone] >= ZONE_TARGET_MS && !cleaned.has(f.zone)) {
            cleaned.add(f.zone);
            play(sfx.pop); setTimeout(() => play(sfx.clean, 0.5), 120);
            setPop({ zone: f.zone, key: now });
          }
        } else combo = Math.max(0, combo - dt * 2);

        drawOverlay(canvas.current!, v, f, ZONES.find(z => zoneMs[z] < ZONE_TARGET_MS) ?? null, AR_COLOR[themeRef.current], now);
        if (now - lastHud > 100) {
          lastHud = now;
          setHud({ left: Math.max(0, TOTAL_MS - elapsed), zoneMs: { ...zoneMs }, zone: f?.zone ?? null, combo, frame: f });
        }
        if (elapsed >= TOTAL_MS) { done.current({ zoneMs, bestComboMs: best }); return; }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    })();

    return () => { alive = false; cancelAnimationFrame(raf); stream?.getTracks().forEach(t => t.stop()); };
  }, []);

  const secs = Math.ceil(hud.left / 1000);
  const clock = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
  const elapsedFrac = 1 - hud.left / TOTAL_MS;
  const mult = Math.floor(hud.combo / 5000);
  const cleanCount = ZONES.filter(z => hud.zoneMs[z] >= ZONE_TARGET_MS).length;
  const line = status || coachLine(hud.frame, hud.zoneMs, theme);
  const goodStars = Math.floor(cleanCount / 2);

  return (
    <div className="play">
      <video ref={video} playsInline muted />
      <canvas ref={canvas} />

      <div className="play-top">
        {theme === "arcade" && <>
          <div className="clock">{clock}</div>
          <div className="hud-stars">{[0, 1, 2].map(i => <img key={i} src={i < goodStars ? kenney.star("yellow") : kenney.starEmpty} alt="" />)}</div>
        </>}
        {theme === "hero" && <div className="ring" style={{ ["--p" as string]: elapsedFrac }}><span>{clock}</span></div>}
        {theme === "candy" && <>
          <div className="clock">{clock}</div>
          <div className="prog"><i style={{ width: `${elapsedFrac * 100}%` }} /></div>
        </>}
        <button className="quit" onClick={onQuit} aria-label="Stop brushing"><X size={20} weight="bold" /></button>
      </div>

      {theme !== "arcade" && <Lottie src={theme === "hero" ? lottie.wandTooth : lottie.pasteTooth} className="buddy" />}
      <div className={`coach ${theme !== "arcade" ? "bubble" : ""}`}>{mult > 0 && theme === "arcade" ? `COMBO X${mult + 1}!` : line}</div>
      {pop && <Lottie key={pop.key} src={lottie.pop} loop={false} className="pop" />}

      <div className="zones">
        {theme === "hero" && <h5>GERM SQUAD · {cleanCount} / 6 DEFEATED</h5>}
        <div className="zone-grid">
          {ZONES.map(z => {
            const p = Math.min(1, hud.zoneMs[z] / ZONE_TARGET_MS);
            return (
              <div key={z} className={`zone ${p >= 1 ? "clean" : ""} ${hud.zone === z ? "on" : ""}`}>
                {p >= 1
                  ? <img src={kenney.star(theme === "candy" ? "green" : "yellow")} alt="" className="z-img" />
                  : <img src={germ[z]} alt="" className="z-img" style={{ transform: `scale(${1 - p * 0.5})` }} />}
                <small>{SHORT[z]}</small>
                {p < 1 && <div className="hp"><i style={{ width: `${(1 - p) * 100}%` }} /></div>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function coachLine(f: Frame | null, zoneMs: Record<Zone, number>, theme: ThemeId) {
  const loud = theme === "arcade";
  const say = (s: string) => (loud ? s.toUpperCase() : s);
  if (!f?.face) return say("Show me your smile!");
  if (!f.handNearMouth) return say("Grab your toothbrush!");
  if (!f.brushing) return say("Little circles!");
  const next = ZONES.find(z => zoneMs[z] < ZONE_TARGET_MS);
  if (f.zone && zoneMs[f.zone] >= ZONE_TARGET_MS && next) return say(`Sparkly! Now the ${ZONE_LABEL[next].toLowerCase()}`);
  return say(theme === "hero" ? "Zap 'em!" : theme === "candy" ? "So shiny!" : `Attack ${ZONE_LABEL[f.zone!].toLowerCase()}!`);
}

const AR_COLOR: Record<ThemeId, string> = { arcade: "#ffcf3d", hero: "#ffd23f", candy: "#ff6fae" };

// Mouth split into 6 cells. Canvas is mirrored by CSS like the video, so we draw in raw camera
// coordinates: raw-left is the user's RIGHT side (matches the detector's zone logic).
const COLS: Record<string, number> = { R: 0, F: 1, L: 2 };
function cellRect(z: Zone, cx: number, cy: number, w: number) {
  const W = w * 2.4, H = w * 1.5;
  const cw = W / 3, ch = H / 2;
  const col = COLS[z[1]], row = z[0] === "U" ? 0 : 1;
  return { x: cx - W / 2 + col * cw, y: cy - H / 2 + row * ch, w: cw, h: ch };
}

function roundRect(ctx: CanvasRenderingContext2D, r: { x: number; y: number; w: number; h: number }, rad: number) {
  ctx.beginPath();
  ctx.roundRect(r.x + 3, r.y + 3, r.w - 6, r.h - 6, rad);
}

function drawOverlay(c: HTMLCanvasElement, v: HTMLVideoElement, f: Frame | null, target: Zone | null, color: string, now: number) {
  if (c.width !== v.videoWidth) { c.width = v.videoWidth; c.height = v.videoHeight; }
  const ctx = c.getContext("2d")!;
  ctx.clearRect(0, 0, c.width, c.height);
  if (!f?.mouth) return;
  const cx = f.mouth.x * c.width, cy = f.mouth.y * c.height, w = f.mouth.w * c.width;
  const rad = w * 0.18;

  // faint grid of all six cells
  ctx.setLineDash([]);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "rgba(255,255,255,.35)";
  for (const z of ZONES) { roundRect(ctx, cellRect(z, cx, cy, w), rad); ctx.stroke(); }

  // cell being brushed right now: soft green fill
  if (f.brushing && f.zone) {
    roundRect(ctx, cellRect(f.zone, cx, cy, w), rad);
    ctx.fillStyle = "rgba(90,209,122,.35)";
    ctx.fill();
  }

  // target cell: pulsing, marching dashed outline with glow + arrow pointing in
  if (target) {
    const r = cellRect(target, cx, cy, w);
    const pulse = 0.5 + 0.5 * Math.sin(now / 180);
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 12 + pulse * 14;
    ctx.strokeStyle = color;
    ctx.lineWidth = 4 + pulse * 2;
    ctx.setLineDash([14, 8]);
    ctx.lineDashOffset = -now / 25;
    roundRect(ctx, r, rad);
    ctx.stroke();
    ctx.restore();

    const up = target[0] === "U";
    const ax = r.x + r.w / 2, ay = up ? r.y - 10 - pulse * 8 : r.y + r.h + 10 + pulse * 8;
    const s = w * 0.16, d = up ? 1 : -1;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(ax - s, ay - d * s);
    ctx.lineTo(ax + s, ay - d * s);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }

  // sparkles where the brush is
  if (f.brushing && f.hand) {
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = `rgba(255,255,255,${0.5 + Math.random() * 0.5})`;
      ctx.beginPath();
      ctx.arc(f.hand.x * c.width + (Math.random() - 0.5) * 60, f.hand.y * c.height + (Math.random() - 0.5) * 60, 2 + Math.random() * 5, 0, 7);
      ctx.fill();
    }
  }
}
