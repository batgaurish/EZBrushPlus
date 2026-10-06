import { PointSmoother } from "./smooth";
import { FilesetResolver, FaceLandmarker, HandLandmarker, ObjectDetector } from "@mediapipe/tasks-vision";

const WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
const FACE_MODEL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const HAND_MODEL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
// COCO-trained detector; "toothbrush" is one of its 80 classes.
const OBJECT_MODEL =
  "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite";

export type Zone = "UL" | "UF" | "UR" | "LL" | "LF" | "LR";
export const ZONES: Zone[] = ["UL", "UF", "UR", "LL", "LF", "LR"];

export interface Pt { x: number; y: number }
export interface Frame {
  face: boolean;
  handNearMouth: boolean;
  grip: boolean;      // hand is curled around something (not a pointing finger / open hand)
  brushSeen: boolean; // a toothbrush was detected at the mouth recently
  brushing: boolean;  // grip + brush + scrubbing motion
  zone: Zone | null;
  mouth?: { x: number; y: number; w: number };
  // Outer lip contour, raw camera coords, ordered from the user's RIGHT mouth corner to the LEFT one.
  lips?: { upper: Pt[]; lower: Pt[] };
  hand?: Pt;
  brushHead?: Pt;
  handPoints?: Pt[][];                                           // smoothed 21-point skeletons, for drawing
  brushBox?: { x0: number; y0: number; x1: number; y1: number }; // last toothbrush sighting
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

const BRUSH_MEMORY_MS = 1500;  // keep the last brush sighting this long (detector misses frames)
const OBJECT_EVERY_N = 3;      // object detection is the heaviest model; run it every 3rd frame

export class BrushDetector {
  private face!: FaceLandmarker;
  private hands!: HandLandmarker;
  private objects!: ObjectDetector;
  private trail: { x: number; y: number; t: number }[] = [];
  private zoneVotes: Zone[] = [];
  private frameNo = 0;
  private lipSmooth = new PointSmoother(1.0, 0.01);
  private handSmooth = [new PointSmoother(1.5, 0.03), new PointSmoother(1.5, 0.03)];
  private lostFace = 0;
  private lastFace: { lm: Pt[] } | null = null;
  private lastBrush: { box: { x0: number; y0: number; x1: number; y1: number }; t: number } | null = null;

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
      }),
      ObjectDetector.createFromOptions(fs, {
        baseOptions: { modelAssetPath: OBJECT_MODEL, delegate },
        runningMode: "VIDEO",
        categoryAllowlist: ["toothbrush"],
        scoreThreshold: 0.15,
        maxResults: 3,
      }),
    ]);
  }

  detect(video: HTMLVideoElement, now: number): Frame {
    const out: Frame = { face: false, handNearMouth: false, grip: false, brushSeen: false, brushing: false, zone: null };
    const raw = this.face.detectForVideo(video, now).faceLandmarks?.[0];
    let lm: Pt[];
    if (raw) {
      this.lostFace = 0;
      // smooth only the points we use (lip ring + corners/centre)
      const ids = [...new Set([...UPPER_LIP, ...LOWER_LIP, LIP_TOP, LIP_BOTTOM])];
      const sm = this.lipSmooth.apply(ids.map(i => raw[i]), now);
      lm = [];
      ids.forEach((id, k) => { lm[id] = sm[k]; });
      this.lastFace = { lm };
    } else if (this.lastFace && ++this.lostFace <= 5) {
      lm = this.lastFace.lm; // keep the overlay steady through a few dropped frames
    } else {
      this.lipSmooth.reset(); this.lastFace = null; this.trail = []; return out;
    }
    out.face = true;

    const ml = lm[MOUTH_R], mr = lm[MOUTH_L];
    const mx = (ml.x + mr.x) / 2;
    const my = (lm[LIP_TOP].y + lm[LIP_BOTTOM].y) / 2;
    const mw = Math.hypot(mr.x - ml.x, mr.y - ml.y);
    out.mouth = { x: mx, y: my, w: mw };
    out.lips = { upper: UPPER_LIP.map(i => pt(lm[i])), lower: LOWER_LIP.map(i => pt(lm[i])) };

    // --- toothbrush near the mouth (sampled, remembered briefly) ---
    if (this.frameNo++ % OBJECT_EVERY_N === 0) {
      const W = video.videoWidth, H = video.videoHeight;
      for (const d of this.objects.detectForVideo(video, now).detections ?? []) {
        const b = d.boundingBox; if (!b) continue;
        const box = { x0: b.originX / W, y0: b.originY / H, x1: (b.originX + b.width) / W, y1: (b.originY + b.height) / H };
        if (distToBox(mx, my, box) < mw * 1.2) { this.lastBrush = { box, t: now }; break; }
      }
    }
    const brush = this.lastBrush && now - this.lastBrush.t < BRUSH_MEMORY_MS ? this.lastBrush.box : null;
    out.brushSeen = !!brush;
    if (brush) out.brushBox = brush;

    // --- the hand holding it ---
    let best: { x: number; y: number; d: number; grip: boolean } | null = null;
    const hands = (this.hands.detectForVideo(video, now).landmarks ?? []).slice(0, 2);
    if (hands.length === 0) this.handSmooth.forEach(h => h.reset());
    out.handPoints = hands.map((h, i) => this.handSmooth[i].apply(h, now));
    for (const hand of out.handPoints) {
      const x = (hand[5].x + hand[9].x + hand[0].x) / 3; // knuckles + wrist: stable "fist" point
      const y = (hand[5].y + hand[9].y + hand[0].y) / 3;
      const d = Math.hypot(x - mx, y - my);
      if (!best || d < best.d) best = { x, y, d, grip: isGrip(hand) };
    }
    if (!best || best.d > mw * 3) { this.trail = []; return out; }
    out.handNearMouth = true;
    out.grip = best.grip;
    out.hand = { x: best.x, y: best.y };

    this.trail.push({ x: best.x, y: best.y, t: now });
    this.trail = this.trail.filter(p => now - p.t < 900);
    if (!out.grip || !brush) return out;
    if (!this.isScrubbing(mw)) return out;
    out.brushing = true;

    // Brush head = the end of the brush box farthest from the hand.
    const head = farthestPoint(brush, best);
    out.brushHead = head;
    // Raw camera coords: smaller x = the user's RIGHT side
    const dx = (head.x - mx) / mw;
    const dy = (head.y - my) / mw;
    const side = dx < -0.25 ? "R" : dx > 0.25 ? "L" : "F";
    const jaw = dy < 0 ? "U" : "L";
    this.zoneVotes.push(`${jaw}${side}` as Zone);
    if (this.zoneVotes.length > 10) this.zoneVotes.shift();
    out.zone = mode(this.zoneVotes);
    return out;
  }

  // Short, quick back-and-forth strokes (brushing), not a slow wave or a single swipe.
  private isScrubbing(scale: number): boolean {
    const t = this.trail;
    if (t.length < 8) return false;
    let path = 0, flips = 0, lastSign = 0;
    let minX = 1, maxX = 0, minY = 1, maxY = 0;
    for (let i = 1; i < t.length; i++) {
      const dx = t[i].x - t[i - 1].x, dy = t[i].y - t[i - 1].y;
      path += Math.hypot(dx, dy);
      const main = Math.abs(dx) > Math.abs(dy) ? dx : dy;
      const s = Math.abs(main) > scale * 0.01 ? Math.sign(main) : 0;
      if (s && lastSign && s !== lastSign) flips++;
      if (s) lastSign = s;
      minX = Math.min(minX, t[i].x); maxX = Math.max(maxX, t[i].x);
      minY = Math.min(minY, t[i].y); maxY = Math.max(maxY, t[i].y);
    }
    const span = Math.max(maxX - minX, maxY - minY) / scale;
    return path / scale > 0.4 && flips >= 3 && span < 1.5;
  }
}

// At least three of the four fingers curled: fingertip is closer to the wrist than its middle joint.
function isGrip(h: Pt[]): boolean {
  const wrist = h[0];
  const d = (a: Pt) => Math.hypot(a.x - wrist.x, a.y - wrist.y);
  let curled = 0;
  for (const [tip, pip] of [[8, 6], [12, 10], [16, 14], [20, 18]]) if (d(h[tip]) < d(h[pip]) * 1.05) curled++;
  return curled >= 3;
}

const pt = (l: Pt): Pt => ({ x: l.x, y: l.y });

function distToBox(x: number, y: number, b: { x0: number; y0: number; x1: number; y1: number }) {
  const dx = Math.max(b.x0 - x, 0, x - b.x1), dy = Math.max(b.y0 - y, 0, y - b.y1);
  return Math.hypot(dx, dy);
}

function farthestPoint(b: { x0: number; y0: number; x1: number; y1: number }, from: Pt): Pt {
  const cands = [
    { x: b.x0, y: b.y0 }, { x: b.x1, y: b.y0 }, { x: b.x0, y: b.y1 }, { x: b.x1, y: b.y1 },
    { x: (b.x0 + b.x1) / 2, y: b.y0 }, { x: (b.x0 + b.x1) / 2, y: b.y1 }, { x: b.x0, y: (b.y0 + b.y1) / 2 }, { x: b.x1, y: (b.y0 + b.y1) / 2 },
  ];
  return cands.reduce((a, c) => (Math.hypot(c.x - from.x, c.y - from.y) > Math.hypot(a.x - from.x, a.y - from.y) ? c : a));
}

function mode<T>(arr: T[]): T {
  const c = new Map<T, number>();
  let best = arr[0], n = 0;
  for (const a of arr) { const k = (c.get(a) ?? 0) + 1; c.set(a, k); if (k > n) { n = k; best = a; } }
  return best;
}
