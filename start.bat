@echo off
chcp 65001 >nul 2>&1
setlocal

set "DIR=%~dp0"
set "BD=%DIR%backend"
set "FD=%DIR%frontend"

for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8000" ^| findstr "LISTENING"') do taskkill /PID %%a /F >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5173" ^| findstr "LISTENING"') do taskkill /PID %%a /F >nul 2>&1

if not exist "%BD%\.env" (
  if exist "%DIR%.env" (
    copy "%DIR%.env" "%BD%\.env" >nul
  ) else (
    if exist "%DIR%.env.example" (
      copy "%DIR%.env.example" "%BD%\.env" >nul
      echo [!] Created backend\.env - fill in API keys and restart
      pause
      exit /b 1
    )
  )
)

if not exist "%BD%\venv" (
  echo [*] Creating Python venv...
  python -m venv "%BD%\venv"
)

echo [*] Installing backend deps...
call "%BD%\venv\Scripts\activate.bat"
pip install -q -r "%BD%\requirements.txt"

if not exist "%FD%\node_modules" (
  echo [*] Installing frontend deps...
  cd /d "%FD%"
  call npm install -q
)

echo.
echo [*] Starting backend (localhost:8000) ...
cd /d "%BD%"
start /b "" "%BD%\venv\Scripts\python.exe" -m uvicorn main:app --host 127.0.0.1 --port 8000

timeout /t 3 /nobreak >nul

echo [*] Starting frontend (localhost:5173) ...
cd /d "%FD%"
start /b "" cmd /c "npm run dev"

echo.
echo ============================================
echo   Frontend: http://localhost:5173
echo   Backend:  http://localhost:8000
echo   Close this window to stop all services
echo ============================================
echo.

start http://localhost:5173

pause >nul
