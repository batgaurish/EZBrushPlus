# EZBrush+

A gamified toothbrushing coach for kids and teens. It runs in the browser on a laptop (using the webcam) and as an Android app. The camera watches you brush, works out which part of your mouth you're cleaning, and turns the two minutes into a game: germ monsters to defeat, stars, XP, streaks and trophies.

**Try it in your browser:** https://batgaurish.github.io/EZBrushPlus/ · **Android APK:** [latest release](https://github.com/batgaurish/EZBrushPlus/releases/latest)

This is a non-commercial proof of concept built for an academic project.

## How it works

- **Brushing detection, on the device.** MediaPipe Face Landmarker finds the mouth, and Hand Landmarker finds the hand holding the brush. A brush stroke counts when the hand is near the mouth and moving back and forth. Video never leaves the device.
- **Six mouth zones.** The hand's position relative to the lips decides the zone: top or bottom, and left, front or right. Each zone needs about 20 seconds, for the dentist-recommended 2 minutes in total.
- **AR guide.** The camera view shows a 6-cell grid over the mouth. The next zone to brush pulses with a dashed outline and an arrow, and the zone you're brushing lights up green.
- **Three switchable themes**, each with its own music:
  - **Germ Arcade:** a daily "boss" germ monster, health bars, combos and daily quests.
  - **Super Smile Hero:** a night-sky adventure with an animated tooth hero and a germ squad to defeat.
  - **Candy Clinic:** soft pastels and a bouncy tooth buddy, aimed at younger kids.

## Why these features (research basis)

| Finding | Feature in the app |
|---|---|
| *BMC Oral Health* (2020): preschoolers whose mothers used a **gamified** app had better plaque control after a month than those using a simple app. | Game loop: germ monsters, stars, XP, levels, trophies and combos. |
| Gravitation-sensor toothbrush + reward app, 49 preschoolers, 12 weeks: plaque improved, and the effect **held after the app was removed**. | Sensor-style feedback through the camera, plus habit features: streaks, a twice-a-day goal, and a "Habit Master" trophy for 21 brushing days. |
| *Frontiers in Dental Medicine* (2025) systematic review of 9 RCTs: most app interventions improved **knowledge, hygiene behaviour and plaque**. | An oral-health tip after every session, per-zone coverage feedback ("germs are still hiding on…"), and a weekly parent check-in. |

## Run it

```bash
npm install
npm run dev          # http://localhost:5173 (allow camera access)
```

### Build the Android APK

Requires the Android SDK and **JDK 21**.

```bash
JAVA_HOME=/usr/lib/jvm/java-21-openjdk npm run android:apk
# → android/app/build/outputs/apk/debug/app-debug.apk
```

The first session downloads the MediaPipe models (about 10 MB) from Google's CDN.

## Tech

React 19 + TypeScript + Vite · MediaPipe Tasks Vision · lottie-web · Capacitor (Android) · Phosphor icons

## Asset credits

All assets are free to use. Thanks to their creators.

| Asset | Source | License |
|---|---|---|
| UI buttons, stars, "Kenney Future" font | [Kenney – UI Pack](https://kenney.nl/assets/ui-pack) | CC0 |
| Interface sound effects | [Kenney – Interface Sounds](https://kenney.nl/assets/interface-sounds) | CC0 |
| Win/start jingles | [Kenney – Music Jingles](https://kenney.nl/assets/music-jingles) | CC0 |
| Germ monster sprites | ["Random Germs/Amoeba Sprites" by ChiliGames](https://opengameart.org/content/random-germsamoeba-sprites), OpenGameArt | CC-BY-SA 3.0 |
| Arcade theme music | ["Happy Adventure (Loop)" by TinyWorlds](https://opengameart.org/content/happy-adventure-loop), OpenGameArt | CC0 |
| Hero theme music | ["8-Bit Battle Loop" by Wolfgang_](https://opengameart.org/content/8-bit-battle-loop), OpenGameArt | CC0 |
| Candy theme music | ["Flowerbed Fields [Loop]" by Zane Little Music](https://opengameart.org/content/flowerbed-fields-loop), OpenGameArt | CC0 |
| Tooth mascots, confetti, pop and trophy animations | [LottieFiles](https://lottiefiles.com/free-animations/tooth) free animations | Lottie Simple License |
| Illustrations (mockups) | [Storyset](https://storyset.com) by Freepik | Free with attribution |
| Icons | [Phosphor Icons](https://phosphoricons.com) | MIT |
| Fonts: Nunito, Lilita One, Baloo 2 | Google Fonts via Fontsource | OFL |

`public/mockups.html` contains the original four UI concepts.
