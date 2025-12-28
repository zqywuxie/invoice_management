#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Web Application Entry Point
Web端电子发票汇总系统 - 启动脚本

Usage:
    python invoice_web/run.py [--host HOST] [--port PORT] [--debug]
    
Examples:
    python invoice_web/run.py                    # 默认启动 (127.0.0.1:5000)
    python invoice_web/run.py --port 8080        # 指定端口
    python invoice_web/run.py --host 0.0.0.0     # 允许外部访问
    python invoice_web/run.py --debug            # 开启调试模式
"""

import argparse
import os
import sys

# Add project root to path for imports
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

from invoice_web.app import InvoiceWebApp


def parse_args():
    """解析命令行参数"""
    parser = argparse.ArgumentParser(
        description='启动Web端电子发票汇总系统',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog='''
示例:
  python invoice_web/run.py                    默认启动 (127.0.0.1:5000)
  python invoice_web/run.py --port 8080        指定端口
  python invoice_web/run.py --host 0.0.0.0     允许外部访问
  python invoice_web/run.py --debug            开启调试模式
        '''
    )
    parser.add_argument(
        '--host',
        type=str,
        default='127.0.0.1',
        help='服务器主机地址 (默认: 127.0.0.1)'
    )
    parser.add_argument(
        '--port',
        type=int,
        default=5000,
        help='服务器端口号 (默认: 5000)'
    )
    parser.add_argument(
        '--debug',
        action='store_true',
        help='开启调试模式'
    )
    return parser.parse_args()


def main():
    """主入口函数"""
    args = parse_args()
    
    print("=" * 50)
    print("  电子发票汇总系统 - Web版")
    print("=" * 50)
    print(f"  服务器地址: http://{args.host}:{args.port}")
    print(f"  调试模式: {'开启' if args.debug else '关闭'}")
    print("=" * 50)
    print("  按 Ctrl+C 停止服务器")
    print("=" * 50)
    print()
    
    # Create and run the web application
    web_app = InvoiceWebApp()
    web_app.run(host=args.host, port=args.port, debug=args.debug)


if __name__ == '__main__':
    main()
