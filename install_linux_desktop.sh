#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

APP_DIR="$(pwd)"
BIN_PATH="$APP_DIR/dist/InkBeatStudio"
ICON_SRC="$APP_DIR/app/public/icon.png"
ICON_DEST_DIR="$HOME/.local/share/icons/hicolor/512x512/apps"
DESKTOP_DIR="$HOME/.local/share/applications"

if [ ! -f "$BIN_PATH" ]; then
  echo "Не знайдено $BIN_PATH."
  echo "Спочатку зроби збірку: ./build_linux.sh"
  exit 1
fi

mkdir -p "$ICON_DEST_DIR" "$DESKTOP_DIR"
cp "$ICON_SRC" "$ICON_DEST_DIR/inkbeat-studio.png"

cat > "$DESKTOP_DIR/inkbeat-studio.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=InkBeat Studio
Comment=Локальна музична студія з підтримкою плагінів
Exec=$BIN_PATH
Icon=inkbeat-studio
Terminal=false
Categories=AudioVideo;Audio;Music;
StartupWMClass=InkBeat Studio
EOF

update-desktop-database "$DESKTOP_DIR" 2>/dev/null || true
gtk-update-icon-cache "$HOME/.local/share/icons/hicolor" 2>/dev/null || true

echo "Готово! InkBeat Studio додано в меню застосунків."
echo "Якщо іконка/пункт меню одразу не з'явились — вийди й зайди в сесію знову."
