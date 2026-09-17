Add-Type -AssemblyName System.Drawing

$outDir = Join-Path $PSScriptRoot "..\electron"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
$out = Join-Path $outDir "icon.png"

$size = 256
$bmp = New-Object System.Drawing.Bitmap $size, $size
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.Clear([System.Drawing.Color]::FromArgb(255, 14, 15, 20))

$brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
  (New-Object System.Drawing.Point 40, 40),
  (New-Object System.Drawing.Point 220, 220),
  [System.Drawing.Color]::FromArgb(255, 108, 99, 255),
  [System.Drawing.Color]::FromArgb(255, 56, 189, 248)
)

$wing = New-Object System.Drawing.Drawing2D.GraphicsPath
$wing.AddPolygon(@(
  (New-Object System.Drawing.Point 210, 120),
  (New-Object System.Drawing.Point 188, 102),
  (New-Object System.Drawing.Point 140, 110),
  (New-Object System.Drawing.Point 70, 145),
  (New-Object System.Drawing.Point 40, 175),
  (New-Object System.Drawing.Point 82, 166),
  (New-Object System.Drawing.Point 132, 186),
  (New-Object System.Drawing.Point 180, 135)
))
$g.FillPath($brush, $wing)

$body = New-Object System.Drawing.Drawing2D.GraphicsPath
$body.AddPolygon(@(
  (New-Object System.Drawing.Point 140, 110),
  (New-Object System.Drawing.Point 92, 42),
  (New-Object System.Drawing.Point 160, 148)
))
$g.FillPath($brush, $body)

$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose()
$bmp.Dispose()
$brush.Dispose()
Write-Output $out
