# Versions

The title screen shows `Version X.Y · build <hash> · <date>` (`src/ui/version.ts`). The build hash changes with every
build; **the version number is bumped by hand when a feature ships**, and each bump gets a line here.

- Minor number (0.4 to 0.5): a new feature or rule, a new unit, a new screen.
- Patch number (0.4 to 0.4.1): only when a fix is released on its own; small fixes ride along with the next minor bump.
- 1.0: when the game is complete enough to call it finished (the roadmap in the project memory).

| Version | Date | What it covers |
| --- | --- | --- |
| 0.4 | 2026-10-28 | The first numbered version. Milestones 1 to 3 plus most of stage 4: the playable game with orders, city screen and reports; Easy, Medium and Hard AI; city strength and bombardment; promotions; Advanced units (Armor, Bombers, Airbases); the art, sound and music passes; Resign. The old label said "Milestone 2c" until this point. |
| 0.5 | 2026-10-28 | Terrain for the Advanced rules, as in the original manual: mountains (Armor cannot enter), forest, rough ground and rivers (Armor's move cut to one square), land units defending at double in forest and on mountains, and in rivers against Armor. Drawn as plain stand-ins until the terrain pictures arrive. |
