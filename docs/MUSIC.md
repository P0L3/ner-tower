# Background music

Every run has its own background music, composed from the dataset and seeded like the tower:
same dataset + same seed = the same music, note for note. A weekly challenge or a replayed share
code therefore has the same tune as the run it replays, and **S** (new seed) gives a new one.

Music is **cosmetic**. It has its own random stream (`musicSeed` in `src/music/composer.ts`), never
touches the tower generator and never affects the score, so it is not part of the ruleset
([RULESET.md](RULESET.md)). Change it freely; no `RULESET_VERSION` bump.

## How the data becomes music

| Source | Becomes |
|---|---|
| seed | key, mode (ionian, dorian, phrygian, lydian, mixolydian, aeolian), tempo (84 to 116 bpm), chord progression, drum patterns, and which sentences are played |
| one real sentence per phrase | the melody. A phrase is 4 bars, played twice; the second time its last two bars answer two scale steps higher |
| each word | one note. The word itself decides its pitch step and (by length) its duration, so the same word always behaves the same way. Punctuation is a rest |
| entity tokens | the **lead** voice, loud, tagged with their label. Each label has its own timbre (sine, triangle, square or saw, chosen by hashing the label) |
| plain words | soft **pluck** notes, about four in ten of them |
| chords | bass and pad, which never depend on labels |

## How the music follows the run

- When a label turns **unstable**, its lead notes fall silent. The tune loses voices exactly as the
  tower loses platforms; the label that never turns unstable keeps singing.
- The **tempo** rises with the phase (1.5% per phase, up to phase 20), like the scroll speed.
- **Drums** build up: kick from the start, hats from phase 1, snare from phase 2.
- The composer always renders the complete music and the player filters it, so what is drawn from
  the RNG never depends on how the run goes.

## Controls and files

- **M** toggles the music (remembered in this browser). The **Music** slider in Settings sets its level, and **Effects** sets the sound effects; effects start well below the music. Muting keeps the timeline running.
- `src/music/composer.ts`: pure, deterministic composition (no Web Audio). Unit tested.
- `src/music/player.ts`: Web Audio synth and look-ahead scheduler. `MIX` holds the loudness of each part.
- `src/music/prefs.ts`: the on/off preference.
- `tools/music-test.html` + `tools/music-test.ts`: a stand-alone listening booth (no game), with buttons for every sound effect and the Effects volume. Run `npm run music`; pick a dataset, seed and phase, and hear exactly what the game plays.
