"""
测试任务18：更新统计显示
验证发票列表页面显示分类统计（有发票记录和无发票记录的数量和金额）
"""

import pytest
from decimal import Decimal
from datetime import datetime
from src.models import Invoice
from src.sqlite_data_store import SQLiteDataStore
from invoice_web.app import create_app


@pytest.fixture
def app():
    """创建测试应用"""
    # 使用内存数据库
    data_store = SQLiteDataStore(':memory:')
    
    # 创建测试用户
    data_store.create_user('testuser', 'password123', '测试用户')
    
    # 创建应用并传入测试数据库
    app = create_app(data_store)
    app.config['TESTING'] = True
    app.config['SECRET_KEY'] = 'test-secret-key'
    
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


def test_invoices_page_has_statistics_elements(logged_in_client):
    """测试发票列表页面包含统计显示元素"""
    response = logged_in_client.get('/user/invoices')
    assert response.status_code == 200
    
    html = response.data.decode('utf-8')
    
    # 验证总计统计元素存在
    assert 'id="total-count"' in html
    assert 'id="total-amount"' in html
    
    # 验证分类统计元素存在
    assert 'id="invoice-count"' in html
    assert 'id="manual-count"' in html
    assert 'id="invoice-amount"' in html
    assert 'id="manual-amount"' in html
    
    # 验证显示文本
    assert '有发票记录' in html
    assert '无发票记录' in html


def test_api_returns_categorized_statistics(logged_in_client, app):
    """测试API返回分类统计数据"""
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
    
    # 验证统计字段存在且正确
    assert data['total_count'] == 5
    assert data['invoice_count'] == 2
    assert data['manual_count'] == 3
    assert Decimal(data['total_amount']) == Decimal('350.00')  # 2*100 + 3*50
    assert Decimal(data['invoice_amount']) == Decimal('200.00')  # 2*100
    assert Decimal(data['manual_amount']) == Decimal('150.00')  # 3*50


def test_statistics_aggregation_property(logged_in_client, app):
    """
    Property 17: Statistics Aggregation
    验证总计数等于两种类型的计数之和，总金额等于两种类型的金额之和
    Validates: Requirements 7.1, 7.2, 7.3, 7.4
    """
    data_store = app.config['data_store']
    
    # 创建随机数量的发票和手动记录
    invoice_count = 5
    manual_count = 3
    invoice_amount_each = Decimal('120.50')
    manual_amount_each = Decimal('75.25')
    
    # 创建发票记录
    for i in range(invoice_count):
        invoice = Invoice(
            invoice_number=f'INV{i:04d}',
            invoice_date='2025-12-28',
            item_name=f'发票项目{i+1}',
            amount=invoice_amount_each,
            remark='',
            file_path='test.pdf',
            scan_time=datetime.now(),
            uploaded_by='测试用户',
            record_type='invoice'
        )
        data_store.insert(invoice)
    
    # 创建手动记录
    for i in range(manual_count):
        manual = Invoice(
            invoice_number=f'MANUAL{i:04d}',
            invoice_date='2025-12-28',
            item_name=f'手动项目{i+1}',
            amount=manual_amount_each,
            remark='',
            file_path='MANUAL',
            scan_time=datetime.now(),
            uploaded_by='测试用户',
            record_type='manual'
        )
        data_store.insert(manual)
    
    # 获取统计数据
    response = logged_in_client.get('/user/api/invoices')
    assert response.status_code == 200
    
    data = response.get_json()
    
    # 验证Property 17: 总计数 = 发票计数 + 手动计数
    assert data['total_count'] == data['invoice_count'] + data['manual_count']
    assert data['total_count'] == invoice_count + manual_count
    
    # 验证Property 17: 总金额 = 发票金额 + 手动金额
    expected_total = invoice_amount_each * invoice_count + manual_amount_each * manual_count
    assert Decimal(data['total_amount']) == Decimal(data['invoice_amount']) + Decimal(data['manual_amount'])
    assert Decimal(data['total_amount']) == expected_total
    
    # 验证各分类统计正确
    assert data['invoice_count'] == invoice_count
    assert data['manual_count'] == manual_count
    assert Decimal(data['invoice_amount']) == invoice_amount_each * invoice_count
    assert Decimal(data['manual_amount']) == manual_amount_each * manual_count


def test_empty_statistics(logged_in_client, app):
    """测试没有记录时的统计显示"""
    response = logged_in_client.get('/user/api/invoices')
    assert response.status_code == 200
    
    data = response.get_json()
    
    # 验证空统计
    assert data['total_count'] == 0
    assert data['invoice_count'] == 0
    assert data['manual_count'] == 0
    assert Decimal(data['total_amount']) == Decimal('0')
    assert Decimal(data['invoice_amount']) == Decimal('0')
    assert Decimal(data['manual_amount']) == Decimal('0')


def test_only_invoice_records_statistics(logged_in_client, app):
    """测试只有发票记录时的统计"""
    data_store = app.config['data_store']
    
    # 只创建发票记录
    for i in range(3):
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
    
    response = logged_in_client.get('/user/api/invoices')
    assert response.status_code == 200
    
    data = response.get_json()
    
    # 验证统计
    assert data['total_count'] == 3
    assert data['invoice_count'] == 3
    assert data['manual_count'] == 0
    assert Decimal(data['total_amount']) == Decimal('300.00')
    assert Decimal(data['invoice_amount']) == Decimal('300.00')
    assert Decimal(data['manual_amount']) == Decimal('0')


def test_only_manual_records_statistics(logged_in_client, app):
    """测试只有手动记录时的统计"""
    data_store = app.config['data_store']
    
    # 只创建手动记录
    for i in range(4):
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
    
    response = logged_in_client.get('/user/api/invoices')
    assert response.status_code == 200
    
    data = response.get_json()
    
    # 验证统计
    assert data['total_count'] == 4
    assert data['invoice_count'] == 0
    assert data['manual_count'] == 4
    assert Decimal(data['total_amount']) == Decimal('200.00')
    assert Decimal(data['invoice_amount']) == Decimal('0')
    assert Decimal(data['manual_amount']) == Decimal('200.00')
