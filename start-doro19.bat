@echo off
setlocal

cd /d "%~dp0"

where npm >nul 2>&1
if errorlevel 1 (
  echo [ERROR] npm was not found in PATH.
  pause
  exit /b 1
)

echo [1/3] Building the site...
call npm run build
if errorlevel 1 (
  echo [ERROR] Build failed; the existing site was left running.
  pause
  exit /b 1
)

echo [2/3] Stopping old Doro19 server on port 5173...
powershell.exe -NoProfile -Command "$projectRoot = [IO.Path]::GetFullPath('%~dp0'); $connections = Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue; foreach ($connection in $connections) { $process = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + $connection.OwningProcess); if ($process -and $process.Name -eq 'node.exe' -and $process.CommandLine -match 'vite' -and $process.CommandLine -like ('*' + $projectRoot + '*')) { Stop-Process -Id $connection.OwningProcess -ErrorAction Stop; Write-Output ('Stopped PID ' + $connection.OwningProcess + ' on port 5173') } }"

echo [2/3] Starting the stable preview on port 5173...
start "Doro19 Preview (5173)" /D "%~dp0" cmd /k "npm run preview:public"

echo Waiting for the frontend to start...
timeout /t 3 /nobreak >nul

echo [3/3] Checking the Cloudflare Tunnel service...
sc.exe query Cloudflared >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Windows service 'Cloudflared' was not found.
  echo Install the tunnel connector from the Cloudflare dashboard first.
  pause
  exit /b 1
)

sc.exe query Cloudflared | findstr /I "RUNNING" >nul
if errorlevel 1 (
  echo Starting Cloudflared...
  sc.exe start Cloudflared
  if errorlevel 1 (
    echo [WARN] Cloudflared could not be started. Try running this file as administrator.
  )
) else (
  echo Cloudflared is already running.
)

echo.
echo Frontend: http://127.0.0.1:5173/
echo Public:   https://doro19.minamo.life/
echo Keep the preview window open while using the public site.
pause
