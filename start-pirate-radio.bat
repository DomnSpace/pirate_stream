@echo off
echo.
echo ===============================================
echo   🚢 Pirate Radio Server Launcher 📻
echo ===============================================
echo.

REM Check if Docker is running
docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Docker is not running!
    echo Please start Docker Desktop and try again.
    pause
    exit /b 1
)

echo ✅ Docker is running
echo.

REM Navigate to the radio GUI directory
set "RADIO_GUI_PATH=C:\Users\Dominik\Downloads\PirateRadioServer_v2.0"

if exist "%RADIO_GUI_PATH%\radio_gui.py" (
    echo 🎵 Starting Pirate Radio GUI...
    echo.
    cd /d "%RADIO_GUI_PATH%"
    python radio_gui.py
) else (
    echo ❌ radio_gui.py not found at: %RADIO_GUI_PATH%
    echo.
    echo Please update the RADIO_GUI_PATH in this script.
    pause
    exit /b 1
)

echo.
echo 🏴‍☠️ Pirate Radio session ended
pause
