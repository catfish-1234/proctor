# Generates assets/social-preview.png, the 1280x640 card GitHub shows when a repo link is shared.
#
# Drawn with System.Drawing rather than a renderer dependency: this runs once per brand change, and
# adding an image toolchain to a zero-runtime-dependency project to draw one rectangle is a poor
# trade. Colours come from src/brand.ts; keep them in step by hand if that file changes.
Add-Type -AssemblyName System.Drawing

$W = 1280; $H = 640
$ink        = [System.Drawing.ColorTranslator]::FromHtml('#0B0F13')
$eyeOuter   = [System.Drawing.ColorTranslator]::FromHtml('#171C22')
$eyeInner   = [System.Drawing.ColorTranslator]::FromHtml('#242C35')
$green      = [System.Drawing.ColorTranslator]::FromHtml('#22C55E')
$paper      = [System.Drawing.ColorTranslator]::FromHtml('#F7F6F2')
$catchlight = [System.Drawing.ColorTranslator]::FromHtml('#EAFBF0')
$muted      = [System.Drawing.Color]::FromArgb(255, 148, 163, 178)

$bmp = New-Object System.Drawing.Bitmap($W, $H)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$g.Clear($ink)

# A faint green rule down the left edge, so the card reads as proctor's even as a thumbnail.
$g.FillRectangle((New-Object System.Drawing.SolidBrush($green)), 0, 0, 10, $H)

# --- the logo: an eye almond, a green iris, a checkmark pupil ---
$cx = 214; $cy = 292; $halfW = 138; $halfH = 82

function New-Almond([single]$cx, [single]$cy, [single]$halfW, [single]$halfH) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $p.AddBezier(($cx - $halfW), $cy, ($cx - $halfW * 0.45), ($cy - $halfH * 1.9), ($cx + $halfW * 0.45), ($cy - $halfH * 1.9), ($cx + $halfW), $cy)
  $p.AddBezier(($cx + $halfW), $cy, ($cx + $halfW * 0.45), ($cy + $halfH * 1.9), ($cx - $halfW * 0.45), ($cy + $halfH * 1.9), ($cx - $halfW), $cy)
  $p.CloseFigure()
  return $p
}

$outer = New-Almond $cx $cy $halfW $halfH
$g.FillPath((New-Object System.Drawing.SolidBrush($eyeOuter)), $outer)
$g.DrawPath((New-Object System.Drawing.Pen($eyeInner, 3)), $outer)
$inner = New-Almond $cx $cy ($halfW * 0.88) ($halfH * 0.78)
$g.FillPath((New-Object System.Drawing.SolidBrush($eyeInner)), $inner)

$r = 52
$g.FillEllipse((New-Object System.Drawing.SolidBrush($green)), ($cx - $r), ($cy - $r), ($r * 2), ($r * 2))
$g.DrawEllipse((New-Object System.Drawing.Pen($eyeOuter, 6)), ($cx - $r), ($cy - $r), ($r * 2), ($r * 2))

$tick = New-Object System.Drawing.Pen($ink, 14)
$tick.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$tick.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$tick.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
$g.DrawLines($tick, @(
  (New-Object System.Drawing.PointF(($cx - 25), ($cy + 2))),
  (New-Object System.Drawing.PointF(($cx - 7), ($cy + 21))),
  (New-Object System.Drawing.PointF(($cx + 29), ($cy - 22)))
))
$g.FillEllipse((New-Object System.Drawing.SolidBrush($catchlight)), ($cx + 18), ($cy - 24), 14, 14)

# --- wordmark and tagline ---
$nameFont = New-Object System.Drawing.Font('Segoe UI', 108, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$g.DrawString('proctor', $nameFont, (New-Object System.Drawing.SolidBrush($paper)), 384, 196)

$tagFont = New-Object System.Drawing.Font('Segoe UI', 38, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$g.DrawString('Catch AI agents gaming their own tests', $tagFont, (New-Object System.Drawing.SolidBrush($paper)), 390, 334)

$subFont = New-Object System.Drawing.Font('Segoe UI', 30, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$g.DrawString('Deleted tests, skipped tests, weakened assertions,', $subFont, (New-Object System.Drawing.SolidBrush($muted)), 390, 400)
$g.DrawString('hardcoded answers. Offline, deterministic, no API key.', $subFont, (New-Object System.Drawing.SolidBrush($muted)), 390, 442)

$footFont = New-Object System.Drawing.Font('Consolas', 28, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$g.DrawString('npx proctor setup', $footFont, (New-Object System.Drawing.SolidBrush($green)), 390, 512)

$out = Join-Path $PSScriptRoot '..\assets\social-preview.png'
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
Write-Output "wrote $out"
