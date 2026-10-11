"""python -m worker [chorus --mood M [--theme T]]

With no subcommand, runs the job loop. CLIs print exactly one JSON object on
stdout; all logging goes to stderr.
"""

import argparse
import json
import logging
import sys

from .config import music
from .observe import init as init_sentry


def main(argv=None) -> int:
    logging.basicConfig(level=logging.INFO, stream=sys.stderr, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    parser = argparse.ArgumentParser(prog="python -m worker")
    sub = parser.add_subparsers(dest="cmd")
    ch = sub.add_parser("chorus", help="print one original chorus line as JSON")
    ch.add_argument("--mood", required=True, choices=music()["moods"])
    ch.add_argument("--theme", type=lambda s: s.strip()[:80] or None)
    args = parser.parse_args(argv)
    init_sentry()

    if args.cmd == "chorus":
        from .chorus import chorus_line

        line, source = chorus_line(args.mood, args.theme)
        print(json.dumps({"line": line, "source": source}))
    else:
        from .loop import serve

        serve()
    return 0


if __name__ == "__main__":
    sys.exit(main())
