#!/usr/bin/env python3
"""
InkBeat Studio — Desktop
=========================
Локальний десктоп-застосунок, що загортає веб-версію InkBeat Studio
(HTML/CSS/JS) у нативне вікно за допомогою pywebview.

Чому локальний HTTP-сервер, а не file://:
  - getUserMedia (запис з мікрофона), AudioWorklet тощо вимагають
    "secure context". file:// такою не вважається у більшості
    браузерних рушіїв, а http://127.0.0.1 — вважається.
  - IndexedDB / localStorage надійніше працюють через http.

Запуск (розробка):
    python app.py

Збірка в один виконуваний файл — дивись build_linux.sh / build_windows.bat
"""

import os
import sys
import socket
import threading
import webbrowser

from library_backend import (
    LibraryPaths,
    default_library_root,
    seed_defaults,
    start_library_server,
)

APP_TITLE = "InkBeat Studio"
WINDOW_WIDTH = 1440
WINDOW_HEIGHT = 900


def resource_path(relative: str) -> str:
    """Повертає абсолютний шлях до ресурсу, коректно як при запуску
    з вихідного коду, так і з зібраного PyInstaller-бандла."""
    if hasattr(sys, "_MEIPASS"):
        base = sys._MEIPASS  # type: ignore[attr-defined]
    else:
        base = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(base, relative)


PREFERRED_PORT = 47821  # фіксований порт важливий: студія зберігає проєкти
# в IndexedDB/localStorage браузера, які прив'язані до origin (host:port).
# Якщо порт щоразу випадковий — при кожному запуску застосунку буде "нове"
# сховище і збережені проєкти/пресети "зникатимуть".


def find_free_port() -> int:
    """Пробує зафіксований порт; якщо зайнятий (наприклад, попередній
    процес ще не звільнив його) — шукає вільний."""
    for port in (PREFERRED_PORT,):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                s.bind(("127.0.0.1", port))
                return port
            except OSError:
                continue
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def main() -> None:
    app_dir = resource_path("app")
    if not os.path.isdir(app_dir):
        print(f"Не знайдено директорію застосунку: {app_dir}")
        sys.exit(1)

    # Тека бібліотеки користувача — живе поза зібраним застосунком,
    # у домашній директорії, тож не втрачається при оновленнях застосунку.
    library_root = os.environ.get("INKBEAT_LIBRARY_DIR") or default_library_root()
    paths = LibraryPaths(library_root).ensure()
    seed_defaults(paths, resource_path(os.path.join("app", "library-defaults")))

    port = find_free_port()
    httpd = start_library_server(app_dir, paths, port)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()

    url = f"http://127.0.0.1:{port}/launcher.html"

    try:
        import webview  # pywebview
    except ImportError:
        print(
            "Пакет 'pywebview' не встановлено.\n"
            "Встанови залежності: pip install -r requirements.txt\n"
            "Відкриваю у звичайному браузері замість цього..."
        )
        webbrowser.open(url)
        input("Натисни Enter, щоб завершити (сервер зупиниться)...")
        return

    icon_path = resource_path(os.path.join("app", "public", "icon.png"))

    window = webview.create_window(
        APP_TITLE,
        url,
        width=WINDOW_WIDTH,
        height=WINDOW_HEIGHT,
        min_size=(1024, 640),
        text_select=True,
        confirm_close=False,
    )

    # На Linux pywebview автоматично обирає GTK/QT backend.
    # На Windows — Edge WebView2 (потрібен встановлений WebView2 Runtime,
    # він майже завжди вже є в Windows 10/11).
    webview.start(icon=icon_path if os.path.exists(icon_path) else None)


if __name__ == "__main__":
    main()
