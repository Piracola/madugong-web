Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "powershell.exe -ExecutionPolicy Bypass -NoProfile -File """ & WScript.ScriptFullName & "\..\start.ps1""", 1, False
