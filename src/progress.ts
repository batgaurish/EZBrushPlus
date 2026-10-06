export interface Session { date: string; ts: number; score: number; xp: number }
export type ThemeId = "arcade" | "hero" | "candy";
export interface Progress {
  xp: number;
  sessions: Session[];
  badges: string[];
  theme: ThemeId;
}

const KEY = "brushquest.v1";

export function load(): Progress {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? "");
    if (p && Array.isArray(p.sessions)) return { theme: "arcade", ...p };
  } catch {}
  return { xp: 0, sessions: [], badges: [], theme: "arcade" };
}
export function save(p: Progress) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch {}
}

export const dayKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// XP needed grows each level
export function levelInfo(xp: number) {
  let lvl = 1, need = 100, rest = xp;
  while (rest >= need) { rest -= need; lvl++; need = Math.round(need * 1.25); }
  return { lvl, into: rest, need };
}

const RANKS = ["Rookie Brusher", "Plaque Patrol", "Germ Buster", "Enamel Knight", "Floss Boss", "Smile Wizard", "Tooth Titan", "Legend of Sparkle"];
export const rankName = (lvl: number) => RANKS[Math.min(RANKS.length - 1, Math.floor((lvl - 1) / 3))];

export function streak(p: Progress): number {
  const days = new Set(p.sessions.map(s => s.date));
  const d = new Date();
  if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1); // today not done yet doesn't break it
  let n = 0;
  while (days.has(dayKey(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

export const todayCount = (p: Progress) => p.sessions.filter(s => s.date === dayKey()).length;

export interface Badge { id: string; icon: string; name: string; desc: string; test: (p: Progress, last: Session) => boolean }
export const BADGES: Badge[] = [
  { id: "first", icon: "Plant", name: "First Brush", desc: "Finish your first session", test: p => p.sessions.length >= 1 },
  { id: "perfect", icon: "Diamond", name: "Flawless", desc: "Score 100% coverage", test: (_, s) => s.score >= 100 },
  { id: "twice", icon: "SunHorizon", name: "Day & Night", desc: "Brush twice in one day", test: p => todayCount(p) >= 2 },
  { id: "streak3", icon: "Fire", name: "On Fire", desc: "3-day streak", test: p => streak(p) >= 3 },
  { id: "streak7", icon: "Lightning", name: "Week Warrior", desc: "7-day streak", test: p => streak(p) >= 7 },
  { id: "streak30", icon: "Crown", name: "Monthly Monarch", desc: "30-day streak", test: p => streak(p) >= 30 },
  { id: "ten", icon: "Target", name: "Ten Down", desc: "10 sessions total", test: p => p.sessions.length >= 10 },
  { id: "fifty", icon: "Medal", name: "Half Century", desc: "50 sessions total", test: p => p.sessions.length >= 50 },
  { id: "habit", icon: "Brain", name: "Habit Master", desc: "Brush on 21 different days", test: p => new Set(p.sessions.map(s => s.date)).size >= 21 },
  { id: "early", icon: "SunDim", name: "Early Bird", desc: "Brush before 8am", test: (_, s) => new Date(s.ts).getHours() < 8 },
  { id: "night", icon: "MoonStars", name: "Night Owl", desc: "Brush after 9pm", test: (_, s) => new Date(s.ts).getHours() >= 21 },
];
