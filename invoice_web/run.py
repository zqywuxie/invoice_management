#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Web application entry point.

Usage:
    python invoice_web/run.py [--host HOST] [--port PORT] [--debug]
"""

import argparse
import os
import sys


project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

from invoice_web.app import InvoiceWebApp


def _default_port() -> int:
    value = os.environ.get("APP_PORT", "5000").strip()
    try:
        return int(value)
    except ValueError:
        return 5000


def parse_args():
    parser = argparse.ArgumentParser(
        description="Start the invoice web application.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python invoice_web/run.py
  python invoice_web/run.py --port 8080
  python invoice_web/run.py --host 0.0.0.0
  python invoice_web/run.py --debug
        """,
    )
    parser.add_argument(
        "--host",
        type=str,
        default="127.0.0.1",
        help="Bind host, default: 127.0.0.1",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=_default_port(),
        help="Bind port, default: APP_PORT or 5000",
    )
    parser.add_argument(
        "--debug",
        action="store_true",
        help="Enable Flask debug mode.",
    )
    return parser.parse_args()


def main():
    args = parse_args()

    print("=" * 50)
    print("  Invoice Management Web")
    print("=" * 50)
    print(f"  Server: http://{args.host}:{args.port}")
    print(f"  Debug: {'on' if args.debug else 'off'}")
    print("=" * 50)
    print("  Press Ctrl+C to stop")
    print("=" * 50)
    print()

    web_app = InvoiceWebApp()
    web_app.run(host=args.host, port=args.port, debug=args.debug)


if __name__ == "__main__":
    main()
