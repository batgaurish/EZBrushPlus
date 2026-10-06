import { ArrowFatUp, Lightbulb } from "@phosphor-icons/react";
import { ZONES } from "../detector";
import { ZONE_LABEL, type Result } from "../game";
import * as P from "../progress";
import { BADGE_ICONS } from "../icons";
import { germ, kenney, lottie, sfx } from "../assets";
import Lottie from "../Lottie";
import { play } from "../sound";
import { useEffect } from "react";

const TITLES: Record<P.ThemeId, string[]> = {
  arcade: ["GERMS ESCAPED", "ROUND CLEARED", "BOSS DEFEATED", "FLAWLESS VICTORY"],
  hero: ["The germs got away", "Good fight, hero", "Germ squad defeated", "Legendary smile"],
  candy: ["Let's try again!", "Good start!", "So sparkly!", "Super shiny smile!"],
};

export default function Results({ result: r, theme, onContinue }: { result: Result; theme: P.ThemeId; onContinue: () => void }) {
  const stars = r.score >= 90 ? 3 : r.score >= 60 ? 2 : r.score >= 30 ? 1 : 0;
  useEffect(() => { play(stars >= 2 ? sfx.win : sfx.clean); }, [stars]);

  return (
    <main className="results">
      {stars >= 2 && <Lottie src={lottie.confetti} loop={false} className="confetti" />}
      <div className="stars">
        {[0, 1, 2].map(i => <img key={i} src={i < stars ? kenney.star("yellow") : kenney.starEmpty} alt="" style={{ animationDelay: `${i * 0.18}s` }} />)}
      </div>
      <h1>{TITLES[theme][stars]}</h1>
      <p className="score">{r.score}% clean · <b>+{r.xp} XP</b></p>

      <div className="res-grid">
        {ZONES.map((z, i) => {
          const ok = r.coverage[i] >= 1;
          return (
            <div key={z} className={ok ? "ok" : ""}>
              <img src={ok ? kenney.star("green") : germ[z]} alt="" />
              <span>{ZONE_LABEL[z]}</span>
              <b>{Math.round(r.coverage[i] * 100)}%</b>
            </div>
          );
        })}
      </div>

      <div className="notes">
        {r.levelUp && <div className="note gold"><ArrowFatUp weight="fill" /> Level {r.levelUp}! You're now a {P.rankName(r.levelUp)}</div>}
        {r.newBadges.map(id => {
          const b = P.BADGES.find(b => b.id === id)!;
          const I = BADGE_ICONS[b.icon];
          return <div key={id} className="note gold"><I weight="fill" /> New trophy: <b>{b.name}</b></div>;
        })}
        {r.missed.length > 0 && <div className="note">Germs are still hiding on the {r.missed.join(", ")}. Get them next time!</div>}
        <div className="note tip"><Lightbulb weight="fill" /> {r.tip}</div>
      </div>

      <button className="cta" onClick={() => { play(sfx.click); onContinue(); }}>{theme === "arcade" ? "CONTINUE" : "Continue"}</button>
    </main>
  );
}
