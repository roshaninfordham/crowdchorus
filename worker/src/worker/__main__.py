"""python -m worker: runs the job loop. All logging goes to stderr."""

import argparse
import logging
import sys

from .observe import init as init_sentry


def main(argv=None) -> int:
    logging.basicConfig(level=logging.INFO, stream=sys.stderr, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    parser = argparse.ArgumentParser(prog="python -m worker")
    parser.parse_args(argv)
    init_sentry()

    from .loop import serve

    serve()
    return 0


if __name__ == "__main__":
    sys.exit(main())
