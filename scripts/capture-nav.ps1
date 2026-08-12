Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

Add-Type @"
using System;
using System.Runtime.InteropServices;
public struct RECT { public int Left, Top, Right, Bottom; }
public class Win32K {
    [DllImport("user32.dll")]
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")]
    public static extern bool keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
    [DllImport("user32.dll")]
    public static extern short VkKeyScan(char ch);
}
"@

$proc = Get-Process -Name "study-thread" -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if (-not $proc) { Write-Output "NO_WINDOW_FOUND"; exit 1 }

$hwnd = $proc.MainWindowHandle
[Win32K]::SetForegroundWindow([IntPtr]$hwnd) | Out-Null
Start-Sleep -Milliseconds 500

# args[0] = output name, args[1] = hotkey spec ("ctrl+n", "ctrl+," ...), args[2] = wait ms
$name = $args[0]
$hotkey = $args[1]
$wait = [int]$args[2]

function Send-Hotkey([string]$spec) {
    $parts = $spec.Split('+')
    $keyChar = $parts[-1]
    $modifiers = $parts[0..($parts.Count - 2)]
    $vk = 0
    if ($keyChar -match '^[a-zA-Z0-9]$') {
        $vk = [int][char]($keyChar.ToUpper())
    } elseif ($keyChar -eq ',') {
        $vk = 0xBC
    } else {
        $vk = [Win32K]::VkKeyScan([char]$keyChar) -band 0xFF
    }
    foreach ($m in $modifiers) {
        switch ($m.ToLower()) {
            'ctrl' { [Win32K]::keybd_event(0x11, 0, 0, [UIntPtr]::Zero) | Out-Null }
            'alt'  { [Win32K]::keybd_event(0x12, 0, 0, [UIntPtr]::Zero) | Out-Null }
            'shift' { [Win32K]::keybd_event(0x10, 0, 0, [UIntPtr]::Zero) | Out-Null }
        }
    }
    [Win32K]::keybd_event([byte]$vk, 0, 0, [UIntPtr]::Zero) | Out-Null
    [Win32K]::keybd_event([byte]$vk, 0, 2, [UIntPtr]::Zero) | Out-Null
    foreach ($m in $modifiers) {
        switch ($m.ToLower()) {
            'ctrl' { [Win32K]::keybd_event(0x11, 0, 2, [UIntPtr]::Zero) | Out-Null }
            'alt'  { [Win32K]::keybd_event(0x12, 0, 2, [UIntPtr]::Zero) | Out-Null }
            'shift' { [Win32K]::keybd_event(0x10, 0, 2, [UIntPtr]::Zero) | Out-Null }
        }
    }
}

if ($hotkey) {
    Send-Hotkey $hotkey
    Start-Sleep -Milliseconds $wait
}

$rect = New-Object RECT
[Win32K]::GetWindowRect([IntPtr]$hwnd, [ref]$rect) | Out-Null
$width = $rect.Right - $rect.Left
$height = $rect.Bottom - $rect.Top

[Win32K]::SetForegroundWindow([IntPtr]$hwnd) | Out-Null
Start-Sleep -Milliseconds 600

$bmp = New-Object System.Drawing.Bitmap($width, $height)
$gfx = [System.Drawing.Graphics]::FromImage($bmp)
$gfx.CopyFromScreen($rect.Left, $rect.Top, 0, 0, (New-Object System.Drawing.Size($width, $height)))
$out = Join-Path (Get-Location) "docs\screenshots\$name.png"
$dir = Split-Path $out -Parent
if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$gfx.Dispose()
$bmp.Dispose()
Write-Output "SAVED=$out"
