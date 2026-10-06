import type { Zone } from "./detector";

export const TOTAL_MS = 120_000;            // dentist-recommended 2 minutes
export const ZONE_TARGET_MS = TOTAL_MS / 6; // ~20s per zone

export const ZONE_LABEL: Record<Zone, string> = {
  UL: "Top left", UF: "Top front", UR: "Top right",
  LL: "Bottom left", LF: "Bottom front", LR: "Bottom right",
};

// Short knowledge tips: education was one of the effective components in the app RCTs.
export const TIPS = [
  "Brush twice a day for two minutes, once in the morning and once before bed.",
  "Angle the bristles 45° toward the gumline. That's where plaque collects.",
  "Small circles clean better than hard scrubbing, and they're gentler on gums.",
  "Back molars are the most-missed teeth. Give them extra time.",
  "Spit, don't rinse. Leaving the fluoride on keeps enamel stronger.",
  "Replace your brush every three months, or sooner if the bristles splay.",
  "Sugary drinks feed plaque bacteria. Water is the best thing to drink between meals.",
  "Plaque can harden into tartar within a couple of days if it isn't brushed away.",
  "Brushing your tongue cuts down on the bacteria behind bad breath.",
];

export interface Result {
  score: number;
  coverage: number[];
  xp: number;
  missed: string[];
  newBadges: string[];
  levelUp: number | null;
  tip: string;
}
