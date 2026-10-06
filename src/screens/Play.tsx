import { useEffect, useRef, useState } from "react";
import { X } from "@phosphor-icons/react";
import { BrushDetector, ZONES, HAND_EDGES, type Zone, type Frame, type Pt, type Box } from "../detector";
import { TOTAL_MS, ZONE_LABEL } from "../game";
import { germ, kenney, lottie, sfx } from "../assets";
import type { ThemeId } from "../progress";
import Lottie from "../Lottie";
import TechniqueCard from "../TechniqueCard";
import type { Profile } from "../techniques";
import { play } from "../sound";

export interface Outcome { zoneMs: Record<Zone, number>; bestComboMs: number; targetMs: number; demo: boolean }

const DEMO_MS = 60_000; // shorter run for live demos

let detector: BrushDetector | null = null; // models are reused across sessions

const blank = () => Object.fromEntries(ZONES.map(z => [z, 0])) as Record<Zone, number>;
const SHORT: Record<Zone, string> = { UL: "Top L", UF: "Top", UR: "Top R", LL: "Bottom L", LF: "Bottom", LR: "Bottom R" };

export default function Play({ theme, profile, demo = false, onDone, onQuit }: { theme: ThemeId; profile: Profile; demo?: boolean; onDone: (o: Outcome) => void; onQuit: () => void }) {
  const TOTAL = demo ? DEMO_MS : TOTAL_MS;
  const TARGET = TOTAL / 6;
  const [model, setModel] = useState<Box | null>(() => (demo ? loadModelBox() : null));
  const modelRef = useRef(model); modelRef.current = model;
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState("Starting camera…");
  const [hud, setHud] = useState({ left: TOTAL, zoneMs: blank(), zone: null as Zone | null, combo: 0, frame: null as Frame | null });
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
      detector!.reset();
      play(sfx.start);

      const zoneMs = blank();
      const cleaned = new Set<Zone>();
      let elapsed = 0, started = false, combo = 0, best = 0, last = performance.now(), lastHud = 0;
      const tick = () => {
        if (!alive) return;
        const now = performance.now();
        const dt = Math.min(100, now - last); last = now;
        const v = video.current!;
        const waiting = demo && !modelRef.current; // demo needs the model marked first
        const f = v.readyState >= 2 && !waiting ? detector!.detect(v, now, demo ? modelRef.current : null) : null;

        if (f?.brushing) started = true;
        if (started) elapsed += dt;
        if (f?.brushing && f.zone) {
          zoneMs[f.zone] += dt;
          if (Math.floor((combo + dt) / 5000) > Math.floor(combo / 5000)) play(sfx.combo, 0.5);
          combo += dt; best = Math.max(best, combo);
          if (zoneMs[f.zone] >= TARGET && !cleaned.has(f.zone)) {
            cleaned.add(f.zone);
            play(sfx.pop); setTimeout(() => play(sfx.clean, 0.5), 120);
            setPop({ zone: f.zone, key: now });
          }
        } else combo = Math.max(0, combo - dt * 2);

        drawOverlay(canvas.current!, v, f, zoneMs, TARGET, AR_COLOR[themeRef.current], now, demo ? modelRef.current : null);
        if (now - lastHud > 100) {
          lastHud = now;
          setHud({ left: Math.max(0, TOTAL - elapsed), zoneMs: { ...zoneMs }, zone: f?.zone ?? null, combo, frame: f });
        }
        if (elapsed >= TOTAL) { done.current({ zoneMs, bestComboMs: best, targetMs: TARGET, demo }); return; }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    })();

    return () => { alive = false; cancelAnimationFrame(raf); stream?.getTracks().forEach(t => t.stop()); };
  }, []);

  const secs = Math.ceil(hud.left / 1000);
  const clock = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
  const elapsedFrac = 1 - hud.left / TOTAL;
  const mult = Math.floor(hud.combo / 5000);
  const cleanCount = ZONES.filter(z => hud.zoneMs[z] >= TARGET).length;
  const line = status || (demo && !model ? "Mark the teeth model" : coachLine(hud.frame, hud.zoneMs, TARGET, theme, demo));
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

      <TechniqueCard profile={profile} />
      {theme !== "arcade" && <Lottie src={theme === "hero" ? lottie.wandTooth : lottie.pasteTooth} className="buddy" />}
      <div className={`coach ${theme !== "arcade" ? "bubble" : ""}`}>{mult > 0 && theme === "arcade" ? `COMBO ×${mult + 1}!` : line}</div>
      {pop && <Lottie key={pop.key} src={lottie.pop} loop={false} className="pop" />}

      {demo && (model
        ? <button className="demo-chip" onClick={() => setModel(null)}>DEMO · Re-mark model</button>
        : <ModelMarker video={video} onDone={b => { saveModelBox(b); setModel(b); }} />)}

      <div className="zones">
        {theme === "hero" && <h5>GERM SQUAD · {cleanCount} / 6 DEFEATED</h5>}
        <div className="zone-grid">
          {ZONES.map(z => {
            const p = Math.min(1, hud.zoneMs[z] / TARGET);
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

function coachLine(f: Frame | null, zoneMs: Record<Zone, number>, TARGET: number, theme: ThemeId, demo: boolean) {
  const loud = theme === "arcade";
  const say = (s: string) => (loud ? s.toUpperCase() : s);
  if (!f?.face) return say(demo ? "Mark the teeth model" : "Show me your smile!");
  if (!f.handNearMouth) return say(demo ? "Bring the brush to the model!" : "Grab your toothbrush!");
  if (!f.brushSeen) return say("Show your toothbrush to the camera!");
  if (!f.grip) return say("Hold your brush like a superhero!");
  if (!f.brushing) return say("Little circles!");
  const next = ZONES.find(z => zoneMs[z] < TARGET);
  if (f.zone && zoneMs[f.zone] >= TARGET && next) return say(`Sparkly! Now the ${ZONE_LABEL[next].toLowerCase()}`);
  return say(theme === "hero" ? "Zap 'em!" : theme === "candy" ? "So shiny!" : `Attack ${ZONE_LABEL[f.zone!].toLowerCase()}!`);
}

const AR_COLOR: Record<ThemeId, string> = { arcade: "#ffcf3d", hero: "#ffd23f", candy: "#ff6fae" };

// Each jaw's lip contour (11 points, user's right corner -> left corner) is split into
// right / front / left thirds. Canvas is CSS-mirrored like the video, so raw coords line up.
const SEG: Record<string, [number, number]> = { R: [0, 3], F: [3, 7], L: [7, 10] };

function archPoints(f: Frame, z: Zone, c: HTMLCanvasElement): Pt[] {
  const m = f.mouth!, lips = f.lips!;
  const line = z[0] === "U" ? lips.upper : lips.lower;
  const [a, b] = SEG[z[1]];
  const cx = m.x, cy = m.y;
  // push the curve slightly outward from the mouth centre so it sits on the teeth line, not on the lip edge
  const k = 1.18, lift = (z[0] === "U" ? -1 : 1) * m.w * 0.06;
  return line.slice(a, b + 1).map(p => ({ x: (cx + (p.x - cx) * k) * c.width, y: (cy + (p.y - cy) * k + lift) * c.height }));
}

function strokeCurve(ctx: CanvasRenderingContext2D, pts: Pt[]) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2, my = (pts[i].y + pts[i + 1].y) / 2;
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
  }
  const last = pts[pts.length - 1];
  ctx.lineTo(last.x, last.y);
  ctx.stroke();
}

function drawOverlay(c: HTMLCanvasElement, v: HTMLVideoElement, f: Frame | null, zoneMs: Record<Zone, number>, ZONE_TARGET_MS: number, color: string, now: number, model: Box | null) {
  if (c.width !== v.videoWidth) { c.width = v.videoWidth; c.height = v.videoHeight; }
  const ctx = c.getContext("2d")!;
  ctx.clearRect(0, 0, c.width, c.height);
  if (model) {
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,.55)"; ctx.lineWidth = 2; ctx.setLineDash([6, 6]);
    ctx.strokeRect(model.x0 * c.width, model.y0 * c.height, (model.x1 - model.x0) * c.width, (model.y1 - model.y0) * c.height);
    ctx.restore();
  }
  if (!f?.mouth || !f.lips) { if (f) drawTracking(ctx, c, f, color); return; }
  const thick = f.mouth.w * c.width * 0.14;
  const target = ZONES.find(z => zoneMs[z] < ZONE_TARGET_MS) ?? null;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (const z of ZONES) {
    const pts = archPoints(f, z, c);
    const clean = zoneMs[z] >= ZONE_TARGET_MS;
    ctx.save();
    ctx.setLineDash([]);
    if (f.brushing && f.zone === z) {
      ctx.strokeStyle = "rgba(90,209,122,.9)";
      ctx.lineWidth = thick * 1.25;
      ctx.shadowColor = "#5ad17a"; ctx.shadowBlur = 18;
    } else if (z === target) {
      const pulse = 0.5 + 0.5 * Math.sin(now / 180);
      ctx.strokeStyle = color;
      ctx.lineWidth = thick * (1 + pulse * 0.25);
      ctx.shadowColor = color; ctx.shadowBlur = 10 + pulse * 16;
      ctx.setLineDash([thick * 1.1, thick * 0.7]);
      ctx.lineDashOffset = -now / 20;
    } else {
      ctx.strokeStyle = clean ? "rgba(90,209,122,.45)" : "rgba(255,255,255,.35)";
      ctx.lineWidth = thick * 0.6;
    }
    strokeCurve(ctx, pts);
    ctx.restore();
  }

  // little arrow pointing at the target segment from outside the mouth
  if (target) {
    const pts = archPoints(f, target, c);
    const mid = pts[Math.floor(pts.length / 2)];
    const up = target[0] === "U";
    const pulse = 0.5 + 0.5 * Math.sin(now / 180);
    const s = thick * 0.9, gap = thick * 1.4 + pulse * thick * 0.6;
    const ay = up ? mid.y - gap : mid.y + gap, d = up ? 1 : -1;
    ctx.beginPath();
    ctx.moveTo(mid.x, ay);
    ctx.lineTo(mid.x - s, ay - d * s * 1.2);
    ctx.lineTo(mid.x + s, ay - d * s * 1.2);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }

  drawTracking(ctx, c, f, color);

  // estimated brush head (from the hand pose) when the brush itself is hidden
  if (f.brushHead && !f.brushBox) {
    ctx.save();
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.arc(f.brushHead.x * c.width, f.brushHead.y * c.height, 12, 0, 7); ctx.stroke();
    ctx.restore();
  }

  // sparkles at the brush head
  if (f.brushing && f.brushHead) {
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = `rgba(255,255,255,${0.5 + Math.random() * 0.5})`;
      ctx.beginPath();
      ctx.arc(f.brushHead.x * c.width + (Math.random() - 0.5) * 50, f.brushHead.y * c.height + (Math.random() - 0.5) * 50, 2 + Math.random() * 4, 0, 7);
      ctx.fill();
    }
  }
}

// Live tracking layer, like a motion-capture view: hand skeletons, lip contour and the toothbrush box.
function drawTracking(ctx: CanvasRenderingContext2D, c: HTMLCanvasElement, f: Frame, color: string) {
  const X = (p: Pt) => p.x * c.width, Y = (p: Pt) => p.y * c.height;
  ctx.save();
  ctx.setLineDash([]);
  ctx.shadowBlur = 0;

  for (const h of f.handPoints ?? []) {
    ctx.strokeStyle = f.grip ? "rgba(90,209,122,.9)" : "rgba(255,255,255,.85)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (const [a, b] of HAND_EDGES) { ctx.moveTo(X(h[a]), Y(h[a])); ctx.lineTo(X(h[b]), Y(h[b])); }
    ctx.stroke();
    for (let i = 0; i < h.length; i++) {
      ctx.fillStyle = [4, 8, 12, 16, 20].includes(i) ? color : "#fff";
      ctx.beginPath(); ctx.arc(X(h[i]), Y(h[i]), [4, 8, 12, 16, 20].includes(i) ? 5 : 3.5, 0, 7); ctx.fill();
    }
  }

  if (f.lips) {
    ctx.strokeStyle = "rgba(255,255,255,.7)";
    ctx.lineWidth = 1.5;
    for (const line of [f.lips.upper, f.lips.lower]) {
      ctx.beginPath();
      line.forEach((p, i) => (i ? ctx.lineTo(X(p), Y(p)) : ctx.moveTo(X(p), Y(p))));
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,.9)";
      for (const p of line) { ctx.beginPath(); ctx.arc(X(p), Y(p), 2, 0, 7); ctx.fill(); }
    }
  }

  if (f.brushBox) {
    const b = f.brushBox;
    const x = b.x0 * c.width, y = b.y0 * c.height, w = (b.x1 - b.x0) * c.width, h = (b.y1 - b.y0) * c.height;
    const k = Math.min(18, w / 3, h / 3);
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath(); // corner brackets
    for (const [cx, cy, dx, dy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]]) {
      ctx.moveTo(cx + dx * k, cy); ctx.lineTo(cx, cy); ctx.lineTo(cx, cy + dy * k);
    }
    ctx.stroke();
  }
  ctx.restore();
}

/* ---------- demo mode: mark the teeth model ---------- */
const MODEL_KEY = "ezbrush.demoModel";
function loadModelBox(): Box | null {
  try { const b = JSON.parse(localStorage.getItem(MODEL_KEY) ?? "null"); return b && typeof b.x0 === "number" ? b : null; } catch { return null; }
}
function saveModelBox(b: Box) { try { localStorage.setItem(MODEL_KEY, JSON.stringify(b)); } catch {} }

// The video is mirrored and object-fit: cover, so map a screen point back to raw camera coords.
function screenToRaw(v: HTMLVideoElement, sx: number, sy: number): Pt {
  const r = v.getBoundingClientRect();
  const vw = v.videoWidth || 640, vh = v.videoHeight || 480;
  const k = Math.max(r.width / vw, r.height / vh);
  const dw = vw * k, dh = vh * k;
  const ex = r.width - (sx - r.left); // undo the mirror
  return { x: (ex - (r.width - dw) / 2) / dw, y: (sy - r.top - (r.height - dh) / 2) / dh };
}

function ModelMarker({ video, onDone }: { video: React.RefObject<HTMLVideoElement | null>; onDone: (b: Box) => void }) {
  const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const finish = () => {
    if (!drag || !video.current) return setDrag(null);
    if (Math.abs(drag.x1 - drag.x0) < 40 || Math.abs(drag.y1 - drag.y0) < 30) return setDrag(null);
    const a = screenToRaw(video.current, drag.x0, drag.y0), b = screenToRaw(video.current, drag.x1, drag.y1);
    const clamp = (n: number) => Math.min(1, Math.max(0, n));
    onDone({ x0: clamp(Math.min(a.x, b.x)), y0: clamp(Math.min(a.y, b.y)), x1: clamp(Math.max(a.x, b.x)), y1: clamp(Math.max(a.y, b.y)) });
    setDrag(null);
  };
  return (
    <div
      className="marker"
      onPointerDown={e => { (e.target as HTMLElement).setPointerCapture(e.pointerId); setDrag({ x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY }); }}
      onPointerMove={e => drag && setDrag({ ...drag, x1: e.clientX, y1: e.clientY })}
      onPointerUp={finish}
    >
      {!drag && <div className="marker-hint"><b>Demo mode</b>Point the camera at the teeth model, then drag a box around its teeth.</div>}
      {drag && <div className="marker-box" style={{ left: Math.min(drag.x0, drag.x1), top: Math.min(drag.y0, drag.y1), width: Math.abs(drag.x1 - drag.x0), height: Math.abs(drag.y1 - drag.y0) }} />}
    </div>
  );
}
