Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

Add-Type @"
using System;
using System.Runtime.InteropServices;
public struct RECT { public int Left, Top, Right, Bottom; }
public class Win32 {
    [DllImport("user32.dll")]
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);
}
"@

$proc = Get-Process -Name "study-thread" -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if (-not $proc) {
    Write-Output "NO_WINDOW_FOUND"
    exit 1
}

$hwnd = $proc.MainWindowHandle
Write-Output "WINDOW_TITLE=$($proc.MainWindowTitle)"
Write-Output "HWND=$hwnd"

$rect = New-Object RECT
[Win32]::GetWindowRect([IntPtr]$hwnd, [ref]$rect) | Out-Null
$width = $rect.Right - $rect.Left
$height = $rect.Bottom - $rect.Top
Write-Output "RECT=$($rect.Left),$($rect.Top),$($rect.Right),$($rect.Bottom) SIZE=${width}x${height}"

[Win32]::SetForegroundWindow([IntPtr]$hwnd) | Out-Null
Start-Sleep -Milliseconds 800

$bmp = New-Object System.Drawing.Bitmap($width, $height)
$gfx = [System.Drawing.Graphics]::FromImage($bmp)
$gfx.CopyFromScreen($rect.Left, $rect.Top, 0, 0, (New-Object System.Drawing.Size($width, $height)))
$out = Join-Path (Get-Location) "docs\screenshots\$($args[0]).png"
$dir = Split-Path $out -Parent
if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$gfx.Dispose()
$bmp.Dispose()
Write-Output "SAVED=$out"
