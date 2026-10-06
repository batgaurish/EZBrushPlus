const cache = new Map<string, HTMLAudioElement>();
let muted = false;
try { muted = localStorage.getItem("ezbrush.muted") === "1"; } catch {}

export const isMuted = () => muted;

export function play(src: string, volume = 0.7) {
  if (muted) return;
  try {
    let a = cache.get(src);
    if (!a) { a = new Audio(src); cache.set(src, a); }
    a.volume = volume;
    a.currentTime = 0;
    void a.play().catch(() => {});
  } catch {}
}

// One background track at a time, looping quietly under the sound effects.
let bgm: HTMLAudioElement | null = null;
export function playMusic(src: string | null, volume = 0.35) {
  if (bgm && (!src || !bgm.src.endsWith(src.replace("./", "")))) { bgm.pause(); bgm = null; }
  if (!src || muted) return;
  if (!bgm) { bgm = new Audio(src); bgm.loop = true; }
  bgm.volume = volume;
  void bgm.play().catch(() => {}); // browsers allow this only after the first tap
}

export function setMuted(m: boolean, resume?: string) {
  muted = m;
  try { localStorage.setItem("ezbrush.muted", m ? "1" : "0"); } catch {}
  if (m) playMusic(null); else if (resume) playMusic(resume);
}
