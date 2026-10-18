# Sounds in Theater of Conquest

Every sound is currently made by the computer in code (a "synth"), so the game ships with no audio files. Any sound can
be replaced by a recorded file, with no other code change.

## How to swap a sound

1. Put the file in `public/sounds/`, named after the sound, e.g. `public/sounds/produce-army.mp3`
   (mp3, ogg, wav or m4a all work).
2. Add one line to `OVERRIDES` in `src/audio/sounds.ts`:

   ```ts
   export const OVERRIDES: Partial<Record<SoundName, string>> = {
     'produce-army': '/sounds/produce-army.mp3',
   };
   ```

3. Reload the game. The file is loaded the first time it is needed (that first play uses the built-in synth), then
   cached. If the file is missing or cannot be decoded, the synth plays instead, so a typo never makes a sound vanish.

Use the **Sound** button in the top bar to switch sound off, change the volume, or press Test.

## The sounds

Several events in one moment are limited to 4 sounds, played 120 ms apart, least important dropped first.

| Name (file name to use) | Plays when |
| --- | --- |
| `click` | You press End Turn |
| `turn` | Your turn starts |
| `chime` | Fallback for a produced unit of an unknown type (not normally heard) |
| `produce-army` | An army is built (synth: snare-like drum roll) |
| `produce-fighter` | A fighter is built (jet whoosh) |
| `produce-transport` | A transport is built (short low ship horn) |
| `produce-destroyer` | A destroyer is built (bosun's-pipe glissando) |
| `produce-submarine` | A submarine is built (sonar ping) |
| `produce-cruiser` | A cruiser is built (double horn) |
| `produce-battleship` | A battleship is built (deep horn and rumble) |
| `produce-carrier` | A carrier is built (two-tone klaxon) |
| `shot` | A battle you can see |
| `explosion` | A unit was destroyed in a battle |
| `crash` | An aircraft ran out of fuel and crashed |
| `capture` | You captured a city (brass fanfare) |
| `lost` | One of your cities was captured (alarm) |
| `alert` | One of your units sighted an enemy and stopped |
| `unload` | Your transport unloaded troops |
| `win` | You won the game |
| `lose` | You lost the game |

## Finding free sounds safely

- Prefer **CC0 / public domain** sources: Freesound (use the licence filter, choose "Creative Commons 0"),
  OpenGameArt (filter to CC0), and Kenney.nl (all CC0).
- Check the licence of **every** file before using it. Anything needing attribution (CC-BY) is possible, but then the
  credit has to be listed somewhere in the game.
- Never use clips from the original Empire Deluxe, other commercial games, films or TV: they are copyrighted.
- Keep files short (under 1.5 seconds) and normalised to a similar loudness so no single sound jumps out.
