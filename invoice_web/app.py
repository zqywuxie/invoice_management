"""
Flask Application Entry Point
Web端电子发票汇总系统 - Flask应用入口
"""

import os
import sys

# Add project root to path for imports
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

from flask import Flask

from src.sqlite_data_store import SQLiteDataStore
from src.invoice_manager import InvoiceManager
from src.pdf_parser import InvoicePDFParser
from src.export_service import ExportService
from src.voucher_service import VoucherService
from src.docx_export_service import DocxExportService
from src.reimbursement_person_service import ReimbursementPersonService
from src.contract_service import ContractService
from src.signature_service import SignatureService


class InvoiceWebApp:
    """
    Web应用主类
    
    封装Flask应用实例和核心业务模块的初始化配置。
    """
    
    def __init__(self, data_store: SQLiteDataStore = None):
        """
        初始化Web应用
        
        Args:
            data_store: SQLite数据存储实例，默认创建新实例
        """
        # Initialize Flask app with template and static folder configuration
        self.app = Flask(
            __name__,
            template_folder='templates',
            static_folder='static'
        )
        
        # Configure app
        self.app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'dev-secret-key')
        self.app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max upload
        
        # Use absolute paths for data directories
        data_dir = os.path.join(project_root, 'data')
        db_path = os.path.join(data_dir, 'invoices.db')
        voucher_dir = os.path.join(data_dir, 'vouchers')
        contract_dir = os.path.join(data_dir, 'contracts')
        signature_dir = os.path.join(data_dir, 'signatures')
        
        # Log the database path for debugging
        print(f"[DEBUG] Project root: {project_root}")
        print(f"[DEBUG] Database path: {db_path}")
        print(f"[DEBUG] Database exists: {os.path.exists(db_path)}")
        
        # Initialize core modules with absolute paths
        self.data_store = data_store or SQLiteDataStore(db_path)
        self.pdf_parser = InvoicePDFParser()
        self.export_service = ExportService()
        
        self.voucher_service = VoucherService(self.data_store, voucher_dir)
        self.invoice_manager = InvoiceManager(self.data_store, self.voucher_service)
        self.docx_export_service = DocxExportService(self.data_store, self.voucher_service)
        self.reimbursement_person_service = ReimbursementPersonService(self.data_store)
        self.contract_service = ContractService(self.data_store, contract_dir)
        self.signature_service = SignatureService(self.data_store, signature_dir)
        
        # Store references in app config for access in routes
        self.app.config['data_store'] = self.data_store
        self.app.config['invoice_manager'] = self.invoice_manager
        self.app.config['pdf_parser'] = self.pdf_parser
        self.app.config['export_service'] = self.export_service
        self.app.config['voucher_service'] = self.voucher_service
        self.app.config['docx_export_service'] = self.docx_export_service
        self.app.config['reimbursement_person_service'] = self.reimbursement_person_service
        self.app.config['contract_service'] = self.contract_service
        self.app.config['signature_service'] = self.signature_service
        
        # Register routes
        self._register_routes()
    
    def _register_routes(self):
        """注册路由"""
        from flask import render_template, redirect, url_for
        from invoice_web.routes import api
        from invoice_web.user_routes import user_bp
        from invoice_web.user_api import user_api
        
        # Register API Blueprint
        self.app.register_blueprint(api)
        
        # Register User Portal Blueprints
        self.app.register_blueprint(user_bp)
        self.app.register_blueprint(user_api)
        
        # Index route - redirect to user portal
        @self.app.route('/')
        def index():
            return redirect(url_for('user.login'))
        
        # Admin portal route - main management page
        @self.app.route('/admin')
        def admin():
            return render_template('index.html')
    
    def run(self, host='127.0.0.1', port=5000, debug=False):
        """
        启动Web服务器
        
        Args:
            host: 主机地址
            port: 端口号
            debug: 是否开启调试模式
        """
        self.app.run(host=host, port=port, debug=debug)


def create_app(data_store: SQLiteDataStore = None) -> Flask:
    """
    应用工厂函数
    
    Args:
        data_store: SQLite数据存储实例
        
    Returns:
        配置好的Flask应用实例
    """
    web_app = InvoiceWebApp(data_store)
    return web_app.app


# Create default app instance
app = create_app()


if __name__ == '__main__':
    web_app = InvoiceWebApp()
    web_app.run(debug=True)
