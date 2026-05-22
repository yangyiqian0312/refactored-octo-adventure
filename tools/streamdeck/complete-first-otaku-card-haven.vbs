Set shell = CreateObject("WScript.Shell")
shell.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ""Invoke-RestMethod -Method Post -Uri 'https://tiktok-shop-live-alert-server.onrender.com/api/queue/shift' -Headers @{Authorization='Bearer otaku-overlay-token'} | Out-Null""", 0, False
