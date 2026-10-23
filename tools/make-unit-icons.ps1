# Makes the map icons: public/art/units/<unit>.webp from the pictures in Documents\Claude\art-originals\units.
# Each picture is one unit on a plain light background. The background is removed by flood-filling inward from the
# picture's edges (so light patches inside the unit stay), the result is trimmed to the unit and scaled to at most
# 320 px on its longest side. Run from the project folder:  powershell -File tools/make-unit-icons.ps1
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @"
using System;
using System.Collections.Generic;
public static class IconKey {
  // bgra: 32-bit pixels. Clears (alpha 0) every pixel reachable from the border whose colour is within `tol` of the
  // background colour (br, bg, bb), then softens the one-pixel fringe around the cleared area.
  public static void Run(byte[] px, int w, int h, int stride, int br, int bg, int bb, int tol) {
    bool[] gone = new bool[w * h];
    Func<int, int, bool> near = (x, y) => {
      int i = y * stride + x * 4;
      return Math.Abs(px[i + 2] - br) <= tol && Math.Abs(px[i + 1] - bg) <= tol && Math.Abs(px[i] - bb) <= tol;
    };
    var q = new Queue<int>();
    Action<int, int> push = (x, y) => {
      if (x < 0 || y < 0 || x >= w || y >= h) return;
      int k = y * w + x;
      if (gone[k] || !near(x, y)) return;
      gone[k] = true; q.Enqueue(k);
    };
    for (int x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
    for (int y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
    while (q.Count > 0) {
      int k = q.Dequeue(); int x = k % w, y = k / w;
      push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
    }
    // the fringe: kept pixels touching a cleared one and fairly light get half transparent (or cleared if very light)
    int wide = tol * 2 + 10;
    for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) {
      int k = y * w + x; int i = y * stride + x * 4;
      if (gone[k]) { px[i + 3] = 0; continue; }
      bool edge = (x > 0 && gone[k - 1]) || (x < w - 1 && gone[k + 1]) || (y > 0 && gone[k - w]) || (y < h - 1 && gone[k + w]);
      if (!edge) continue;
      int d = Math.Max(Math.Abs(px[i + 2] - br), Math.Max(Math.Abs(px[i + 1] - bg), Math.Abs(px[i] - bb)));
      if (d <= wide) px[i + 3] = (byte)(d <= tol + 6 ? 0 : 110);
    }
  }
}
"@
$src = Join-Path $env:USERPROFILE 'OneDrive\Documents\Claude\art-originals\units'
$out = Join-Path (Get-Location) 'public\art\units'
$tmp = Join-Path $env:TEMP 'unit-icons'
New-Item -ItemType Directory -Force $out, $tmp | Out-Null
# unit name = source file (without extension; a -v2 file wins when there is one)
$units = [ordered]@{ army = 'Army'; destroyer = 'destroyer'; fighter = 'fighter'; bomber = 'Bomber-v2'; transport = 'transport'; cruiser = 'Cruiser'; battleship = 'Battleship'; carrier = 'Carrier'; submarine = 'Submarine'; armor = 'Armor'; spy = 'Spy'; city = 'City' }
# pixels along the right edge to ignore (a stray line the picture generator left there)
$ignoreRight = @{ bomber = 40 }
foreach ($name in $units.Keys) {
  # a picture named <name>-v2 (a redo) is used in preference to the first one
  $file = Get-ChildItem $src -File | Where-Object { $_.BaseName -ieq ($units[$name] + '-v2') } | Select-Object -First 1
  if (-not $file) { $file = Get-ChildItem $src -File | Where-Object { $_.BaseName -ieq $units[$name] } | Select-Object -First 1 }
  if (-not $file) { Write-Warning "no picture for $name"; continue }
  $src32 = New-Object System.Drawing.Bitmap $file.FullName
  $w = $src32.Width; $h = $src32.Height
  $bmp = New-Object System.Drawing.Bitmap $w, $h, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp); $g.DrawImage($src32, 0, 0, $w, $h); $g.Dispose(); $src32.Dispose()
  $bgc = $bmp.GetPixel(3, 3)
  if ($ignoreRight.ContainsKey($name)) {
    $g2 = [System.Drawing.Graphics]::FromImage($bmp)
    $g2.FillRectangle((New-Object System.Drawing.SolidBrush $bgc), $w - $ignoreRight[$name], 0, $ignoreRight[$name], $h)
    $g2.Dispose()
  }
  $rect = New-Object System.Drawing.Rectangle 0, 0, $w, $h
  $data = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadWrite, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $bytes = New-Object byte[] ($data.Stride * $h)
  [System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $bytes, 0, $bytes.Length)
  [IconKey]::Run($bytes, $w, $h, $data.Stride, $bgc.R, $bgc.G, $bgc.B, 22)
  # where is the unit?
  $minX = $w; $minY = $h; $maxX = 0; $maxY = 0
  for ($y = 0; $y -lt $h; $y++) { $row = $y * $data.Stride; for ($x = 0; $x -lt $w; $x++) { if ($bytes[$row + $x * 4 + 3] -gt 100) { if ($x -lt $minX) { $minX = $x }; if ($x -gt $maxX) { $maxX = $x }; if ($y -lt $minY) { $minY = $y }; if ($y -gt $maxY) { $maxY = $y } } } }
  [System.Runtime.InteropServices.Marshal]::Copy($bytes, 0, $data.Scan0, $bytes.Length)
  $bmp.UnlockBits($data)
  $keyed = Join-Path $tmp "$name-keyed.png"
  $bmp.Save($keyed, [System.Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose()
  $pad = 3
  $cx = [Math]::Max(0, $minX - $pad); $cy = [Math]::Max(0, $minY - $pad)
  $cw = [Math]::Min($w - $cx, $maxX - $minX + 1 + 2 * $pad); $ch = [Math]::Min($h - $cy, $maxY - $minY + 1 + 2 * $pad)
  $dest = Join-Path $out "$name.webp"
  ffmpeg -hide_banner -loglevel error -y -i $keyed -vf "crop=${cw}:${ch}:${cx}:${cy},scale='if(gt(iw,ih),min(320,iw),-2)':'if(gt(iw,ih),-2,min(320,ih))':flags=lanczos" -c:v libwebp -quality 90 $dest
  $size = ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 $dest
  "{0}: background {1},{2},{3}; unit box {4}x{5}; icon {6}; {7} KB" -f $name, $bgc.R, $bgc.G, $bgc.B, $cw, $ch, $size, [int]((Get-Item $dest).Length / 1KB)
}