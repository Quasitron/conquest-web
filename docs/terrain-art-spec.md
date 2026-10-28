# Terrain tile art: what to generate

Five pictures make the whole map: **Water, Clear, Rough, Forest, Mountain**. Everything else is drawn by the game:
rivers (cut from the Water picture), coastlines, the soft blends where two kinds of ground meet, and cities (they keep
their buildings, standing on Clear).

## How the game will use them

Each picture is a big, continuous patch of ground, not a single map square. The game cuts a piece out for every square
from the same spot of the same picture, so two Forest squares side by side show one unbroken forest, and the picture
repeats only every ~16 squares. Where two kinds meet (forest next to grass, land next to sea) the game fades one into
the other over the edge of the square. That is why the pictures must look alike in **scale, light and colour mood**.

## What every picture must be

- **Straight down, like an aerial or satellite photo.** No perspective, no horizon, no sky, no tilt.
- **Square, 1024 x 1024 px** (512 is the minimum). PNG or high-quality JPG/WebP.
- **Fills the whole picture edge to edge.** No border, frame, vignette, rounded corners, watermark, text, labels or
  grid lines.
- **Even light from the top-left**, soft shadows only (trees, rocks and ridges may shade towards the bottom-right). No
  dark corners, no bright spot in the middle.
- **No single standout object** (one house, one boat, one road, one lake, one big tree). Anything unique repeats and
  gives the pattern away. No roads, paths, fields in rows, buildings or people.
- **The same level of zoom in all five.** Think of one map square as roughly 10 miles across: you see the *character*
  of the ground (canopy, scrub, ridges), not individual blades or boulders.
- **Seamless if possible.** Ask for "seamless tileable texture". If the picture is not perfectly seamless, do not worry:
  I fix the edges (offset and cross-fade) when I process them.
- Keep them **distinct at tiny size**: when the map is zoomed out a square is only about 10 px. Water, Clear, Forest,
  Rough and Mountain must still be told apart by overall colour and darkness.

## The five pictures

| File name | Look | Colour mood (a guide, not exact) |
| --- | --- | --- |
| `Water` | Open ocean seen from above: gentle wave texture, a few lighter ripples, no foam streaks, no ships, no land. | Deep blue, near `#24527a`, with lighter blue ripples. Calm, not stormy. |
| `Clear` | Open grassland and farmland meadow: soft patches of slightly different green, tiny hedgerow-free texture. | Medium green, near `#5f8f4a`. The brightest, most neutral land. |
| `Rough` | Dry scrubland and stony hills: tan and brown earth, sparse low bushes, scattered rocks, a few dry gullies. | Warm tan-brown, between grass and rock. Clearly browner than Clear. |
| `Forest` | Dense forest canopy from above: a lumpy carpet of treetops, shaded between crowns. | Dark rich green, clearly darker than Clear, with a bumpy texture. |
| `Mountain` | Rugged mountains seen from above with strong relief shading: ridges, peaks and valleys in grey rock, light from the top-left, a little snow on the highest ridges is fine. | Grey to grey-brown, lighter on the sunny side, darkest in the valleys. Must read as "high ground" even at 10 px. |

Optional, later: `Shore` (a strip of pale sand and shallow turquoise water that runs along a coast). Skip it for now:
the game blends land into water on its own.

## A prompt to start from

Replace `<WHAT>` with the line from the table (one picture per request):

> Seamless tileable top-down aerial texture, straight-down satellite view, no perspective, no horizon, no border, no
> text, no vignette, even soft light from the top-left, painterly photo-real style, <WHAT>. Fills the whole square
> edge to edge. No roads, buildings, vehicles, boats or any single standout object. 1024 x 1024.

Generate all five in the same session, in the same style, so the lighting and detail level match. If one comes out much
more detailed, brighter or more cartoonish than the rest, regenerate it with a note such as "match the zoom level and
softness of the others".

## Where to put them

`Documents\Claude\art-originals\terrain\` named exactly `Water`, `Clear`, `Rough`, `Forest`, `Mountain` (any image
format). Do not crop or recolour them.

## What happens next (my side)

1. I make each picture seamless, set them to one brightness and scale, and shrink them for the web (a few hundred KB
   in total).
2. **I mock them up on a sample map before anything goes into the game**: every pair of neighbours (forest and grass,
   mountain and rough, land and sea, a river through the lot), at small, medium and large zoom, in sunshine and under
   fog. You see it first, and if a pair does not blend I tell you which picture to regenerate and why.
3. Then they go into the game, replacing the flat green and blue squares. Rivers are drawn in code from the Water
   picture, so there is nothing extra to make for them.
