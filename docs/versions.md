# Versions

The title screen shows `Version X.Y.Z · build <hash> · <date>` (`src/ui/version.ts`). The build hash changes with every build; **the version number is bumped by hand when a feature ships**, and each bump gets a line here.

- Until 1.0 the number has three parts and only the last one moves: 0.9.1, 0.9.2, ... for each feature, rule, unit or screen that ships (small fixes ride along). Two-part numbers 0.4 to 0.9 were used for the first versions; a `0.10` was tried and dropped because it reads as 0.1.
- 1.0: when the game is complete enough to call it finished (the roadmap in the project memory).

| Version | Date | What it covers |
| --- | --- | --- |
| 0.4 | 2026-10-28 | The first numbered version. Milestones 1 to 3 plus most of stage 4: the playable game with orders, city screen and reports; Easy, Medium and Hard AI; city strength and bombardment; promotions; Advanced units (Armor, Bombers, Airbases); the art, sound and music passes; Resign. The old label said "Milestone 2c" until this point. |
| 0.5 | 2026-10-28 | Terrain for the Advanced rules, as in the original manual: mountains (Armor cannot enter), forest, rough ground and rivers (Armor's move cut to one square), land units defending at double in forest and on mountains, and in rivers against Armor. Drawn as plain stand-ins until the terrain pictures arrive. |
| 0.6 | 2026-10-28 | Photo-real terrain: the sea, grass, rough ground, forest and mountains are drawn from pictures, blending into each other, with curving rivers. Used in every game, not only the Advanced rules. |
| 0.7 | 2026-10-28 | Beaches: coasts have a strip of shallows, foam and sand from the Shore picture, replacing the plain tint. |
| 0.8 | 2026-10-28 | Smoother coasts: soft patches of shallows and sand fill the notches where a coast turns, rounding points of land and the heads of bays. |
| 0.9 | 2026-10-28 | A Stats button on the Victory, Defeated and no-survivors cards opens the Status report straight away. |
| 0.9.1 | 2026-10-28 | The Hard computer player uses the Advanced units: it builds Bombers (one at four cities, more later) that fly out to bomb the nearest enemy city and come home to refuel and repair, and it turns an idle Army into an Airbase near the front for them to land on. |
| 0.9.2 | 2026-10-28 | Smooth, rounded coast corners (points of land, bays and one-square lakes) instead of square ones; faster drawing when zoomed out. |
| 0.9.3 | 2026-10-28 | A ship reaching Elite gets its own sound (the Victory trumpets cut short) instead of the plain promotion jingle. |
| 0.9.4 | 2026-10-28 | Soft fog of war: the dark over known-but-unseen squares fades in at the edge of sight instead of ending in straight lines. |
