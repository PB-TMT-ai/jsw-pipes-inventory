"""Local server for the P&T prototypes.

Identical to `python -m http.server` for reads, plus one thing it cannot do:
accept a save. POST /api/overrides writes the campaign-planning overrides and
their change log to .scratch/pt-command-centre/overrides.json, so a decision
taken in the browser survives into the next session and can be read as a file.

    python serve.py [port]        default 8932
"""

import json
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).parent.resolve()
STORE = ROOT / ".scratch" / "pt-command-centre" / "overrides.json"
MAX_BODY = 1 << 20  # 1 MB is far more than a month of overrides


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(ROOT), **kw)

    def _json(self, code, payload):
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.split("?")[0] == "/api/overrides":
            if STORE.exists():
                self._json(200, json.loads(STORE.read_text(encoding="utf-8")))
            else:
                self._json(200, {})
            return
        super().do_GET()

    def do_POST(self):
        if self.path.split("?")[0] != "/api/overrides":
            self._json(404, {"error": "no such endpoint"})
            return

        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > MAX_BODY:
            self._json(400, {"error": "bad content length"})
            return

        try:
            payload = json.loads(self.rfile.read(length))
        except json.JSONDecodeError as exc:
            self._json(400, {"error": f"invalid json: {exc}"})
            return

        # Write via a temp file and replace, so an interrupted save cannot
        # leave a half-written overrides.json behind.
        STORE.parent.mkdir(parents=True, exist_ok=True)
        tmp = STORE.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
        tmp.replace(STORE)
        self._json(200, {"saved": True, "path": str(STORE.relative_to(ROOT))})

    def log_message(self, fmt, *args):
        if self.command == "POST":
            super().log_message(fmt, *args)


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8932
    print(f"P&T prototypes on http://localhost:{port}")
    print(f"overrides -> {STORE.relative_to(ROOT)}")
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()


if __name__ == "__main__":
    main()
