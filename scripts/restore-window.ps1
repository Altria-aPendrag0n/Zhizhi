Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public struct RECT2 { public int Left, Top, Right, Bottom; }
public class Win32R {
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
    [DllImport("user32.dll")]
    public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
    [DllImport("user32.dll")]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")]
    public static extern bool MoveWindow(IntPtr hWnd, int X, int Y, int nWidth, int nHeight, bool bRepaint);
    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")]
    public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
}
"@

$script:targetHwnd = [IntPtr]::Zero
$targetPid = (Get-Process -Name "study-thread" -ErrorAction SilentlyContinue | Select-Object -First 1).Id

$callback = {
    param($hwnd, $lParam)
    $pid2 = 0
    [Win32R]::GetWindowThreadProcessId($hwnd, [ref]$pid2) | Out-Null
    if ($pid2 -eq $script:targetPid) {
        $sb = New-Object System.Text.StringBuilder 256
        [Win32R]::GetWindowText($hwnd, $sb, 256) | Out-Null
        $t = $sb.ToString()
        # match title 0x77E5 0x679D (avoid script encoding issue)
        if ($t.Length -eq 2 -and [int][char]$t[0] -eq 0x77E5 -and [int][char]$t[1] -eq 0x679D) {
            $script:targetHwnd = $hwnd
        }
    }
    return $true
}
[Win32R]::EnumWindows($callback, [IntPtr]::Zero) | Out-Null

if ($script:targetHwnd -eq [IntPtr]::Zero) {
    Write-Output "ZHIZHI_WINDOW_NOT_FOUND"
    exit 1
}

# SW_RESTORE = 9
[Win32R]::ShowWindow($script:targetHwnd, 9) | Out-Null
Start-Sleep -Milliseconds 500

# center on screen (1080p target), window ~1456x939
$sw = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Width
$sh = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Height
$w = [Math]::Min(1456, $sw - 80)
$h = [Math]::Min(939, $sh - 120)
$x = [Math]::Max(0, [int](($sw - $w) / 2))
$y = [Math]::Max(0, [int](($sh - $h) / 2))
[Win32R]::MoveWindow($script:targetHwnd, $x, $y, $w, $h, $true) | Out-Null
Start-Sleep -Milliseconds 300
[Win32R]::SetForegroundWindow($script:targetHwnd) | Out-Null
Start-Sleep -Milliseconds 800

Write-Output "RESTORED_HWND=$($script:targetHwnd) POS=${x},${y} SIZE=${w}x${h}"
