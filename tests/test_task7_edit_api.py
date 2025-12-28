"""
Test for Task 7: 实现手动记录编辑API
"""

import json
import os
import tempfile
from datetime import datetime
from decimal import Decimal

from flask import Flask
from src.models import Invoice, ManualRecordIDGenerator
from src.sqlite_data_store import SQLiteDataStore
from src.voucher_service import VoucherService
from src.reimbursement_person_service import ReimbursementPersonService
from invoice_web.user_api import user_api


def create_test_app(db_path):
    """创建测试Flask应用"""
    app = Flask(__name__)
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
    app.register_blueprint(user_api)
    
    return app, data_store


def test_edit_manual_record_with_valid_data():
    """测试使用有效数据编辑手动记录"""
    # 创建临时数据库
    with tempfile.NamedTemporaryFile(delete=False, suffix=".db") as tmp:
        db_path = tmp.name
    
    try:
        app, data_store = create_test_app(db_path)
        
        with app.test_client() as client:
            # 创建测试用户并登录
            data_store.create_user("testuser", "password123", "测试用户")
            
            # 登录
            login_response = client.post('/user/api/login', json={
                'username': 'testuser',
                'password': 'password123'
            })
            assert login_response.status_code == 200
            
            # 创建手动记录
            create_response = client.post('/user/api/create-manual', json={
                'item_name': '交通费',
                'amount': '50.00',
                'invoice_date': '2025-12-28',
                'remark': '打车费用'
            })
            
            assert create_response.status_code == 200
            create_result = json.loads(create_response.data)
            record_id = create_result['record']['invoice_number']
            
            # 编辑记录
            edit_response = client.put(f'/user/api/manual/{record_id}', json={
                'item_name': '餐饮费',
                'amount': '75.50',
                'invoice_date': '2025-12-29',
                'remark': '团队聚餐'
            })
            
            assert edit_response.status_code == 200
            edit_result = json.loads(edit_response.data)
            assert edit_result['success'] is True
            assert edit_result['record']['item_name'] == '餐饮费'
            assert edit_result['record']['amount'] == '75.50'
            assert edit_result['record']['invoice_date'] == '2025-12-29'
            assert edit_result['record']['remark'] == '团队聚餐'
            
            # 验证数据库中的记录已更新
            updated_invoice = data_store.get_invoice_by_number(record_id)
            assert updated_invoice.item_name == '餐饮费'
            assert updated_invoice.amount == Decimal('75.50')
            assert updated_invoice.invoice_date == '2025-12-29'
            assert updated_invoice.remark == '团队聚餐'
            
            print("✓ 使用有效数据编辑手动记录成功")
        
        # 删除data_store引用以释放数据库连接
        del data_store
        
    finally:
        # 清理临时文件
        try:
            if os.path.exists(db_path):
                os.remove(db_path)
        except PermissionError:
            pass


def test_edit_nonexistent_record():
    """测试编辑不存在的记录"""
    # 创建临时数据库
    with tempfile.NamedTemporaryFile(delete=False, suffix=".db") as tmp:
        db_path = tmp.name
    
    try:
        app, data_store = create_test_app(db_path)
        
        with app.test_client() as client:
            # 创建测试用户并登录
            data_store.create_user("testuser", "password123", "测试用户")
            
            # 登录
            client.post('/user/api/login', json={
                'username': 'testuser',
                'password': 'password123'
            })
            
            # 尝试编辑不存在的记录
            response = client.put('/user/api/manual/NONEXISTENT-ID', json={
                'item_name': '餐饮费',
                'amount': '75.50',
                'invoice_date': '2025-12-29'
            })
            
            assert response.status_code == 404
            result = json.loads(response.data)
            assert result['success'] is False
            assert result['error_code'] == 'RECORD_NOT_FOUND'
            
            print("✓ 编辑不存在的记录时正确返回404错误")
        
        # 删除data_store引用以释放数据库连接
        del data_store
        
    finally:
        # 清理临时文件
        try:
            if os.path.exists(db_path):
                os.remove(db_path)
        except PermissionError:
            pass


def test_edit_invoice_record_not_allowed():
    """测试不允许编辑发票记录（非手动记录）"""
    # 创建临时数据库
    with tempfile.NamedTemporaryFile(delete=False, suffix=".db") as tmp:
        db_path = tmp.name
    
    try:
        app, data_store = create_test_app(db_path)
        
        with app.test_client() as client:
            # 创建测试用户并登录
            data_store.create_user("testuser", "password123", "测试用户")
            
            # 登录
            client.post('/user/api/login', json={
                'username': 'testuser',
                'password': 'password123'
            })
            
            # 直接在数据库中创建一个发票记录（非手动记录）
            invoice = Invoice(
                invoice_number='INV-12345',
                invoice_date='2025-12-28',
                item_name='办公用品',
                amount=Decimal('100.00'),
                remark='',
                file_path='/path/to/pdf',
                scan_time=datetime.now(),
                uploaded_by='测试用户',
                reimbursement_person_id=None,
                reimbursement_status='未报销',
                record_type='invoice'  # 发票记录
            )
            data_store.insert(invoice)
            
            # 尝试编辑发票记录
            response = client.put('/user/api/manual/INV-12345', json={
                'item_name': '餐饮费',
                'amount': '75.50',
                'invoice_date': '2025-12-29'
            })
            
            assert response.status_code == 403
            result = json.loads(response.data)
            assert result['success'] is False
            assert result['reason'] == 'invoice_record_not_editable'
            
            print("✓ 不允许编辑发票记录时正确返回403错误")
        
        # 删除data_store引用以释放数据库连接
        del data_store
        
    finally:
        # 清理临时文件
        try:
            if os.path.exists(db_path):
                os.remove(db_path)
        except PermissionError:
            pass


def test_edit_other_user_record_not_allowed():
    """测试不允许编辑其他用户的记录"""
    # 创建临时数据库
    with tempfile.NamedTemporaryFile(delete=False, suffix=".db") as tmp:
        db_path = tmp.name
    
    try:
        app, data_store = create_test_app(db_path)
        
        with app.test_client() as client:
            # 创建两个测试用户
            data_store.create_user("user1", "password123", "用户1")
            data_store.create_user("user2", "password123", "用户2")
            
            # 用户1登录并创建记录
            client.post('/user/api/login', json={
                'username': 'user1',
                'password': 'password123'
            })
            
            create_response = client.post('/user/api/create-manual', json={
                'item_name': '交通费',
                'amount': '50.00',
                'invoice_date': '2025-12-28'
            })
            
            create_result = json.loads(create_response.data)
            record_id = create_result['record']['invoice_number']
            
            # 用户1登出
            client.post('/user/api/logout')
            
            # 用户2登录
            client.post('/user/api/login', json={
                'username': 'user2',
                'password': 'password123'
            })
            
            # 用户2尝试编辑用户1的记录
            response = client.put(f'/user/api/manual/{record_id}', json={
                'item_name': '餐饮费',
                'amount': '75.50',
                'invoice_date': '2025-12-29'
            })
            
            assert response.status_code == 403
            result = json.loads(response.data)
            assert result['success'] is False
            assert '无权编辑' in result['message']
            
            print("✓ 不允许编辑其他用户的记录时正确返回403错误")
        
        # 删除data_store引用以释放数据库连接
        del data_store
        
    finally:
        # 清理临时文件
        try:
            if os.path.exists(db_path):
                os.remove(db_path)
        except PermissionError:
            pass


def test_edit_manual_record_missing_required_fields():
    """测试编辑时缺少必填字段"""
    # 创建临时数据库
    with tempfile.NamedTemporaryFile(delete=False, suffix=".db") as tmp:
        db_path = tmp.name
    
    try:
        app, data_store = create_test_app(db_path)
        
        with app.test_client() as client:
            # 创建测试用户并登录
            data_store.create_user("testuser", "password123", "测试用户")
            
            # 登录
            client.post('/user/api/login', json={
                'username': 'testuser',
                'password': 'password123'
            })
            
            # 创建手动记录
            create_response = client.post('/user/api/create-manual', json={
                'item_name': '交通费',
                'amount': '50.00',
                'invoice_date': '2025-12-28'
            })
            
            create_result = json.loads(create_response.data)
            record_id = create_result['record']['invoice_number']
            
            # 尝试编辑，缺少item_name
            response = client.put(f'/user/api/manual/{record_id}', json={
                'amount': '75.50',
                'invoice_date': '2025-12-29'
            })
            
            assert response.status_code == 400
            result = json.loads(response.data)
            assert result['success'] is False
            assert 'errors' in result
            assert 'item_name' in result['errors']
            
            print("✓ 编辑时缺少必填字段时正确返回错误")
        
        # 删除data_store引用以释放数据库连接
        del data_store
        
    finally:
        # 清理临时文件
        try:
            if os.path.exists(db_path):
                os.remove(db_path)
        except PermissionError:
            pass


def test_edit_manual_record_invalid_amount():
    """测试编辑时使用无效金额"""
    # 创建临时数据库
    with tempfile.NamedTemporaryFile(delete=False, suffix=".db") as tmp:
        db_path = tmp.name
    
    try:
        app, data_store = create_test_app(db_path)
        
        with app.test_client() as client:
            # 创建测试用户并登录
            data_store.create_user("testuser", "password123", "测试用户")
            
            # 登录
            client.post('/user/api/login', json={
                'username': 'testuser',
                'password': 'password123'
            })
            
            # 创建手动记录
            create_response = client.post('/user/api/create-manual', json={
                'item_name': '交通费',
                'amount': '50.00',
                'invoice_date': '2025-12-28'
            })
            
            create_result = json.loads(create_response.data)
            record_id = create_result['record']['invoice_number']
            
            # 尝试编辑，金额为0
            response = client.put(f'/user/api/manual/{record_id}', json={
                'item_name': '交通费',
                'amount': '0',
                'invoice_date': '2025-12-29'
            })
            
            assert response.status_code == 400
            result = json.loads(response.data)
            assert result['success'] is False
            assert 'errors' in result
            assert 'amount' in result['errors']
            
            print("✓ 编辑时使用无效金额时正确返回错误")
        
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
    print("运行Task 7实现测试...\n")
    test_edit_manual_record_with_valid_data()
    test_edit_nonexistent_record()
    test_edit_invoice_record_not_allowed()
    test_edit_other_user_record_not_allowed()
    test_edit_manual_record_missing_required_fields()
    test_edit_manual_record_invalid_amount()
    print("\n所有测试通过！✓")
