import { FilesetResolver, FaceLandmarker, HandLandmarker } from "@mediapipe/tasks-vision";

const WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
const FACE_MODEL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const HAND_MODEL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

export type Zone = "UL" | "UF" | "UR" | "LL" | "LF" | "LR";
export const ZONES: Zone[] = ["UL", "UF", "UR", "LL", "LF", "LR"];

export interface Frame {
  face: boolean;
  handNearMouth: boolean;
  brushing: boolean; // hand near mouth AND scrubbing motion
  zone: Zone | null;
  mouth?: { x: number; y: number; w: number };
  hand?: { x: number; y: number };
}

// Face mesh landmark indices
const LIP_TOP = 13, LIP_BOTTOM = 14, MOUTH_L = 61, MOUTH_R = 291;
// Hand landmark indices used as the "brush grip" point
const GRIP = [4, 5, 8, 9]; // thumb tip, index base, index tip, middle base

export class BrushDetector {
  private face!: FaceLandmarker;
  private hands!: HandLandmarker;
  private trail: { x: number; y: number; t: number }[] = [];
  private zoneVotes: Zone[] = [];

  async init() {
    const fs = await FilesetResolver.forVisionTasks(WASM);
    const delegate = "GPU" as const;
    [this.face, this.hands] = await Promise.all([
      FaceLandmarker.createFromOptions(fs, {
        baseOptions: { modelAssetPath: FACE_MODEL, delegate },
        runningMode: "VIDEO",
        numFaces: 1,
      }),
      HandLandmarker.createFromOptions(fs, {
        baseOptions: { modelAssetPath: HAND_MODEL, delegate },
        runningMode: "VIDEO",
        numHands: 2,
      }),
    ]);
  }

  detect(video: HTMLVideoElement, now: number): Frame {
    const f = this.face.detectForVideo(video, now);
    const out: Frame = { face: false, handNearMouth: false, brushing: false, zone: null };
    const lm = f.faceLandmarks?.[0];
    if (!lm) { this.trail = []; return out; }
    out.face = true;

    const ml = lm[MOUTH_L], mr = lm[MOUTH_R];
    const mx = (ml.x + mr.x) / 2;
    const my = (lm[LIP_TOP].y + lm[LIP_BOTTOM].y) / 2;
    const mw = Math.hypot(mr.x - ml.x, mr.y - ml.y);
    out.mouth = { x: mx, y: my, w: mw };

    const h = this.hands.detectForVideo(video, now);
    // Pick the hand whose grip is closest to the mouth
    let best: { x: number; y: number; d: number } | null = null;
    for (const hand of h.landmarks ?? []) {
      const x = GRIP.reduce((s, i) => s + hand[i].x, 0) / GRIP.length;
      const y = GRIP.reduce((s, i) => s + hand[i].y, 0) / GRIP.length;
      const d = Math.hypot(x - mx, y - my);
      if (!best || d < best.d) best = { x, y, d };
    }
    if (!best || best.d > mw * 2.6) { this.trail = []; return out; }

    out.handNearMouth = true;
    out.hand = { x: best.x, y: best.y };

    // Motion: look for back-and-forth movement over the last ~0.8s
    this.trail.push({ x: best.x, y: best.y, t: now });
    this.trail = this.trail.filter(p => now - p.t < 800);
    out.brushing = this.isScrubbing(mw);

    if (out.brushing) {
      // Raw camera coords: smaller x = the user's RIGHT side
      const dx = (best.x - mx) / mw;
      const dy = (best.y - my) / mw;
      const side = dx < -0.35 ? "R" : dx > 0.35 ? "L" : "F";
      const jaw = dy < 0 ? "U" : "L";
      this.zoneVotes.push(`${jaw}${side}` as Zone);
      if (this.zoneVotes.length > 8) this.zoneVotes.shift();
      out.zone = mode(this.zoneVotes);
    }
    return out;
  }

  private isScrubbing(scale: number): boolean {
    const t = this.trail;
    if (t.length < 6) return false;
    let path = 0, flips = 0, lastSign = 0;
    for (let i = 1; i < t.length; i++) {
      const dx = t[i].x - t[i - 1].x, dy = t[i].y - t[i - 1].y;
      path += Math.hypot(dx, dy);
      const main = Math.abs(dx) > Math.abs(dy) ? dx : dy;
      const s = Math.sign(main);
      if (s && lastSign && s !== lastSign) flips++;
      if (s) lastSign = s;
    }
    return path / scale > 0.35 && flips >= 2;
  }
}

function mode<T>(arr: T[]): T {
  const c = new Map<T, number>();
  let best = arr[0], n = 0;
  for (const a of arr) { const k = (c.get(a) ?? 0) + 1; c.set(a, k); if (k > n) { n = k; best = a; } }
  return best;
}
