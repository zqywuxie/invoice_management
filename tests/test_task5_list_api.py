"""
测试任务5：修改发票列表API支持记录类型
"""

import pytest
from decimal import Decimal
from datetime import datetime
from flask import Flask
from src.models import Invoice
from src.sqlite_data_store import SQLiteDataStore
from invoice_web.app import create_app


@pytest.fixture
def app():
    """创建测试应用"""
    app = create_app()
    app.config['TESTING'] = True
    app.config['SECRET_KEY'] = 'test-secret-key'
    
    # 使用内存数据库
    data_store = SQLiteDataStore(':memory:')
    app.config['data_store'] = data_store
    
    # 创建测试用户
    data_store.create_user('testuser', 'password123', '测试用户')
    
    yield app


@pytest.fixture
def client(app):
    """创建测试客户端"""
    return app.test_client()


@pytest.fixture
def logged_in_client(client):
    """创建已登录的测试客户端"""
    # 登录
    client.post('/user/api/login', json={
        'username': 'testuser',
        'password': 'password123'
    })
    return client


def test_get_invoices_includes_record_type(logged_in_client, app):
    """测试发票列表包含record_type字段"""
    data_store = app.config['data_store']
    
    # 创建一个发票记录
    invoice = Invoice(
        invoice_number='INV001',
        invoice_date='2025-12-28',
        item_name='测试项目',
        amount=Decimal('100.00'),
        remark='测试备注',
        file_path='test.pdf',
        scan_time=datetime.now(),
        uploaded_by='测试用户',
        record_type='invoice'
    )
    data_store.insert(invoice)
    
    # 创建一个手动记录
    manual = Invoice(
        invoice_number='MANUAL-001',
        invoice_date='2025-12-28',
        item_name='手动项目',
        amount=Decimal('50.00'),
        remark='手动备注',
        file_path='MANUAL',
        scan_time=datetime.now(),
        uploaded_by='测试用户',
        record_type='manual'
    )
    data_store.insert(manual)
    
    # 获取发票列表
    response = logged_in_client.get('/user/api/invoices')
    assert response.status_code == 200
    
    data = response.get_json()
    assert 'invoices' in data
    assert len(data['invoices']) == 2
    
    # 验证每个记录都包含record_type字段
    for inv in data['invoices']:
        assert 'record_type' in inv
        assert inv['record_type'] in ['invoice', 'manual']


def test_get_invoices_with_statistics(logged_in_client, app):
    """测试发票列表包含分类统计"""
    data_store = app.config['data_store']
    
    # 创建2个发票记录
    for i in range(2):
        invoice = Invoice(
            invoice_number=f'INV00{i+1}',
            invoice_date='2025-12-28',
            item_name=f'发票项目{i+1}',
            amount=Decimal('100.00'),
            remark='',
            file_path='test.pdf',
            scan_time=datetime.now(),
            uploaded_by='测试用户',
            record_type='invoice'
        )
        data_store.insert(invoice)
    
    # 创建3个手动记录
    for i in range(3):
        manual = Invoice(
            invoice_number=f'MANUAL-00{i+1}',
            invoice_date='2025-12-28',
            item_name=f'手动项目{i+1}',
            amount=Decimal('50.00'),
            remark='',
            file_path='MANUAL',
            scan_time=datetime.now(),
            uploaded_by='测试用户',
            record_type='manual'
        )
        data_store.insert(manual)
    
    # 获取发票列表
    response = logged_in_client.get('/user/api/invoices')
    assert response.status_code == 200
    
    data = response.get_json()
    
    # 验证统计字段存在
    assert 'total_count' in data
    assert 'total_amount' in data
    assert 'invoice_count' in data
    assert 'manual_count' in data
    assert 'invoice_amount' in data
    assert 'manual_amount' in data
    
    # 验证统计数据正确
    assert data['total_count'] == 5
    assert data['invoice_count'] == 2
    assert data['manual_count'] == 3
    assert Decimal(data['total_amount']) == Decimal('350.00')  # 2*100 + 3*50
    assert Decimal(data['invoice_amount']) == Decimal('200.00')  # 2*100
    assert Decimal(data['manual_amount']) == Decimal('150.00')  # 3*50


def test_filter_by_record_type_invoice(logged_in_client, app):
    """测试按record_type=invoice过滤"""
    data_store = app.config['data_store']
    
    # 创建发票记录
    invoice = Invoice(
        invoice_number='INV001',
        invoice_date='2025-12-28',
        item_name='发票项目',
        amount=Decimal('100.00'),
        remark='',
        file_path='test.pdf',
        scan_time=datetime.now(),
        uploaded_by='测试用户',
        record_type='invoice'
    )
    data_store.insert(invoice)
    
    # 创建手动记录
    manual = Invoice(
        invoice_number='MANUAL-001',
        invoice_date='2025-12-28',
        item_name='手动项目',
        amount=Decimal('50.00'),
        remark='',
        file_path='MANUAL',
        scan_time=datetime.now(),
        uploaded_by='测试用户',
        record_type='manual'
    )
    data_store.insert(manual)
    
    # 过滤只获取发票记录
    response = logged_in_client.get('/user/api/invoices?record_type=invoice')
    assert response.status_code == 200
    
    data = response.get_json()
    assert len(data['invoices']) == 1
    assert data['invoices'][0]['record_type'] == 'invoice'
    assert data['invoices'][0]['invoice_number'] == 'INV001'


def test_filter_by_record_type_manual(logged_in_client, app):
    """测试按record_type=manual过滤"""
    data_store = app.config['data_store']
    
    # 创建发票记录
    invoice = Invoice(
        invoice_number='INV001',
        invoice_date='2025-12-28',
        item_name='发票项目',
        amount=Decimal('100.00'),
        remark='',
        file_path='test.pdf',
        scan_time=datetime.now(),
        uploaded_by='测试用户',
        record_type='invoice'
    )
    data_store.insert(invoice)
    
    # 创建手动记录
    manual = Invoice(
        invoice_number='MANUAL-001',
        invoice_date='2025-12-28',
        item_name='手动项目',
        amount=Decimal('50.00'),
        remark='',
        file_path='MANUAL',
        scan_time=datetime.now(),
        uploaded_by='测试用户',
        record_type='manual'
    )
    data_store.insert(manual)
    
    # 过滤只获取手动记录
    response = logged_in_client.get('/user/api/invoices?record_type=manual')
    assert response.status_code == 200
    
    data = response.get_json()
    assert len(data['invoices']) == 1
    assert data['invoices'][0]['record_type'] == 'manual'
    assert data['invoices'][0]['invoice_number'] == 'MANUAL-001'


def test_filter_with_invalid_record_type(logged_in_client, app):
    """测试使用无效的record_type参数时返回所有记录"""
    data_store = app.config['data_store']
    
    # 创建发票记录
    invoice = Invoice(
        invoice_number='INV001',
        invoice_date='2025-12-28',
        item_name='发票项目',
        amount=Decimal('100.00'),
        remark='',
        file_path='test.pdf',
        scan_time=datetime.now(),
        uploaded_by='测试用户',
        record_type='invoice'
    )
    data_store.insert(invoice)
    
    # 创建手动记录
    manual = Invoice(
        invoice_number='MANUAL-001',
        invoice_date='2025-12-28',
        item_name='手动项目',
        amount=Decimal('50.00'),
        remark='',
        file_path='MANUAL',
        scan_time=datetime.now(),
        uploaded_by='测试用户',
        record_type='manual'
    )
    data_store.insert(manual)
    
    # 使用无效的record_type参数
    response = logged_in_client.get('/user/api/invoices?record_type=invalid')
    assert response.status_code == 200
    
    data = response.get_json()
    # 应该返回所有记录
    assert len(data['invoices']) == 2


def test_statistics_with_filtered_results(logged_in_client, app):
    """测试过滤后的统计数据正确"""
    data_store = app.config['data_store']
    
    # 创建2个发票记录
    for i in range(2):
        invoice = Invoice(
            invoice_number=f'INV00{i+1}',
            invoice_date='2025-12-28',
            item_name=f'发票项目{i+1}',
            amount=Decimal('100.00'),
            remark='',
            file_path='test.pdf',
            scan_time=datetime.now(),
            uploaded_by='测试用户',
            record_type='invoice'
        )
        data_store.insert(invoice)
    
    # 创建3个手动记录
    for i in range(3):
        manual = Invoice(
            invoice_number=f'MANUAL-00{i+1}',
            invoice_date='2025-12-28',
            item_name=f'手动项目{i+1}',
            amount=Decimal('50.00'),
            remark='',
            file_path='MANUAL',
            scan_time=datetime.now(),
            uploaded_by='测试用户',
            record_type='manual'
        )
        data_store.insert(manual)
    
    # 过滤只获取手动记录
    response = logged_in_client.get('/user/api/invoices?record_type=manual')
    assert response.status_code == 200
    
    data = response.get_json()
    
    # 验证统计数据只包含手动记录
    assert data['total_count'] == 3
    assert data['manual_count'] == 3
    assert data['invoice_count'] == 0
    assert Decimal(data['total_amount']) == Decimal('150.00')
    assert Decimal(data['manual_amount']) == Decimal('150.00')
    assert Decimal(data['invoice_amount']) == Decimal('0')
