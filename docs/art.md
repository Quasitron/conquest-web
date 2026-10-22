# Artwork

## Unit cards

`public/art/<unit>.webp` are the artwork cards shown on the production screen (beside the list of units) and on the production report. They are 560 px versions of the originals, which are kept outside the project in `Documents\Claude\art-originals` (1024 px, one per unit, including Armor, Bomber and Spy for the Advanced rules).

- **Made with:** Gemini (AI image generation), by the game's owner, in the style of the intro page.
- **The made-up lettering:** every card has nonsense text baked into its top-left corner (a usual look of AI-generated lettering). The game covers it with a dark panel (`.unit-card-hud` in `src/ui/styles.css`) that lists the unit's real numbers (`cardLines` in `src/ui/labels.ts`), so the pictures themselves are unchanged.
- **Adding a unit:** make `public/art/<type>.webp` (the same recipe: scale to 560 px, WebP quality about 82) and the card appears; the test `tests/ui/unitCards.test.ts` checks that every unit type has one.
- **Map icons** are separate: the cards are too busy for a map square, so a later art pass would add small simplified icons.