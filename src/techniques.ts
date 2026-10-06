// Brushing technique by age group / braces, following ADA and AAPD paediatric guidance:
// young children: Fones (big circles, teeth together) with a grown-up helping;
// school age: small circles moving toward the gumline; 10+: modified Bass (45° to the gumline,
// short vibrating strokes, then sweep away from the gums); braces: angle above and below brackets.
export type AgeGroup = "2-5" | "6-9" | "10-12" | "13+";
export interface Profile { age: AgeGroup; braces: boolean }
export const DEFAULT_PROFILE: Profile = { age: "6-9", braces: false };
export const AGE_GROUPS: AgeGroup[] = ["2-5", "6-9", "10-12", "13+"];

export type Motion = "bigCircles" | "circles" | "bass" | "chew" | "inside" | "above" | "below";
export interface Step { motion: Motion; text: string }
export interface Technique { name: string; note: string; steps: Step[] }

export function techniqueFor(p: Profile): Technique {
  if (p.braces) return {
    name: "Braces care",
    note: "Brush each tooth above and below the wire. Use an interdental brush between brackets.",
    steps: [
      { motion: "above", text: "Angle down over the brackets" },
      { motion: "below", text: "Angle up under the brackets" },
      { motion: "circles", text: "Small circles on every bracket" },
      { motion: "chew", text: "Scrub the chewing tops" },
    ],
  };
  if (p.age === "2-5") return {
    name: "Big circles",
    note: "A grown-up helps. Use a pea-sized blob of toothpaste (a rice grain under 3).",
    steps: [
      { motion: "bigCircles", text: "Big circles, teeth together" },
      { motion: "chew", text: "Open wide, scrub the tops" },
      { motion: "inside", text: "Little strokes inside" },
    ],
  };
  if (p.age === "6-9") return {
    name: "Small circles",
    note: "Pea-sized toothpaste. Spit, don't rinse.",
    steps: [
      { motion: "circles", text: "Small circles on each tooth" },
      { motion: "bass", text: "Tilt the bristles to the gums" },
      { motion: "chew", text: "Back and forth on the tops" },
      { motion: "inside", text: "Up and down inside the front" },
    ],
  };
  return {
    name: "Modified Bass",
    note: "Gentle pressure. Spit, don't rinse.",
    steps: [
      { motion: "bass", text: "45° to the gumline, tiny jiggles" },
      { motion: "bass", text: "Then sweep away from the gums" },
      { motion: "chew", text: "Short strokes on chewing tops" },
      { motion: "inside", text: "Tip the brush up for inside fronts" },
    ],
  };
}
