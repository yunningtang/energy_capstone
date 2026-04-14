@echo off
REM Recreate venv with py -3 (fixes python313.dll / broken venv).
setlocal
cd /d "%~dp0.."

echo Recreating backend/venv...
if exist backend\venv (
    rmdir /s /q backend\venv
)

py -3 -m venv backend\venv
if %ERRORLEVEL% neq 0 (
    echo Failed. Try: python -m venv backend\venv
    exit /b 1
)

echo Installing dependencies...
backend\venv\Scripts\pip install -r backend\requirements.txt

echo Done. Activate with: backend\venv\Scripts\activate
exit /b 0
