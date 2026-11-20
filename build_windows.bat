@echo off

cd /d "%~dp0"

if not exist ".venv" (
    python -m venv .venv
)
call .venv\Scripts\activate.bat

pip install --upgrade pip
pip install -r requirements.txt

pyinstaller ^
  --name "InkBeatStudio" ^
  --onefile ^
  --windowed ^
  --add-data "app;app" ^
  --icon "app\public\icon.png" ^
  app.py

echo.
echo Готово! Виконуваний файл: dist\InkBeatStudio.exe
