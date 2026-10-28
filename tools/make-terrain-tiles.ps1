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

# The shore: a strip of beach (public/art/terrain/shore.webp), cut from Shore-D. Rows 300..640 of the 1248 x 832
# picture, from the shallows through the foam line (row 180 of the strip) and the sand to the start of the vegetation. It is
# made seamless left to right (it repeats along a coast every 4 squares), its two long edges fade to transparent so it
# lays over the sea and the grass, its colour is calmed a little, and it is halved to 624 x 170 px.
$shoreRaw = Join-Path $tmp 'shore-raw.png'
$shoreSeam = Join-Path $tmp 'shore-seam.png'
ffmpeg -hide_banner -y -i (Join-Path $src 'Shore-D.webp') -vf 'scale=1248:832,crop=1248:340:0:300' $shoreRaw 2>&1 | Out-Null
$xmask = "color=c=black:s=1248x340,format=gray,geq=lum='255*pow(sin(PI*(X+0.5)/W),2)'"
ffmpeg -hide_banner -y -i $shoreRaw -f lavfi -i $xmask -filter_complex '[0:v]split=2[a][b];[a]crop=624:340:624:0[r];[b]crop=624:340:0:0[l];[r][l]hstack[shift];[0:v]format=gbrp[img];[shift]format=gbrp[sh];[1:v]format=gray[mask];[sh][img][mask]maskedmerge,format=rgb24' -frames:v 1 $shoreSeam 2>&1 | Out-Null
$shoreOut = Join-Path $out 'shore.webp'
$fade = "geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='255*pow(clip(Y/100,0,1),2)*(3-2*clip(Y/100,0,1))*pow(clip((339-Y)/140,0,1),2)*(3-2*clip((339-Y)/140,0,1))'"
ffmpeg -hide_banner -y -i $shoreSeam -vf "eq=saturation=0.75,format=rgba,$fade,scale=624:170:flags=lanczos" -c:v libwebp -quality 85 $shoreOut 2>&1 | Out-Null
'shore: {0:N0} KB' -f ((Get-Item $shoreOut).Length / 1KB)