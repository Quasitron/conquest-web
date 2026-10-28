# Makes the terrain pictures: public/art/terrain/<ground>.webp from the chosen pictures in
# Documents\Claude\art-originals\terrain (see docs/terrain-art-spec.md and docs/art.md). For each picture:
#   1. the lighting is levelled (a heavy blur of the picture is subtracted and the average colour added back),
#   2. it is made seamless (blended with itself shifted by half a picture, feathered at the edges),
#   3. the colour is moved to the target average below (the originals are darker than the game's flat colours),
#   4. it is scaled to 936 x 624 px and saved as WebP.
# The game cuts one 78 px square out of the picture for each map square, from the picture's own position of that square,
# so the picture repeats every 12 x 8 squares (see src/ui/terrainTiles.ts). Needs ffmpeg on the PATH.
# Run from the project folder:  powershell -File tools/make-terrain-tiles.ps1
Add-Type -AssemblyName System.Drawing
$src = Join-Path $env:USERPROFILE 'OneDrive\Documents\Claude\art-originals\terrain'
$out = Join-Path (Split-Path $PSScriptRoot -Parent) 'public\art\terrain'
$tmp = Join-Path ([IO.Path]::GetTempPath()) 'terrain-tiles'
New-Item -ItemType Directory -Force $out, $tmp | Out-Null

# name, source file, blur sigma for levelling (mountains keep more of their large shading), target average RGB.
$grounds = @(
  @{ name = 'water';    file = 'WATER-A.webp';    sigma = 110; target = @(12, 72, 112) },
  @{ name = 'clear';    file = 'Clear-C.webp';    sigma = 110; target = @(95, 143, 74) },
  @{ name = 'rough';    file = 'Rough-C.webp';    sigma = 110; target = @(140, 118, 80) },
  @{ name = 'forest';   file = 'Forest-C.webp';   sigma = 110; target = @(38, 78, 46) },
  @{ name = 'mountain'; file = 'Mountain-C.webp'; sigma = 300; target = @(122, 124, 130) }
)

function MeanColor($png) {
  $one = Join-Path $tmp 'mean.png'
  ffmpeg -hide_banner -y -i $png -vf 'scale=1:1:flags=area' $one 2>&1 | Out-Null
  $bm = New-Object System.Drawing.Bitmap $one
  $px = $bm.GetPixel(0, 0)
  $bm.Dispose()
  return @([int]$px.R, [int]$px.G, [int]$px.B)
}

foreach ($g in $grounds) {
  $n = $g.name
  $raw = Join-Path $tmp "$n-raw.png"
  $flat = Join-Path $tmp "$n-flat.png"
  $seam = Join-Path $tmp "$n-seam.png"
  ffmpeg -hide_banner -y -i (Join-Path $src $g.file) -vf 'scale=1248:832' $raw 2>&1 | Out-Null
  $m = MeanColor $raw
  $s = $g.sigma
  ffmpeg -hide_banner -y -i $raw -filter_complex "[0:v]format=gbrp,split[a][b];[b]gblur=sigma=${s}:steps=3[bl];[a][bl]blend=c0_expr='clip(A-B+$($m[1]),0,255)':c1_expr='clip(A-B+$($m[2]),0,255)':c2_expr='clip(A-B+$($m[0]),0,255)',format=rgb24" -frames:v 1 $flat 2>&1 | Out-Null
  $mask = "color=c=black:s=1248x832,format=gray,geq=lum='255*pow(sin(PI*(X+0.5)/W),2)*pow(sin(PI*(Y+0.5)/H),2)'"
  ffmpeg -hide_banner -y -i $flat -f lavfi -i $mask -filter_complex '[0:v]split=4[a][b][c][d];[a]crop=624:416:624:416[q1];[b]crop=624:416:0:416[q2];[c]crop=624:416:624:0[q3];[d]crop=624:416:0:0[q4];[q1][q2]hstack[r1];[q3][q4]hstack[r2];[r1][r2]vstack[shift];[0:v]format=gbrp[img];[shift]format=gbrp[sh];[1:v]format=gray[mask];[sh][img][mask]maskedmerge,format=rgb24' -frames:v 1 $seam 2>&1 | Out-Null
  $k = @(); for ($i = 0; $i -lt 3; $i++) { $k += [math]::Round($g.target[$i] / [math]::Max(1, $m[$i]), 3) }
  # colorchannelmixer takes factors of at most 2, so a bigger lift is made in two steps.
  $k1 = @($k | ForEach-Object { [math]::Min($_, 2) }); $k2 = @(0..2 | ForEach-Object { [math]::Round($k[$_] / $k1[$_], 3) })
  $final = Join-Path $out "$n.webp"
  ffmpeg -hide_banner -y -i $seam -vf "colorchannelmixer=rr=$($k1[0]):gg=$($k1[1]):bb=$($k1[2]),colorchannelmixer=rr=$($k2[0]):gg=$($k2[1]):bb=$($k2[2]),scale=936:624:flags=lanczos" -c:v libwebp -quality 82 $final 2>&1 | Out-Null
  '{0}: average {1} -> {2}, {3:N0} KB' -f $n, ($m -join ','), ($g.target -join ','), ((Get-Item $final).Length / 1KB)
}
