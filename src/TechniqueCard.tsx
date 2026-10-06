import { useEffect, useState } from "react";
import { techniqueFor, type Profile } from "./techniques";

const TOOTH = "./assets/fluent/tooth_color.svg";
const BRUSH = "./assets/fluent/toothbrush_color.svg";

// Brush head position (px in a 150x120 scene) and rotation per motion. The brush art has its
// head top-left with bristles pointing up-right; rotating around the head aims the bristles.
const POSE: Record<string, { x: number; y: number; r: number }> = {
  bigCircles: { x: 46, y: 52, r: 45 },
  circles:    { x: 46, y: 50, r: 45 },
  bass:       { x: 44, y: 66, r: 90 },
  chew:       { x: 86, y: 14, r: 135 },
  inside:     { x: 46, y: 56, r: 45 },
  above:      { x: 60, y: 38, r: 90 },
  below:      { x: 60, y: 68, r: 0 },
};

export default function TechniqueCard({ profile, className = "" }: { profile: Profile; className?: string }) {
  const t = techniqueFor(profile);
  const [i, setI] = useState(0);
  useEffect(() => {
    setI(0);
    const id = setInterval(() => setI(n => (n + 1) % t.steps.length), 6000);
    return () => clearInterval(id);
  }, [t.name, t.steps.length]);
  const step = t.steps[i % t.steps.length];
  const pose = POSE[step.motion];

  return (
    <div className={`technique ${className}`} aria-live="polite">
      <div className="tq-head"><b>{t.name}</b><span>{i + 1}/{t.steps.length}</span></div>
      <div className="tq-scene" aria-hidden="true">
        <img src={TOOTH} className="tq-tooth" alt="" />
        <i className="tq-gum" />
        {profile.braces && <><i className="tq-wire" /><i className="tq-bracket" /></>}
        <div key={`${i}-${step.motion}`} className={`tq-move m-${step.motion}`} style={{ left: pose.x, top: pose.y }}>
          <img src={BRUSH} className="tq-brush" alt="" style={{ transform: `rotate(${pose.r}deg)` }} />
        </div>
      </div>
      <p className="tq-step">{step.text}</p>
    </div>
  );
}
