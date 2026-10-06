// One-Euro filter (Casiez et al. 2012): heavy smoothing when a point is still, light smoothing
// when it moves fast, so overlays stay steady without lagging behind quick brush strokes.
class OneEuro {
  private x: number | null = null;
  private dx = 0;
  private t = 0;
  constructor(private minCutoff = 1.2, private beta = 0.02, private dCutoff = 1) {}
  private static alpha(cutoff: number, dt: number) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }
  filter(v: number, tMs: number) {
    if (this.x === null) { this.x = v; this.t = tMs; return v; }
    const dt = Math.max(1e-3, (tMs - this.t) / 1000);
    this.t = tMs;
    const dv = (v - this.x) / dt;
    this.dx += OneEuro.alpha(this.dCutoff, dt) * (dv - this.dx);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    this.x += OneEuro.alpha(cutoff, dt) * (v - this.x);
    return this.x;
  }
}

export interface P2 { x: number; y: number }

/** Smooths a fixed-length list of 2D points (e.g. 21 hand landmarks). */
export class PointSmoother {
  private fx: OneEuro[] = [];
  private fy: OneEuro[] = [];
  constructor(private minCutoff = 1.2, private beta = 0.02) {}
  apply<T extends P2>(pts: T[], tMs: number): P2[] {
    while (this.fx.length < pts.length) {
      this.fx.push(new OneEuro(this.minCutoff, this.beta));
      this.fy.push(new OneEuro(this.minCutoff, this.beta));
    }
    return pts.map((p, i) => ({ x: this.fx[i].filter(p.x, tMs), y: this.fy[i].filter(p.y, tMs) }));
  }
  reset() { this.fx = []; this.fy = []; }
}
