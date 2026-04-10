"""
Zero-dependency HTTP server (stdlib only). Use when pip install fails (e.g. Python 3.14 + pydantic-core).

  cd matcher-service
  python -m matcher_service.simple_server

Listens on http://127.0.0.1:8000 - POST /match, GET /health
"""
from __future__ import annotations

import json
import os
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse

from matcher_service.match_core import run_match_dict


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, format: str, *args: object) -> None:
        sys.stderr.write("%s - - [%s] %s\n" % (self.address_string(), self.log_date_time_string(), format % args))

    def _send(self, code: int, body: bytes, content_type: str = "application/json") -> None:
        self.send_response(code)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Connection", "close")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        if path == "/health":
            self._send(200, b'{"ok":true}')
            return
        self._send(404, b'{"error":"not found"}')

    def do_POST(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        if path != "/match":
            self._send(404, b'{"error":"not found"}')
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = 0
        raw = self.rfile.read(length) if length > 0 else b"{}"
        try:
            body = json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError:
            self._send(400, b'{"error":"invalid json"}')
            return
        try:
            out = run_match_dict(body)
        except ValueError as e:
            self._send(400, json.dumps({"error": str(e)}).encode("utf-8"))
            return
        self._send(200, json.dumps(out).encode("utf-8"))


def main() -> None:
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8000"))
    if len(sys.argv) >= 2:
        port = int(sys.argv[1])
    httpd = HTTPServer((host, port), Handler)
    print(f"No-AI matcher (stdlib) on http://{host}:{port}  POST /match  GET /health", file=sys.stderr)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.", file=sys.stderr)


if __name__ == "__main__":
    main()
