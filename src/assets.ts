import type { Zone } from "./detector";

// Everything lives in public/assets so it ships inside the APK (no network needed).
const A = "./assets";

export const germ: Record<Zone, string> = {
  UL: `${A}/germs/purple.png`,
  UF: `${A}/germs/green.png`,
  UR: `${A}/germs/pink.png`,
  LL: `${A}/germs/yellow.png`,
  LF: `${A}/germs/orange.png`,
  LR: `${A}/germs/red.png`,
};
export const BOSSES = [
  { img: `${A}/germs/red.png`, name: "Plaque Triplets" },
  { img: `${A}/germs/blue.png`, name: "Cavity Crew" },
  { img: `${A}/germs/orange.png`, name: "Gumline Grabber" },
  { img: `${A}/germs/pink.png`, name: "Sugar Crystal" },
  { img: `${A}/germs/purple.png`, name: "Fuzz Twins" },
];

export const kenney = {
  btn: (c: "yellow" | "blue" | "green" | "red") => `${A}/kenney/button_rectangle_depth_gloss_${c}.svg`,
  round: (c: "yellow" | "blue" | "green" | "red" | "grey") => `${A}/kenney/button_round_depth_gloss_${c}.svg`,
  star: (c: "yellow" | "green" | "red" | "blue" | "grey") => `${A}/kenney/star_${c}.svg`,
  starEmpty: `${A}/kenney/star_outline_depth_grey.svg`,
};

export const lottie = {
  wandTooth: `${A}/lottie/cartoon-tooth-character-holding-wand-star-uHSffsUpTG.json`,
  pasteTooth: `${A}/lottie/cartoon-tooth-character-uf3C2cOfKE.json`,
  pop: `${A}/lottie/bubble-explosion-vRuWwfpbSh.json`,
  confetti: `${A}/lottie/confetti-1SNZxe6Ss8.json`,
  award: `${A}/lottie/award-or-achievement-animation-CTzRMYqMVC.json`,
  germ: `${A}/lottie/bacterium-ZHLICpwoHg.json`,
};

export const art = {
  kidsHighFive: `${A}/storyset/kids-high-five-pana.svg`,
  oralCare: `${A}/storyset/oral-care-rafiki.svg`,
  superhero: `${A}/storyset/superhero-cuate.svg`,
};

export const sfx = {
  tap: `${A}/sounds/tap.ogg`,
  click: `${A}/sounds/click.ogg`,
  start: `${A}/sounds/start.ogg`,
  clean: `${A}/sounds/clean.ogg`,
  pop: `${A}/sounds/pop.ogg`,
  combo: `${A}/sounds/combo.ogg`,
  win: `${A}/sounds/win.ogg`,
};

// CC0 loops from OpenGameArt (credits in README)
export const music = {
  arcade: `${A}/music/arcade.mp3`, // "Happy Adventure (Loop)" by TinyWorlds
  hero: `${A}/music/hero.ogg`,     // "8-Bit Battle Loop" by Wolfgang_
  candy: `${A}/music/candy.ogg`,   // "Flowerbed Fields [Loop]" by Zane Little Music
};
