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

Production sounds play as each new unit's production screen opens, one at a time. Several other events in one moment are limited to 4 sounds, played 120 ms apart, least important dropped first.

| Name (file name to use) | Plays when |
| --- | --- |
| `click` | You press End Turn |
| `turn` | Your turn starts |
| `chime` | Fallback for a produced unit of an unknown type (not normally heard) |
| `produce-army` | The production screen for a new army opens (synth: snare-like drum roll) |
| `produce-armor` | The production screen for a new armor opens (not in the game yet; recorded, 4 s, synth rumble is the fallback) |
| `produce-fighter` | The production screen for a new fighter opens (jet whoosh) |
| `produce-transport` | The production screen for a new transport opens (short low ship horn) |
| `produce-destroyer` | The production screen for a new destroyer opens (recorded, 1.8 s; the synth glissando is the fallback) |
| `produce-submarine` | The production screen for a new submarine opens (recorded, 2.5 s; the synth sonar ping is the fallback) |
| `produce-cruiser` | The production screen for a new cruiser opens (recorded, 2 s; the synth double horn is the fallback) |
| `produce-battleship` | The production screen for a new battleship opens (recorded, 1.7 s; the synth horn and rumble is the fallback) |
| `produce-carrier` | The production screen for a new carrier opens (recorded, 3 s; the synth klaxon is the fallback) |
| `shot` | A battle you can see |
| `explosion` | A unit was destroyed in a battle (yours or one you watch), after the shot; recorded, 1 s, the synth boom is the fallback |
| `crash` | An aircraft ran out of fuel and crashed |
| `capture` | You captured a city (brass fanfare); winning an ordinary fight has no sound of its own beyond the shot and explosion |
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

## Title-screen music

The game plays a theme on the title screen and fades it out when a game starts. The current theme is `public/music/battleThemeA.mp3`.
There is no built-in tune: if the line in `MUSIC` is removed, nothing plays.

1. Put the track in `public/music/`, e.g. `public/music/title.mp3`.
2. In `src/audio/sounds.ts` set `title: '/music/title.mp3'` in `MUSIC`.

It loops, so use a track that loops cleanly or runs a minute or two. On an iPad (and in most browsers) music can only start after the
first tap, so it begins then. The **Sound** button (title screen and in-game) has Music on/off and a separate music volume.

## Where the recorded sounds came from

Keep this list up to date: one line per recorded file, with the page it came from and its licence.

| File | Source | Licence | Used |
| --- | --- | --- | --- |
| `produce-transport.mp3` | https://freesound.org/people/devy32/sounds/441223/ (devy32) | CC0 (checked by the game's owner) | seconds 16.7 to 19.2 |
| `produce-fighter.mp3` | https://freesound.org/people/LukaCafuka/sounds/809207/ (LukaCafuka) | CC0 (checked by the game's owner) | seconds 4 to 7 |
| `produce-destroyer.mp3` | https://freesound.org/people/craigsmith/sounds/675788/ (craigsmith) | CC0 (checked by the game's owner) | seconds 13.2 to 15 |
| `produce-submarine.mp3` | https://freesound.org/people/Timbre/sounds/203562/ (Timbre) | CC0 (checked by the game's owner) | first 2.5 seconds |
| `produce-cruiser.mp3` | https://freesound.org/people/Grotelue/sounds/64601/ (Grotelue) | CC0 (checked by the game's owner) | seconds 2.5 to 4.5 |
| `produce-battleship.mp3` | https://freesound.org/people/qubodup/sounds/162365/ (qubodup) | CC0 (checked by the game's owner) | first 1.7 seconds |
| `produce-carrier.mp3` | https://freesound.org/people/qubodup/sounds/162449/ (qubodup) | CC0 (checked by the game's owner) | 2:58 to 3:01 |
| `produce-armor.mp3` | https://freesound.org/people/greatmganga/sounds/329800/ (greatmganga) | CC0 (checked by the game's owner) | first 4 seconds |
| `battleThemeA.mp3` (title music) | https://opengameart.org/content/battle-theme-a | CC0 (checked by the game's owner) | whole track, about 1:36, loops |
| `explosion.mp3` | https://freesound.org/people/Anomaex/sounds/490266/ (Anomaex) | CC0 (checked by the game's owner) | seconds 1.5 to 2.5 |

The untrimmed originals are kept outside the project in `Documents\Claude\sound-originals`.
