#!/usr/bin/env python3

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
    if hasattr(sys, "_MEIPASS"):
        base = sys._MEIPASS
    else:
        base = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(base, relative)


PREFERRED_PORT = 47821


def find_free_port() -> int:
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

    library_root = os.environ.get("INKBEAT_LIBRARY_DIR") or default_library_root()
    paths = LibraryPaths(library_root).ensure()
    seed_defaults(paths, resource_path(os.path.join("app", "library-defaults")))

    port = find_free_port()
    httpd = start_library_server(app_dir, paths, port)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()

    url = f"http://127.0.0.1:{port}/launcher.html"

    try:
        import webview
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

    webview.start(icon=icon_path if os.path.exists(icon_path) else None)


if __name__ == "__main__":
    main()
