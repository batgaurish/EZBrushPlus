import { PointSmoother } from "./smooth";
import { FilesetResolver, FaceLandmarker, HandLandmarker, ObjectDetector } from "@mediapipe/tasks-vision";

const WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
const FACE_MODEL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const HAND_MODEL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
// COCO-trained detector ("toothbrush" is one of its 80 classes). Lite2 is the most accurate
// MediaPipe variant; it mostly runs until the brush is confirmed, so its cost is short-lived.
const OBJECT_MODEL =
  "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite2/float16/1/efficientdet_lite2.tflite";

export type Zone = "UL" | "UF" | "UR" | "LL" | "LF" | "LR";
export const ZONES: Zone[] = ["UL", "UF", "UR", "LL", "LF", "LR"];

export interface Pt { x: number; y: number }
export interface Box { x0: number; y0: number; x1: number; y1: number }
export interface Frame {
  face: boolean;
  handNearMouth: boolean;
  grip: boolean;          // hand curled around something (not a pointing finger / open hand)
  brushSeen: boolean;     // a real toothbrush has been confirmed at the mouth this session
  brushing: boolean;      // confirmed brush + grip + scrubbing motion at the mouth
  zone: Zone | null;
  mouth?: { x: number; y: number; w: number };
  // Outer lip contour, raw camera coords, ordered from the user's RIGHT mouth corner to the LEFT one.
  lips?: { upper: Pt[]; lower: Pt[] };
  hand?: Pt;
  brushHead?: Pt;
  handPoints?: Pt[][]; // smoothed 21-point skeletons, for drawing only
  brushBox?: Box;      // live toothbrush detection, when the camera can see it
}

// MediaPipe hand skeleton connections
export const HAND_EDGES: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];

// Face mesh landmark indices
const LIP_TOP = 13, LIP_BOTTOM = 14, MOUTH_R = 61, MOUTH_L = 291; // 61 = user's right corner
export const UPPER_LIP = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291];
export const LOWER_LIP = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291];

const CONFIRM_KEEP_MS = 5000;  // brush stays "confirmed" while the hand keeps returning to the mouth
const LIVE_BOX_MS = 400;       // a brush box this fresh is used directly for the head position

export class BrushDetector {
  private face!: FaceLandmarker;
  private hands!: HandLandmarker;
  private objects!: ObjectDetector;
  private trail: { x: number; y: number; t: number }[] = [];
  private zoneVotes: Zone[] = [];
  private frameNo = 0;
  private lipSmooth = new PointSmoother(1.0, 0.01);
  // Keyed by handedness: MediaPipe's hand order can swap between frames, and a smoother fed
  // the other hand's points would make the drawn skeleton jump.
  private handSmooth = new Map<string, PointSmoother>();
  private lostFace = 0;
  private lastFace: { lm: Pt[] } | null = null;
  private liveBrush: { box: Box; t: number } | null = null;
  private confirmed = false;
  private lastHandAtMouth = 0;

  async init() {
    const fs = await FilesetResolver.forVisionTasks(WASM);
    const delegate = "GPU" as const;
    [this.face, this.hands, this.objects] = await Promise.all([
      FaceLandmarker.createFromOptions(fs, {
        baseOptions: { modelAssetPath: FACE_MODEL, delegate },
        runningMode: "VIDEO",
        numFaces: 1,
      }),
      HandLandmarker.createFromOptions(fs, {
        baseOptions: { modelAssetPath: HAND_MODEL, delegate },
        runningMode: "VIDEO",
        numHands: 2,
        minHandDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      }),
      ObjectDetector.createFromOptions(fs, {
        baseOptions: { modelAssetPath: OBJECT_MODEL, delegate },
        runningMode: "VIDEO",
        categoryAllowlist: ["toothbrush"],
        scoreThreshold: 0.2,
        maxResults: 3,
      }),
    ]);
  }

  /** Start a new session: the brush has to be shown again. */
  reset() {
    this.confirmed = false; this.liveBrush = null; this.trail = []; this.zoneVotes = []; this.lastHandAtMouth = 0;
  }

  detect(video: HTMLVideoElement, now: number, demo?: Box | null): Frame {
    const out: Frame = { face: false, handNearMouth: false, grip: false, brushSeen: false, brushing: false, zone: null };

    // ---------- mouth (face landmarks, or the marked teeth model in demo mode) ----------
    let mx: number, my: number, mw: number, roll = 0;
    if (demo) {
      const W = demo.x1 - demo.x0, H = demo.y1 - demo.y0;
      mx = (demo.x0 + demo.x1) / 2; my = (demo.y0 + demo.y1) / 2;
      mw = W * 0.66;
      out.lips = demoArches(demo, W, H);
    } else {
      const raw = this.face.detectForVideo(video, now).faceLandmarks?.[0];
      let lm: Pt[];
      if (raw) {
        this.lostFace = 0;
        const ids = [...new Set([...UPPER_LIP, ...LOWER_LIP, LIP_TOP, LIP_BOTTOM])];
        const sm = this.lipSmooth.apply(ids.map(i => raw[i]), now);
        lm = [];
        ids.forEach((id, k) => { lm[id] = sm[k]; });
        this.lastFace = { lm };
      } else if (this.lastFace && ++this.lostFace <= 5) {
        lm = this.lastFace.lm; // hold the overlay through a few dropped frames
      } else {
        this.lipSmooth.reset(); this.lastFace = null; this.trail = []; return out;
      }
      const ml = lm[MOUTH_R], mr = lm[MOUTH_L];
      mx = (ml.x + mr.x) / 2;
      my = (lm[LIP_TOP].y + lm[LIP_BOTTOM].y) / 2;
      mw = Math.hypot(mr.x - ml.x, mr.y - ml.y);
      roll = Math.atan2(mr.y - ml.y, mr.x - ml.x); // head tilt
      out.lips = { upper: UPPER_LIP.map(i => lm[i]), lower: LOWER_LIP.map(i => lm[i]) };
    }
    out.face = true;
    out.mouth = { x: mx, y: my, w: mw };

    // ---------- hands: raw for measuring, smoothed for drawing ----------
    const res = this.hands.detectForVideo(video, now);
    const hands = (res.landmarks ?? []).slice(0, 2);
    const seen = new Set<string>();
    out.handPoints = hands.map((h, i) => {
      let key = res.handedness?.[i]?.[0]?.categoryName ?? `hand${i}`;
      if (seen.has(key)) key = `${key}${i}`; // two hands labelled the same: keep them apart
      seen.add(key);
      let sm = this.handSmooth.get(key);
      if (!sm) { sm = new PointSmoother(1.5, 0.03); this.handSmooth.set(key, sm); }
      return sm.apply(h, now);
    });
    for (const k of [...this.handSmooth.keys()]) if (!seen.has(k)) this.handSmooth.delete(k); // lost hands start fresh
    let best: { h: Pt[]; x: number; y: number; d: number } | null = null;
    for (const h of hands) {
      const x = (h[5].x + h[9].x + h[0].x) / 3, y = (h[5].y + h[9].y + h[0].y) / 3; // knuckles + wrist
      const d = Math.hypot(x - mx, y - my);
      if (!best || d < best.d) best = { h, x, y, d };
    }
    const near = !!best && best.d < mw * 3;
    if (near) this.lastHandAtMouth = now;
    else if (now - this.lastHandAtMouth > CONFIRM_KEEP_MS) this.confirmed = false; // hand left: re-show brush

    // ---------- toothbrush: needed once to confirm, then optional ----------
    // The heavy detector runs every 4th frame until confirmed, then every 12th (for a live head position).
    if (this.frameNo++ % (this.confirmed ? 12 : 4) === 0) {
      const W = video.videoWidth, H = video.videoHeight;
      for (const d of this.objects.detectForVideo(video, now).detections ?? []) {
        const b = d.boundingBox; if (!b) continue;
        const box = { x0: b.originX / W, y0: b.originY / H, x1: (b.originX + b.width) / W, y1: (b.originY + b.height) / H };
        if (distToBox(mx, my, box) < mw * 2) { this.liveBrush = { box, t: now }; this.confirmed = true; break; }
      }
    }
    const live = this.liveBrush && now - this.liveBrush.t < LIVE_BOX_MS ? this.liveBrush.box : null;
    if (live) out.brushBox = live;
    out.brushSeen = this.confirmed;

    if (!best || !near) { this.trail = []; return out; }
    out.handNearMouth = true;
    out.grip = isGrip(best.h);
    out.hand = { x: best.x, y: best.y };

    this.trail.push({ x: best.x, y: best.y, t: now });
    this.trail = this.trail.filter(p => now - p.t < 900);

    // Brush head: from the live box when visible, otherwise projected from the hand pose.
    const head = live ? headFromBox(live, best.h) : headFromHand(best.h);
    out.brushHead = head;

    if (!out.grip || !this.confirmed || !this.isScrubbing(mw)) return out;

    // Head position in the mouth's own frame (undo head tilt), normalised by mouth width.
    const rx = (head.x - mx) / mw, ry = (head.y - my) / mw;
    const dx = rx * Math.cos(-roll) - ry * Math.sin(-roll);
    const dy = rx * Math.sin(-roll) + ry * Math.cos(-roll);
    if (Math.hypot(dx, dy) > 1.6) return out; // brush head isn't at the mouth
    out.brushing = true;

    // Raw camera coords: smaller x = the user's RIGHT side
    const side = dx < -0.3 ? "R" : dx > 0.3 ? "L" : "F";
    const jaw = dy < 0 ? "U" : "L";
    this.zoneVotes.push(`${jaw}${side}` as Zone);
    if (this.zoneVotes.length > 10) this.zoneVotes.shift();
    out.zone = mode(this.zoneVotes);
    return out;
  }

  // Quick back-and-forth strokes (brushing), not a slow wave or a single swipe. Uses RAW points:
  // smoothing would flatten exactly the small fast oscillation we are looking for.
  private isScrubbing(scale: number): boolean {
    const t = this.trail;
    if (t.length < 6) return false;
    let path = 0, flips = 0, lastSign = 0;
    let minX = 1, maxX = 0, minY = 1, maxY = 0;
    for (let i = 1; i < t.length; i++) {
      const dx = t[i].x - t[i - 1].x, dy = t[i].y - t[i - 1].y;
      path += Math.hypot(dx, dy);
      const main = Math.abs(dx) > Math.abs(dy) ? dx : dy;
      const s = Math.abs(main) > scale * 0.006 ? Math.sign(main) : 0;
      if (s && lastSign && s !== lastSign) flips++;
      if (s) lastSign = s;
      minX = Math.min(minX, t[i].x); maxX = Math.max(maxX, t[i].x);
      minY = Math.min(minY, t[i].y); maxY = Math.max(maxY, t[i].y);
    }
    const span = Math.max(maxX - minX, maxY - minY) / scale;
    return path / scale > 0.25 && flips >= 2 && span < 1.6;
  }
}

// At least three of the four fingers curled: fingertip closer to the wrist than its middle joint.
function isGrip(h: Pt[]): boolean {
  const wrist = h[0];
  const d = (a: Pt) => Math.hypot(a.x - wrist.x, a.y - wrist.y);
  let curled = 0;
  for (const [tip, pip] of [[8, 6], [12, 10], [16, 14], [20, 18]]) if (d(h[tip]) < d(h[pip]) * 1.05) curled++;
  return curled >= 3;
}

// In a fist grip the handle runs along the knuckle line (pinky -> index) and exits past the thumb.
function headFromHand(h: Pt[]): Pt {
  const ax = (h[4].x + h[5].x) / 2, ay = (h[4].y + h[5].y) / 2; // between thumb tip and index knuckle
  let vx = h[5].x - h[17].x, vy = h[5].y - h[17].y;
  const n = Math.hypot(vx, vy) || 1; vx /= n; vy /= n;
  const L = Math.hypot(h[9].x - h[0].x, h[9].y - h[0].y) * 1.6; // ~ handle length beyond the fist
  return { x: ax + vx * L, y: ay + vy * L };
}

// Visible brush: take the box end farthest from the hand, then step back ~15% so we land on the
// bristles rather than the tip of the box.
function headFromBox(b: Box, h: Pt[]): Pt {
  const g = { x: (h[4].x + h[5].x) / 2, y: (h[4].y + h[5].y) / 2 };
  const cands = [
    { x: b.x0, y: b.y0 }, { x: b.x1, y: b.y0 }, { x: b.x0, y: b.y1 }, { x: b.x1, y: b.y1 },
    { x: (b.x0 + b.x1) / 2, y: b.y0 }, { x: (b.x0 + b.x1) / 2, y: b.y1 }, { x: b.x0, y: (b.y0 + b.y1) / 2 }, { x: b.x1, y: (b.y0 + b.y1) / 2 },
  ];
  const far = cands.reduce((a, c) => (Math.hypot(c.x - g.x, c.y - g.y) > Math.hypot(a.x - g.x, a.y - g.y) ? c : a));
  return { x: far.x + (g.x - far.x) * 0.15, y: far.y + (g.y - far.y) * 0.15 };
}

function distToBox(x: number, y: number, b: Box) {
  const dx = Math.max(b.x0 - x, 0, x - b.x1), dy = Math.max(b.y0 - y, 0, y - b.y1);
  return Math.hypot(dx, dy);
}

function mode<T>(arr: T[]): T {
  const c = new Map<T, number>();
  let best = arr[0], n = 0;
  for (const a of arr) { const k = (c.get(a) ?? 0) + 1; c.set(a, k); if (k > n) { n = k; best = a; } }
  return best;
}

// Two arches inside the marked model box (11 points each, model's right corner -> left corner,
// in raw camera coords where raw-left is the model's right, same as a face).
function demoArches(b: Box, W: number, H: number): { upper: Pt[]; lower: Pt[] } {
  const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
  const arc = (dir: number) => Array.from({ length: 11 }, (_, i) => {
    const t = (i / 10) * Math.PI;
    return { x: cx - Math.cos(t) * W * 0.42, y: cy + dir * (H * 0.06 + Math.sin(t) * H * 0.22) };
  });
  return { upper: arc(-1), lower: arc(1) };
}
