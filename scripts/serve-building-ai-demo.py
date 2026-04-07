#!/usr/bin/env python3
"""
本地演示页：提供静态 `web/building-ai-demo/`，并将 `/api/*` 转发到 Chatchat API，
避免浏览器在 OPEN_CROSS_DOMAIN=false 时的跨域限制。

用法：
  python3 scripts/serve-building-ai-demo.py
  python3 scripts/serve-building-ai-demo.py --port 8765 --api http://127.0.0.1:7861

浏览器打开：http://127.0.0.1:8765/

演示页「API 根地址」请填：
  - 同源代理：http://127.0.0.1:8765/api（推荐，勿填 /docs）
  - 或直连 Chatchat JSON API：http://127.0.0.1:7861（端口以实际为准，常见 7861）
若 Chatchat 映射在其它端口：  --api http://127.0.0.1:你的端口
"""
from __future__ import annotations

import argparse
import sys
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent.parent / "web" / "building-ai-demo"


class DemoHTTPServer(HTTPServer):
    """允许快速重启时复用端口（TIME_WAIT）；若仍有进程占用则需换端口或结束旧进程。"""
    allow_reuse_address = True


def _proxy(handler: SimpleHTTPRequestHandler, api_base: str) -> bool:
    if handler.path.startswith("/api/"):
        target = api_base.rstrip("/") + handler.path[4:]
        try:
            length = int(handler.headers.get("Content-Length", 0))
            body = handler.rfile.read(length) if length else None
            req = Request(target, data=body, method=handler.command)
            for h in ("Content-Type", "Authorization"):
                if handler.headers.get(h):
                    req.add_header(h, handler.headers[h])
            with urlopen(req, timeout=600) as resp:
                data = resp.read()
                handler.send_response(resp.status)
                for k, v in resp.headers.items():
                    kl = k.lower()
                    if kl not in ("transfer-encoding", "connection"):
                        handler.send_header(k, v)
                handler.send_header("Access-Control-Allow-Origin", "*")
                handler.end_headers()
                handler.wfile.write(data)
        except HTTPError as e:
            payload = e.read() if hasattr(e, "read") else str(e).encode()
            handler.send_response(e.code)
            handler.send_header("Content-Type", "application/json; charset=utf-8")
            handler.end_headers()
            handler.wfile.write(payload)
        except URLError as e:
            handler.send_response(502)
            handler.send_header("Content-Type", "text/plain; charset=utf-8")
            handler.end_headers()
            handler.wfile.write(f"Bad Gateway: {e.reason}\n".encode("utf-8"))
        return True
    return False


def _options(handler: SimpleHTTPRequestHandler) -> None:
    if handler.path.startswith("/api/"):
        handler.send_response(204)
        handler.send_header("Access-Control-Allow-Origin", "*")
        handler.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        handler.send_header("Access-Control-Allow-Headers", "*")
        handler.end_headers()
    else:
        handler.send_error(405)


def make_handler(api_base: str, directory: str):
    class H(SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=directory, **kwargs)

        def do_GET(self):
            if _proxy(self, api_base):
                return
            return super().do_GET()

        def do_POST(self):
            if _proxy(self, api_base):
                return
            self.send_error(405, "Method not allowed")

        def do_OPTIONS(self):
            _options(self)

        def log_message(self, format, *args):
            sys.stderr.write(
                "%s - - [%s] %s\n"
                % (self.address_string(), self.log_date_time_string(), format % args)
            )

    return H


def main() -> None:
    p = argparse.ArgumentParser(description="Building AI demo static + API proxy")
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--port", type=int, default=8765)
    p.add_argument(
        "--api",
        default="http://127.0.0.1:7861",
        help="Chatchat API base URL",
    )
    args = p.parse_args()
    if not ROOT.is_dir():
        print(f"Missing demo directory: {ROOT}", file=sys.stderr)
        sys.exit(1)
    Handler = make_handler(args.api, str(ROOT))
    try:
        httpd = DemoHTTPServer((args.host, args.port), Handler)
    except OSError as e:
        if e.errno == 98:  # Address already in use
            print(
                f"端口 {args.port} 已被占用（可能已有本脚本在运行）。\n"
                f"  ① 换端口：python3 scripts/serve-building-ai-demo.py --port 8766\n"
                f"  ② 或结束占用进程：ss -tlnp | grep :{args.port}  或  lsof -i :{args.port}",
                file=sys.stderr,
            )
        raise
    print(f"Serving demo at http://{args.host}:{args.port}/  → API proxy /api/* → {args.api}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
