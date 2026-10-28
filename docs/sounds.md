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
| `produce-army` | The production screen for a new army opens (recorded, 0.6 s: two .50 cal shots and their echo; the synth snare-like drum roll is the fallback) |
| `produce-armor` | The production screen for a new armor opens (not in the game yet; recorded, 4 s, synth rumble is the fallback) |
| `produce-fighter` | The production screen for a new fighter opens (jet whoosh) |
| `produce-transport` | The production screen for a new transport opens (short low ship horn) |
| `produce-destroyer` | The production screen for a new destroyer opens (recorded, 2.8 s, ends with 1 gun shot; the synth glissando is the fallback) |
| `produce-submarine` | The production screen for a new submarine opens (recorded, 2.5 s; the synth sonar ping is the fallback) |
| `produce-cruiser` | The production screen for a new cruiser opens (recorded, 3.35 s, ends with 2 gun shots; the synth double horn is the fallback) |
| `produce-battleship` | The production screen for a new battleship opens (recorded, 5.6 s of real battleship gunfire; the synth horn and rumble is the fallback) |
| `produce-carrier` | The production screen for a new carrier opens (recorded, 5 s; the synth klaxon is the fallback) |
| `shot` | A battle you can see |
| `explosion` | A unit was destroyed in a battle (yours or one you watch), after the shot; recorded, 1 s, the synth boom is the fallback |
| `crash` | An aircraft ran out of fuel and crashed |
| `capture` | You captured a city (brass fanfare); winning an ordinary fight has no sound of its own beyond the shot and explosion |
| `lost` | One of your cities was captured (alarm) |
| `alert` | One of your units sighted an enemy and stopped |
| `unload` | Your transport unloaded troops |
| `promote` | One of your ships is promoted (recorded, 1.45 s, a rank-up jingle; the synth two-note chime is the fallback) |
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
| `produce-destroyer.mp3` | https://freesound.org/people/craigsmith/sounds/675788/ (craigsmith) | CC0 (checked by the game's owner) | seconds 13.2 to 15, then 1 gun shot (see `warship-gunfire`); the shot was then given a deep thump and a softer crack like the cruiser's (original kept as `produce-destroyer-before-boom.mp3` in `sound-originals`) |
| `produce-submarine.mp3` | https://freesound.org/people/Timbre/sounds/203562/ (Timbre) | CC0 (checked by the game's owner) | first 2.5 seconds |
| `produce-cruiser.mp3` | https://freesound.org/people/Grotelue/sounds/64601/ (Grotelue) | CC0 (checked by the game's owner) | seconds 2.5 to 4.5, then 2 gun shots (see `warship-gunfire`); the guns were then given a deep thump (a synthesized falling sine, about 38 to 108 Hz, one under each shot), a little more bass and a softer crack (ffmpeg `aevalsrc`, `bass`, `treble` and `alimiter`), levelled to the same overall loudness as before. The version before is kept as `produce-cruiser-before-boom.mp3` in `sound-originals` |
| `produce-battleship.mp3` | https://freesound.org/people/qubodup/sounds/162365/ (qubodup) | CC0 (checked by the game's owner) | seconds 0 to 5.6, then a deep thump added under the turret shots at about 0 s and 2.3 s, a little more bass and a softer crack (original kept as `produce-battleship-before-boom.mp3` in `sound-originals`) |
| `produce-carrier.mp3` | https://www.dvidshub.net/video/999721/f-18f-super-hornets-launch-uss-abraham-lincoln (U.S. Navy video, U.S. Central Command Public Affairs, taken 2026-03-14) | Public domain (as stated on the DVIDS page, checked by the game's owner); no endorsement by the Navy is implied | audio from 13 s to 18 s |
| `produce-army.mp3` | https://www.dvidshub.net/video/606948/usna-midshipmen-shoot-50-cal-machine-gun-aboard-ghwb (U.S. Navy video by MC3 Roland John, 2018) | Public domain (as stated on the DVIDS page, checked by the game's owner); no endorsement by the Navy is implied | audio from 5.95 s to 7.05 s (the burst fires about 8 shots a second; the game keeps the first two shots, 6.01 s to 6.26 s, and joins on the burst's echo, from 6.67 s on, with a 30 ms crossfade), softened: treble rolled off above 3.5 kHz, a 3 dB dip at 2.5 kHz, bass raised 6 dB at 120 Hz (ffmpeg lowpass and equalizer filters), then levelled with its loudest peak at about -14 dB (turned down twice after play-testing: constant gunfire in long land battles) |
| `produce-armor.mp3` | https://freesound.org/people/greatmganga/sounds/329800/ (greatmganga) | CC0 (checked by the game's owner) | first 4 seconds |
| `promote.mp3` | https://freesound.org/people/PearceWilsonKing/sounds/274145/ (PearceWilsonKing) | CC0 (checked by the game's owner) | the first 1.45 seconds, faded out over the last 0.2 s, turned down about 4.5 dB with a peak limiter (ffmpeg `volume` and `alimiter` with `level=0`) |
| `battleThemeA.mp3` (title music) | https://opengameart.org/content/battle-theme-a | CC0 (checked by the game's owner) | whole track, about 1:36, loops |
| `siegeOfTheHighCommand.mp3` (title music, alternates with the theme above each time the title screen appears) | Made by the game's owner with Google Gemini's music tool (Lyria), 2:40, re-encoded to 112 kbps (2.2 MB). Gemini replied in the same chat that tracks generated in the session may be used in personal or commercial projects, games included (a chatbot reply, not the terms page; keep the chat) | Generated by the owner | whole track, loops |
| `explosion.mp3` | https://freesound.org/people/Anomaex/sounds/490266/ (Anomaex) | CC0 (checked by the game's owner) | seconds 1.5 to 2.5 |
| `warship-gunfire` (added to the end of the destroyer and cruiser sounds) | https://freesound.org/people/morganpurkis/sounds/399853/ (morganpurkis, "Warship Main Battery Opening Fire") | CC0 (checked by the game's owner and on the page) | first second; 1 or 2 shots 0.35 s apart, a little quieter each time; the gunfire peaks at about -6.5 dB, louder than the rest of the sound |

The untrimmed originals are kept outside the project in `Documents\Claude\sound-originals`.

### Prepared, not in the game yet

`produce-airfield.mp3` (6.3 s) is the finished sound for the Airfield / Airbase of the Advanced rules. It ships as `public/sounds/produce-airfield.mp3` and plays (as the `airbase` sound, `OVERRIDES.airbase`) when you turn an Army or Armor into an Airbase. The Bomber's `produce-bomber.mp3` (3.9 s) ships the same way (`OVERRIDES['produce-bomber']`).

| File | Source | Licence | Used |
| --- | --- | --- | --- |
| `produce-airfield.mp3` (jet part) | https://freesound.org/people/qubodup/sounds/162449/ (qubodup), the recording the carrier sound used before the Navy clip | CC0 (checked by the game's owner) | 2:56 to 2:59, sped up 1.25x, mixed under the next part: the air traffic control starts 0.16 s in, so half of it plays over the jet, fading in over 1.5 s while the jet fades out from 1.2 s |
| `produce-airfield.mp3` (air traffic control part) | https://freesound.org/people/deleted_user_2906614/sounds/256852/ (alaskan air traffic control) | CC0 (checked by the game's owner) | 2:12 to 2:16.5 |
| `produce-bomber.mp3` | https://www.dvidshub.net/video/988417/sunrise-sortie-btf-26-1 (DVIDS, Sunrise Sortie BTF 26-1; US military footage) | DVIDS US government work, normally public domain (owner to confirm the page carries no restriction) | audio from 15 s to 18.9 s of the video (stops before the cut at 19 s), high-pass 60 Hz, loudness-normalised, 0.4 s fade in, 0.9 s fade out, mono |
| `win.mp3` | https://freesound.org/people/FunWithSound/sounds/456966/ (FunWithSound, Victory trumpets) | CC0 (checked on the Freesound page) | whole clip, 4.4 s, unedited; plays on the Victory screen (`OVERRIDES.win`) |
| `lose.mp3` | https://freesound.org/people/kanaizo/sounds/731657/ (kanaizo, Piano Game Over Theme, 85 BPM, F minor) | CC0 (checked on the Freesound page) | whole clip, 11.3 s, converted from WAV to MP3 only; plays on the Defeated screen (`OVERRIDES.lose`) |
| `produce-airfield.mp3` (level) | | | the air traffic control part is levelled 3 dB below the jet so it no longer outshouts it; total length 4.7 s |
