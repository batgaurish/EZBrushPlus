import { LockSimple, SpeakerHigh, SpeakerSlash } from "@phosphor-icons/react";
import * as P from "../progress";
import { BADGE_ICONS } from "../icons";
import { BOSSES, kenney, lottie } from "../assets";
import Lottie from "../Lottie";
import { play } from "../sound";
import { sfx } from "../assets";

interface Props { progress: P.Progress; onStart: () => void; onTheme: (t: P.ThemeId) => void; muted: boolean; onMute: () => void }

const THEMES: { id: P.ThemeId; name: string }[] = [
  { id: "arcade", name: "Arcade" },
  { id: "hero", name: "Hero" },
  { id: "candy", name: "Candy" },
];

export default function Home({ progress, onStart, onTheme, muted, onMute }: Props) {
  const { lvl, into, need } = P.levelInfo(progress.xp);
  const stats = {
    lvl, into, need,
    rank: P.rankName(lvl),
    streak: P.streak(progress),
    today: Math.min(2, P.todayCount(progress)),
    total: progress.sessions.length,
  };
  const start = () => { play(sfx.click); onStart(); };
  const t = progress.theme;

  return (
    <main className="home">
      <nav className="theme-switch" aria-label="Theme">
        {THEMES.map(th => (
          <button key={th.id} className={th.id === t ? "on" : ""} onClick={() => { play(sfx.tap); onTheme(th.id); }}>{th.name}</button>
        ))}
        <button className="mute" onClick={onMute} aria-label={muted ? "Turn sound on" : "Turn sound off"}>
          {muted ? <SpeakerSlash size={18} weight="fill" /> : <SpeakerHigh size={18} weight="fill" />}
        </button>
      </nav>

      {t === "arcade" && <ArcadeHero s={stats} onStart={start} />}
      {t === "hero" && <HeroHero s={stats} onStart={start} />}
      {t === "candy" && <CandyHero s={stats} onStart={start} progress={progress} />}

      {t !== "candy" && <Week progress={progress} />}
      <Badges progress={progress} />
    </main>
  );
}

type Stats = { lvl: number; into: number; need: number; rank: string; streak: number; today: number; total: number };

/* ---------- A. Germ Arcade ---------- */
function ArcadeHero({ s, onStart }: { s: Stats; onStart: () => void }) {
  const boss = BOSSES[new Date().getDate() % BOSSES.length];
  return (
    <section className="hero-block">
      <h1 className="title">EZBRUSH+</h1>
      <div className="pills">
        <span><img src={kenney.star("yellow")} alt="" />LV {s.lvl}</span>
        <span>{s.streak} DAY STREAK</span>
        <span>{s.today}/2 TODAY</span>
      </div>
      <div className="card boss">
        <small>{s.today === 0 ? "MORNING BOSS" : "EVENING BOSS"}</small>
        <img src={boss.img} alt="" className="boss-img" />
        <b>{boss.name.toUpperCase()}</b>
        <div className="hp"><i style={{ width: s.today >= 2 ? "0%" : "100%" }} /></div>
      </div>
      <button className="cta" onClick={onStart}>BRUSH!</button>
      <div className="card quest">
        <small>DAILY QUEST</small>
        <span>BRUSH TWICE TODAY</span>
        <div className="hp good"><i style={{ width: `${(s.today / 2) * 100}%` }} /></div>
      </div>
      <div className="card quest">
        <small>LEVEL {s.lvl} · {s.rank.toUpperCase()}</small>
        <span className="num">{s.into} / {s.need} XP</span>
        <div className="hp good"><i style={{ width: `${(s.into / s.need) * 100}%` }} /></div>
      </div>
    </section>
  );
}

/* ---------- C. Super Smile Hero ---------- */
function HeroHero({ s, onStart }: { s: Stats; onStart: () => void }) {
  return (
    <section className="hero-block">
      <h1 className="title">EZBrush<span>+</span></h1>
      <Lottie src={lottie.wandTooth} className="mascot" />
      <div className="card lvl">
        <div className="row"><b>{s.rank}</b><small>LV {s.lvl}</small></div>
        <div className="xp"><i style={{ width: `${(s.into / s.need) * 100}%` }} /></div>
        <small className="xp-text">{s.into} / {s.need} XP</small>
      </div>
      <div className="trio">
        <div><b>{s.streak}</b><small>STREAK</small></div>
        <div><b>{s.today}/2</b><small>TODAY</small></div>
        <div><b>{s.total}</b><small>BATTLES</small></div>
      </div>
      <button className="cta" onClick={onStart}>Power up!</button>
    </section>
  );
}

/* ---------- D. Candy Clinic ---------- */
function CandyHero({ s, onStart, progress }: { s: Stats; onStart: () => void; progress: P.Progress }) {
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning!" : hour < 18 ? "Hi there!" : "Bedtime brush?";
  return (
    <section className="hero-block">
      <div className="greet">
        <b>{greet}<small>Ready to sparkle?</small></b>
        <div className="lv-badge"><img src={kenney.star("yellow")} alt="" /><span>{s.lvl}</span></div>
      </div>
      <Lottie src={lottie.pasteTooth} className="mascot" />
      <Week progress={progress} compact />
      <button className="cta" onClick={onStart}><img src={kenney.star("yellow")} alt="" />Let's brush!</button>
      <div className="card xpcard">
        <div className="row"><b>{s.rank}</b><small>{s.into} / {s.need} XP</small></div>
        <div className="xp"><i style={{ width: `${(s.into / s.need) * 100}%` }} /></div>
      </div>
    </section>
  );
}

/* ---------- shared: weekly log (parent check-in) ---------- */
function Week({ progress, compact }: { progress: P.Progress; compact?: boolean }) {
  const byDay = new Map<string, P.Session[]>();
  for (const s of progress.sessions) byDay.set(s.date, [...(byDay.get(s.date) ?? []), s]);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i));
    return { d, n: (byDay.get(P.dayKey(d)) ?? []).length, today: i === 6 };
  });
  const week = progress.sessions.filter(s => Date.now() - s.ts < 7 * 864e5);
  const avg = week.length ? Math.round(week.reduce((a, s) => a + s.score, 0) / week.length) : 0;

  return (
    <section className={`card week ${compact ? "compact" : ""}`}>
      {!compact && <h2>This week <span>Parent check-in</span></h2>}
      <div className="days">
        {days.map(({ d, n, today }) => (
          <div key={d.toISOString()} title={`${d.toDateString()}: ${n} brush(es)`}>
            {d.toLocaleDateString(undefined, { weekday: "narrow" })}
            <i className={`n${Math.min(2, n)} ${today ? "today" : ""}`} />
          </div>
        ))}
      </div>
      <p>{P.streak(progress)} day streak · {week.length} of 14 brushes · {avg}% average coverage</p>
    </section>
  );
}

function Badges({ progress }: { progress: P.Progress }) {
  return (
    <section className="badges-wrap">
      <h2>Trophies</h2>
      <ul className="badges">
        {P.BADGES.map(b => {
          const got = progress.badges.includes(b.id);
          const I = BADGE_ICONS[b.icon];
          return (
            <li key={b.id} className={got ? "got" : ""}>
              <span className="badge-icon">{got ? <I size={26} weight="fill" /> : <LockSimple size={20} weight="bold" />}</span>
              <b>{b.name}</b>
              <small>{b.desc}</small>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
