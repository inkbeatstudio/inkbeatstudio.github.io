#!/usr/bin/env bash
set -e

cd "$(dirname "$0")"

if [ ! -d ".venv" ]; then
  python3 -m venv --system-site-packages .venv
fi
source .venv/bin/activate

pip install --upgrade pip
pip install -r requirements.txt

pyinstaller \
  --name "InkBeatStudio" \
  --onefile \
  --windowed \
  --add-data "app:app" \
  --icon "app/public/icon.png" \
  app.py

echo ""
echo "Готово! Виконуваний файл: dist/InkBeatStudio"
echo "Запуск: ./dist/InkBeatStudio"
