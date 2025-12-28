"""
Test for Task 2: 实现手动记录创建API
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


def test_create_manual_record_with_valid_data():
    """测试使用有效数据创建手动记录"""
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
            response = client.post('/user/api/create-manual', json={
                'item_name': '交通费',
                'amount': '50.00',
                'invoice_date': '2025-12-28',
                'remark': '打车费用'
            })
            
            assert response.status_code == 200
            result = json.loads(response.data)
            assert result['success'] is True
            assert 'record' in result
            assert result['record']['record_type'] == 'manual'
            assert result['record']['item_name'] == '交通费'
            assert result['record']['amount'] == '50.00'
            assert result['record']['invoice_date'] == '2025-12-28'
            assert 'MANUAL-' in result['record']['invoice_number']
            
            # 验证记录已保存到数据库
            record_id = result['record']['invoice_number']
            saved_invoice = data_store.get_invoice_by_number(record_id)
            assert saved_invoice is not None
            assert saved_invoice.record_type == 'manual'
            assert saved_invoice.item_name == '交通费'
            
            print("✓ 使用有效数据创建手动记录成功")
        
        # 删除data_store引用以释放数据库连接
        del data_store
        
    finally:
        # 清理临时文件
        try:
            if os.path.exists(db_path):
                os.remove(db_path)
        except PermissionError:
            pass


def test_create_manual_record_missing_required_fields():
    """测试缺少必填字段时创建失败"""
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
            
            # 缺少item_name
            response = client.post('/user/api/create-manual', json={
                'amount': '50.00',
                'invoice_date': '2025-12-28'
            })
            
            assert response.status_code == 400
            result = json.loads(response.data)
            assert result['success'] is False
            assert 'errors' in result
            assert 'item_name' in result['errors']
            
            print("✓ 缺少必填字段时正确返回错误")
        
        # 删除data_store引用以释放数据库连接
        del data_store
        
    finally:
        # 清理临时文件
        try:
            if os.path.exists(db_path):
                os.remove(db_path)
        except PermissionError:
            pass


def test_create_manual_record_invalid_amount():
    """测试无效金额时创建失败"""
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
            
            # 金额为0
            response = client.post('/user/api/create-manual', json={
                'item_name': '交通费',
                'amount': '0',
                'invoice_date': '2025-12-28'
            })
            
            assert response.status_code == 400
            result = json.loads(response.data)
            assert result['success'] is False
            assert 'errors' in result
            assert 'amount' in result['errors']
            
            # 金额为负数
            response = client.post('/user/api/create-manual', json={
                'item_name': '交通费',
                'amount': '-10',
                'invoice_date': '2025-12-28'
            })
            
            assert response.status_code == 400
            result = json.loads(response.data)
            assert result['success'] is False
            assert 'amount' in result['errors']
            
            print("✓ 无效金额时正确返回错误")
        
        # 删除data_store引用以释放数据库连接
        del data_store
        
    finally:
        # 清理临时文件
        try:
            if os.path.exists(db_path):
                os.remove(db_path)
        except PermissionError:
            pass


def test_create_manual_record_invalid_date():
    """测试无效日期格式时创建失败"""
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
            
            # 无效日期格式
            response = client.post('/user/api/create-manual', json={
                'item_name': '交通费',
                'amount': '50.00',
                'invoice_date': '2025/12/28'  # 错误格式
            })
            
            assert response.status_code == 400
            result = json.loads(response.data)
            assert result['success'] is False
            assert 'errors' in result
            assert 'invoice_date' in result['errors']
            
            print("✓ 无效日期格式时正确返回错误")
        
        # 删除data_store引用以释放数据库连接
        del data_store
        
    finally:
        # 清理临时文件
        try:
            if os.path.exists(db_path):
                os.remove(db_path)
        except PermissionError:
            pass


def test_manual_record_id_format():
    """测试生成的手动记录ID格式正确"""
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
            response = client.post('/user/api/create-manual', json={
                'item_name': '交通费',
                'amount': '50.00',
                'invoice_date': '2025-12-28'
            })
            
            result = json.loads(response.data)
            record_id = result['record']['invoice_number']
            
            # 验证ID格式：MANUAL-YYYYMMDD-HHMMSS-XXXX
            parts = record_id.split('-')
            assert len(parts) == 4
            assert parts[0] == 'MANUAL'
            assert len(parts[1]) == 8  # YYYYMMDD
            assert len(parts[2]) == 6  # HHMMSS
            assert len(parts[3]) == 4  # XXXX
            
            print("✓ 生成的手动记录ID格式正确")
        
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
    print("运行Task 2实现测试...\n")
    test_create_manual_record_with_valid_data()
    test_create_manual_record_missing_required_fields()
    test_create_manual_record_invalid_amount()
    test_create_manual_record_invalid_date()
    test_manual_record_id_format()
    print("\n所有测试通过！✓")
