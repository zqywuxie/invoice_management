"""
Test for Task 11: 创建前端上传模式选择器
"""

import os
import tempfile
from flask import Flask
from src.sqlite_data_store import SQLiteDataStore
from src.voucher_service import VoucherService
from src.reimbursement_person_service import ReimbursementPersonService
from invoice_web.user_routes import user_bp


def create_test_app(db_path):
    """创建测试Flask应用"""
    app = Flask(__name__, template_folder='../invoice_web/templates')
    app.config['SECRET_KEY'] = 'test_secret_key'
    app.config['TESTING'] = True
    
    # 创建数据存储和服务
    data_store = SQLiteDataStore(db_path)
    voucher_service = VoucherService(data_store, voucher_dir=tempfile.mkdtemp())
    person_service = ReimbursementPersonService(data_store)
    
    # 配置应用
    app.config['data_store'] = data_store
    app.config['voucher_service'] = voucher_service
    app.config['reimbursement_person_service'] = person_service
    
    # 注册蓝图
    app.register_blueprint(user_bp)
    
    return app, data_store


def test_upload_page_has_mode_selector():
    """测试上传页面包含模式选择器"""
    # 创建临时数据库
    with tempfile.NamedTemporaryFile(delete=False, suffix=".db") as tmp:
        db_path = tmp.name
    
    try:
        app, data_store = create_test_app(db_path)
        
        with app.test_client() as client:
            # 创建测试用户并登录
            data_store.create_user("testuser", "password123", "测试用户")
            
            # 登录
            with client.session_transaction() as sess:
                sess['user'] = {
                    'username': 'testuser',
                    'display_name': '测试用户',
                    'is_admin': False
                }
            
            # 访问上传页面
            response = client.get('/user/')
            assert response.status_code == 200
            
            html = response.data.decode('utf-8')
            
            # 验证模式选择器存在
            assert 'upload-mode-selector' in html, "页面应包含upload-mode-selector"
            
            # 验证PDF模式按钮存在
            assert 'pdf-mode-btn' in html, "页面应包含pdf-mode-btn"
            assert '上传发票PDF' in html, "页面应包含'上传发票PDF'文本"
            
            # 验证手动输入模式按钮存在
            assert 'manual-mode-btn' in html, "页面应包含manual-mode-btn"
            assert '手动输入报销信息' in html, "页面应包含'手动输入报销信息'文本"
            
            print("✓ 上传页面包含模式选择器")
        
        # 删除data_store引用以释放数据库连接
        del data_store
        
    finally:
        # 清理临时文件
        try:
            if os.path.exists(db_path):
                os.remove(db_path)
        except PermissionError:
            pass


def test_mode_selector_has_two_buttons():
    """测试模式选择器有两个按钮"""
    # 创建临时数据库
    with tempfile.NamedTemporaryFile(delete=False, suffix=".db") as tmp:
        db_path = tmp.name
    
    try:
        app, data_store = create_test_app(db_path)
        
        with app.test_client() as client:
            # 创建测试用户并登录
            data_store.create_user("testuser", "password123", "测试用户")
            
            # 登录
            with client.session_transaction() as sess:
                sess['user'] = {
                    'username': 'testuser',
                    'display_name': '测试用户',
                    'is_admin': False
                }
            
            # 访问上传页面
            response = client.get('/user/')
            html = response.data.decode('utf-8')
            
            # 验证两个模式按钮都存在
            assert html.count('class="mode-btn') >= 2, "应该有至少两个mode-btn"
            assert 'data-mode="pdf"' in html, "应该有PDF模式按钮"
            assert 'data-mode="manual"' in html, "应该有手动输入模式按钮"
            
            print("✓ 模式选择器有两个按钮")
        
        # 删除data_store引用以释放数据库连接
        del data_store
        
    finally:
        # 清理临时文件
        try:
            if os.path.exists(db_path):
                os.remove(db_path)
        except PermissionError:
            pass


def test_pdf_mode_button_is_active_by_default():
    """测试PDF模式按钮默认为激活状态"""
    # 创建临时数据库
    with tempfile.NamedTemporaryFile(delete=False, suffix=".db") as tmp:
        db_path = tmp.name
    
    try:
        app, data_store = create_test_app(db_path)
        
        with app.test_client() as client:
            # 创建测试用户并登录
            data_store.create_user("testuser", "password123", "测试用户")
            
            # 登录
            with client.session_transaction() as sess:
                sess['user'] = {
                    'username': 'testuser',
                    'display_name': '测试用户',
                    'is_admin': False
                }
            
            # 访问上传页面
            response = client.get('/user/')
            html = response.data.decode('utf-8')
            
            # 查找PDF模式按钮的HTML片段
            # 应该包含 class="mode-btn active" 和 data-mode="pdf"
            assert 'class="mode-btn active"' in html, "应该有一个激活的按钮"
            
            # 验证PDF按钮是激活的（通过检查按钮顺序和active类）
            pdf_btn_pos = html.find('data-mode="pdf"')
            active_class_pos = html.rfind('class="mode-btn active"', 0, pdf_btn_pos + 100)
            
            # 如果active类在pdf按钮附近，说明PDF按钮是激活的
            assert active_class_pos > 0 and abs(pdf_btn_pos - active_class_pos) < 200, \
                "PDF模式按钮应该默认为激活状态"
            
            print("✓ PDF模式按钮默认为激活状态")
        
        # 删除data_store引用以释放数据库连接
        del data_store
        
    finally:
        # 清理临时文件
        try:
            if os.path.exists(db_path):
                os.remove(db_path)
        except PermissionError:
            pass


def test_mode_selector_css_styles_exist():
    """测试模式选择器的CSS样式存在"""
    # 创建临时数据库
    with tempfile.NamedTemporaryFile(delete=False, suffix=".db") as tmp:
        db_path = tmp.name
    
    try:
        app, data_store = create_test_app(db_path)
        
        with app.test_client() as client:
            # 创建测试用户并登录
            data_store.create_user("testuser", "password123", "测试用户")
            
            # 登录
            with client.session_transaction() as sess:
                sess['user'] = {
                    'username': 'testuser',
                    'display_name': '测试用户',
                    'is_admin': False
                }
            
            # 访问上传页面
            response = client.get('/user/')
            html = response.data.decode('utf-8')
            
            # 验证CSS样式存在
            assert '.upload-mode-selector' in html, "应该包含.upload-mode-selector样式"
            assert '.mode-btn' in html, "应该包含.mode-btn样式"
            assert '.mode-btn.active' in html, "应该包含.mode-btn.active样式"
            
            print("✓ 模式选择器的CSS样式存在")
        
        # 删除data_store引用以释放数据库连接
        del data_store
        
    finally:
        # 清理临时文件
        try:
            if os.path.exists(db_path):
                os.remove(db_path)
        except PermissionError:
            pass


if __name__ == "__main__":
    print("运行Task 11实现测试...\n")
    test_upload_page_has_mode_selector()
    test_mode_selector_has_two_buttons()
    test_pdf_mode_button_is_active_by_default()
    test_mode_selector_css_styles_exist()
    print("\n所有测试通过！✓")
