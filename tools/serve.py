#!/usr/bin/env python3
"""Development server for Strain: python -m http.server, minus the caching.

The stock server sends no Cache-Control header, so Chrome keeps files it
fetched earlier for a heuristic lifetime — and a page whose script list
changed can load an old Strain.html against new js files (the symptom:
clicking a country does nothing).  This one tells the browser to store
nothing, so every reload is the working tree as it is on disk.

Usage: python tools/serve.py [port]   (default 8000, bound to 127.0.0.1)
"""
import http.server
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Expires", "0")
        super().end_headers()


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    with http.server.ThreadingHTTPServer(("127.0.0.1", port), Handler) as srv:
        print("Serving HTTP on 127.0.0.1 port %d (http://127.0.0.1:%d/Strain.html), no caching" % (port, port), flush=True)
        try:
            srv.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
