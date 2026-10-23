# Artwork

## Unit cards

`public/art/<unit>.webp` are the artwork cards shown on the production screen (beside the list of units) and on the production report. They are 560 px versions of the originals, which are kept outside the project in `Documents\Claude\art-originals` (1024 px, one per unit, including Armor, Bomber and Spy for the Advanced rules).

- **Made with:** Gemini (AI image generation), by the game's owner, in the style of the intro page.
- **The made-up lettering:** every card has nonsense text baked into its top-left corner (a usual look of AI-generated lettering). The game covers it with a dark panel (`.unit-card-hud` in `src/ui/styles.css`) that lists the unit's real numbers (`cardLines` in `src/ui/labels.ts`), so the pictures themselves are unchanged.
- **Adding a unit:** make `public/art/<type>.webp` (the same recipe: scale to 560 px, WebP quality about 82) and the card appears; the test `tests/ui/unitCards.test.ts` checks that every unit type has one.
- **Map icons** are separate: the cards are too busy for a map square, so a later art pass would add small simplified icons.
## Map icons

`public/art/units/<unit>.webp` are the pictures drawn on the map when the squares are big enough (28 px and up, `ICON_MIN_TILE` in `src/ui/unitIcons.ts`); zoomed out, a unit is still its letter badge. They are made from the pictures in `Documents\Claude\art-originals\units` by `tools/make-unit-icons.ps1` (run it from the project folder): the plain background is removed by flood-filling inward from the picture's edges (so light patches inside the unit stay), the unit is trimmed and scaled to at most 320 px.

- **Adding a unit's picture:** drop it in `art-originals\units`, add it to the `$units` list in the script (and to `UNIT_ICONS` in `src/ui/unitIcons.ts`, with the way it faces), run the script. A picture that needs a stray line cleared at an edge can be listed in `$ignoreRight`.
- **Facing:** each picture records which way it faces (`faces`). A unit is drawn mirrored when its last move was the other way (`unitsHeadingLeft`, from the move events in the log, so after a reload everyone faces right until it moves; enemy units are not mirrored). In a fight the two units face each other. A picture with `faces: null` (the Army) never flips.
- **Drawing:** a thin frame and a faint tint in the owner's colour, with the picture inside (`unitMark` in `src/ui/render.ts`).
- **Ready but not in the game:** `bomber.webp` and `armor.webp` (for the Advanced rules). The Spy (a redo with a grey coat) is ready too. The first Cruiser, Battleship, Carrier and Submarine pictures were flat side views that shrank to thin slivers at map size, so they were redone (`-v2`: the script prefers a `-v2` file). The Cruiser and Battleship redos are in the game; the Carrier and Submarine redos are still to come and keep their letters until then. Each picture also has a `size` (how much of the square it may fill) so the bigger ships are drawn bigger.
- **The city:** `city.webp` (made from `City.jpg` by the same script) is drawn for every city when squares are 28 px or bigger: the skyline picture standing on a band in the owner's colour, a flag at the tip of its aerial and a faint colour wash behind (`drawCity` in `src/ui/render.ts`). Until the picture has loaded, and on smaller squares, a code-drawn skyline is used; a city nobody owns has a grey band and no flag.
