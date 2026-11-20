
from __future__ import annotations

import io
import json
import os
import re
import shutil
import zipfile
from dataclasses import dataclass
from functools import partial
from http import HTTPStatus
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, parse_qs, unquote

AUDIO_EXT = {".wav", ".mp3", ".ogg", ".m4a", ".flac", ".aac", ".webm"}
SAFE_NAME_RE = re.compile(r"^[A-Za-z0-9 _.\-\u0400-\u04FF()]+$")


def _safe_name(name: str) -> str:
    name = unquote(name or "").strip()
    name = os.path.basename(name)
    if not name or name in (".", "..") or not SAFE_NAME_RE.match(name):
        raise ValueError(f"Недопустиме ім'я файлу: {name!r}")
    return name


def _safe_rel_path(rel: str) -> str:
    rel = unquote(rel or "").strip().replace("\\", "/")
    rel = rel.lstrip("/")
    parts = [p for p in rel.split("/") if p]
    if not parts or any(p in (".", "..") for p in parts):
        raise ValueError(f"Недопустимий шлях: {rel!r}")
    for p in parts:
        if not SAFE_NAME_RE.match(p):
            raise ValueError(f"Недопустимий шлях: {rel!r}")
    return "/".join(parts)


@dataclass
class LibraryPaths:
    root: str

    @property
    def samples(self) -> str:
        return os.path.join(self.root, "Samples")

    @property
    def instruments(self) -> str:
        return os.path.join(self.root, "Instruments")

    @property
    def effects(self) -> str:
        return os.path.join(self.root, "Effects")

    @property
    def projects(self) -> str:
        return os.path.join(self.root, "Projects")

    def ensure(self) -> "LibraryPaths":
        for p in (self.samples, self.instruments, self.effects, self.projects):
            os.makedirs(p, exist_ok=True)
        return self


def default_library_root() -> str:
    home = os.path.expanduser("~")
    return os.path.join(home, "InkBeatStudio", "Library")


def seed_defaults(paths: LibraryPaths, defaults_dir: str) -> None:
    if not os.path.isdir(defaults_dir):
        return
    for kind, dest_root in (("Instruments", paths.instruments), ("Effects", paths.effects)):
        src_root = os.path.join(defaults_dir, kind)
        if not os.path.isdir(src_root):
            continue
        for entry in os.listdir(src_root):
            src = os.path.join(src_root, entry)
            dst = os.path.join(dest_root, entry)
            if os.path.isdir(src) and not os.path.exists(dst):
                shutil.copytree(src, dst)

    samples_src_root = os.path.join(defaults_dir, "Samples")
    if os.path.isdir(samples_src_root):
        for dirpath, _dirnames, filenames in os.walk(samples_src_root):
            rel_dir = os.path.relpath(dirpath, samples_src_root)
            for name in filenames:
                src = os.path.join(dirpath, name)
                dst_dir = paths.samples if rel_dir == "." else os.path.join(paths.samples, rel_dir)
                dst = os.path.join(dst_dir, name)
                if not os.path.exists(dst):
                    os.makedirs(dst_dir, exist_ok=True)
                    shutil.copy2(src, dst)


def _plugin_manifest(folder: str):
    manifest_path = os.path.join(folder, "plugin.json")
    if not os.path.isfile(manifest_path):
        return None
    try:
        with open(manifest_path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception:
        return None
    data.setdefault("id", os.path.basename(folder))
    return data


def list_library(paths: LibraryPaths) -> dict:
    samples = []
    if os.path.isdir(paths.samples):
        for dirpath, dirnames, filenames in os.walk(paths.samples):
            dirnames.sort()
            rel_dir = os.path.relpath(dirpath, paths.samples)
            folder = "" if rel_dir == "." else rel_dir.replace(os.sep, "/")
            for name in sorted(filenames):
                if os.path.splitext(name)[1].lower() not in AUDIO_EXT:
                    continue
                full = os.path.join(dirpath, name)
                rel_path = (folder + "/" + name) if folder else name
                samples.append({
                    "name": name,
                    "folder": folder,
                    "relPath": rel_path,
                    "url": "/library/Samples/" + rel_path,
                    "size": os.path.getsize(full),
                })
        samples.sort(key=lambda s: (s["folder"], s["name"]))

    def _plugins(root):
        out = []
        if not os.path.isdir(root):
            return out
        for entry in sorted(os.listdir(root)):
            folder = os.path.join(root, entry)
            if not os.path.isdir(folder):
                continue
            manifest = _plugin_manifest(folder)
            if not manifest:
                continue
            out.append({
                **manifest,
                "folder": entry,
                "mainUrl": f"/library/{os.path.basename(root)}/{entry}/main.js",
            })
        return out

    projects = []
    if os.path.isdir(paths.projects):
        for name in sorted(os.listdir(paths.projects)):
            if name.endswith(".inkbeat.json"):
                projects.append({
                    "name": name[: -len(".inkbeat.json")],
                    "file": name,
                    "mtime": os.path.getmtime(os.path.join(paths.projects, name)),
                })

    return {
        "root": paths.root,
        "samples": samples,
        "instruments": _plugins(paths.instruments),
        "effects": _plugins(paths.effects),
        "projects": sorted(projects, key=lambda p: -p["mtime"]),
    }


def install_plugin_zip(paths: LibraryPaths, kind: str, zip_bytes: bytes) -> dict:
    if kind not in ("instrument", "effect"):
        raise ValueError("kind має бути 'instrument' або 'effect'")
    dest_root = paths.instruments if kind == "instrument" else paths.effects

    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
        names = zf.namelist()
        if not any(n.endswith("plugin.json") for n in names):
            raise ValueError("У ZIP-архіві не знайдено plugin.json")

        manifest_entry = next(n for n in names if n.endswith("plugin.json"))
        prefix = manifest_entry.rsplit("plugin.json", 1)[0]
        manifest = json.loads(zf.read(manifest_entry))
        plugin_id = _safe_name(manifest.get("id") or manifest.get("name") or "plugin")
        target_dir = os.path.join(dest_root, plugin_id)
        if os.path.exists(target_dir):
            shutil.rmtree(target_dir)
        os.makedirs(target_dir, exist_ok=True)

        for name in names:
            if not name.startswith(prefix) or name.endswith("/"):
                continue
            rel = name[len(prefix):]
            if not rel:
                continue
            out_path = os.path.join(target_dir, rel)
            os.makedirs(os.path.dirname(out_path), exist_ok=True)
            with open(out_path, "wb") as f:
                f.write(zf.read(name))

    return {"id": plugin_id, "kind": kind}


def make_handler_class(app_dir: str, paths: LibraryPaths):

    class LibraryHTTPRequestHandler(SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=app_dir, **kwargs)

        def log_message(self, fmt, *args):
            pass

        def _send_json(self, payload, status=HTTPStatus.OK):
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(body)

        def _read_body(self) -> bytes:
            length = int(self.headers.get("Content-Length", 0))
            return self.rfile.read(length) if length else b""

        def do_GET(self):
            parsed = urlparse(self.path)
            if parsed.path == "/api/library":
                return self._send_json(list_library(paths))
            if parsed.path == "/api/projects":
                return self._send_json(list_library(paths)["projects"])
            if parsed.path.startswith("/api/projects/"):
                name = _safe_name(parsed.path[len("/api/projects/"):])
                fpath = os.path.join(paths.projects, name + ".inkbeat.json")
                if not os.path.isfile(fpath):
                    return self._send_json({"error": "not found"}, HTTPStatus.NOT_FOUND)
                with open(fpath, "r", encoding="utf-8") as f:
                    return self._send_json(json.load(f))
            if parsed.path.startswith("/library/"):
                rel = unquote(parsed.path[len("/library/"):])
                fpath = os.path.join(paths.root, rel)
                if not os.path.abspath(fpath).startswith(os.path.abspath(paths.root)):
                    return self._send_json({"error": "forbidden"}, HTTPStatus.FORBIDDEN)
                if os.path.isfile(fpath):
                    self.send_response(HTTPStatus.OK)
                    ctype = self.guess_type(fpath)
                    self.send_header("Content-Type", ctype)
                    self.send_header("Content-Length", str(os.path.getsize(fpath)))
                    self.send_header("Access-Control-Allow-Origin", "*")
                    self.end_headers()
                    with open(fpath, "rb") as f:
                        shutil.copyfileobj(f, self.wfile)
                    return
                return self._send_json({"error": "not found"}, HTTPStatus.NOT_FOUND)
            return super().do_GET()

        def do_POST(self):
            parsed = urlparse(self.path)
            qs = parse_qs(parsed.query)

            if parsed.path == "/api/library/upload-sample":
                try:
                    folder = qs.get("folder", [""])[0]
                    raw_name = _safe_name(qs.get("name", [""])[0])
                    if os.path.splitext(raw_name)[1].lower() not in AUDIO_EXT:
                        raise ValueError("Непідтримуваний тип аудіофайлу")
                    rel = _safe_rel_path((folder.strip("/") + "/" + raw_name) if folder else raw_name)
                    dest_path = os.path.join(paths.samples, *rel.split("/"))
                    os.makedirs(os.path.dirname(dest_path), exist_ok=True)
                    body = self._read_body()
                    with open(dest_path, "wb") as f:
                        f.write(body)
                    return self._send_json({"ok": True, "name": raw_name, "relPath": rel})
                except Exception as e:
                    return self._send_json({"error": str(e)}, HTTPStatus.BAD_REQUEST)

            if parsed.path == "/api/library/install-plugin":
                try:
                    kind = qs.get("kind", ["instrument"])[0]
                    body = self._read_body()
                    result = install_plugin_zip(paths, kind, body)
                    return self._send_json({"ok": True, **result})
                except Exception as e:
                    return self._send_json({"error": str(e)}, HTTPStatus.BAD_REQUEST)

            if parsed.path.startswith("/api/projects/"):
                try:
                    name = _safe_name(parsed.path[len("/api/projects/"):])
                    body = self._read_body()
                    data = json.loads(body.decode("utf-8"))
                    fpath = os.path.join(paths.projects, name + ".inkbeat.json")
                    with open(fpath, "w", encoding="utf-8") as f:
                        json.dump(data, f, ensure_ascii=False, indent=2)
                    return self._send_json({"ok": True, "name": name})
                except Exception as e:
                    return self._send_json({"error": str(e)}, HTTPStatus.BAD_REQUEST)

            return self._send_json({"error": "not found"}, HTTPStatus.NOT_FOUND)

        def do_DELETE(self):
            parsed = urlparse(self.path)
            qs = parse_qs(parsed.query)

            if parsed.path == "/api/library/item":
                try:
                    category = qs.get("category", [""])[0]
                    if category == "samples":
                        rel = _safe_rel_path(qs.get("name", [""])[0])
                        target = os.path.join(paths.samples, *rel.split("/"))
                    else:
                        root_map = {"instruments": paths.instruments, "effects": paths.effects}
                        if category not in root_map:
                            raise ValueError("Невідома категорія")
                        name = _safe_name(qs.get("name", [""])[0])
                        target = os.path.join(root_map[category], name)
                    if os.path.isdir(target):
                        shutil.rmtree(target)
                    elif os.path.isfile(target):
                        os.remove(target)
                    else:
                        return self._send_json({"error": "not found"}, HTTPStatus.NOT_FOUND)
                    return self._send_json({"ok": True})
                except Exception as e:
                    return self._send_json({"error": str(e)}, HTTPStatus.BAD_REQUEST)

            if parsed.path.startswith("/api/projects/"):
                try:
                    name = _safe_name(parsed.path[len("/api/projects/"):])
                    fpath = os.path.join(paths.projects, name + ".inkbeat.json")
                    if os.path.isfile(fpath):
                        os.remove(fpath)
                    return self._send_json({"ok": True})
                except Exception as e:
                    return self._send_json({"error": str(e)}, HTTPStatus.BAD_REQUEST)

            return self._send_json({"error": "not found"}, HTTPStatus.NOT_FOUND)

        def do_OPTIONS(self):
            self.send_response(HTTPStatus.NO_CONTENT)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.end_headers()

    return LibraryHTTPRequestHandler


def start_library_server(app_dir: str, paths: LibraryPaths, port: int) -> ThreadingHTTPServer:
    handler_cls = make_handler_class(app_dir, paths)
    httpd = ThreadingHTTPServer(("127.0.0.1", port), handler_cls)
    return httpd
