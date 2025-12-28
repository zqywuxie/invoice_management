"""
Test for Task 24: Admin Record Type Filtering
Requirements: 13.4, 13.5
"""
import pytest
from invoice_web.app import app
from src.sqlite_data_store import SQLiteDataStore
from src.models import Invoice
from decimal import Decimal
from datetime import datetime


@pytest.fixture
def client():
    """Create a test client"""
    app.config['TESTING'] = True
    app.config['SECRET_KEY'] = 'test-secret-key'
    with app.test_client() as client:
        yield client


@pytest.fixture
def test_db():
    """Create a test database with sample data"""
    db_path = "test_admin_filter.db"
    data_store = SQLiteDataStore(db_path)
    
    # Create test user (admin)
    data_store.create_user("admin", "admin123", "管理员", is_admin=True)
    
    # Create invoice records
    invoice1 = Invoice(
        invoice_number="INV001",
        invoice_date="2025-12-20",
        item_name="办公用品",
        amount=Decimal("100.00"),
        remark="测试发票1",
        file_path="test1.pdf",
        scan_time=datetime.now(),
        uploaded_by="管理员",
        reimbursement_person_id=None,
        reimbursement_status="未报销",
        record_type="invoice"
    )
    
    invoice2 = Invoice(
        invoice_number="MANUAL-20251220-120000-A1B2",
        invoice_date="2025-12-21",
        item_name="交通费",
        amount=Decimal("50.00"),
        remark="测试手动记录1",
        file_path="MANUAL",
        scan_time=datetime.now(),
        uploaded_by="管理员",
        reimbursement_person_id=None,
        reimbursement_status="未报销",
        record_type="manual"
    )
    
    invoice3 = Invoice(
        invoice_number="INV002",
        invoice_date="2025-12-22",
        item_name="餐费",
        amount=Decimal("200.00"),
        remark="测试发票2",
        file_path="test2.pdf",
        scan_time=datetime.now(),
        uploaded_by="管理员",
        reimbursement_person_id=None,
        reimbursement_status="已报销",
        record_type="invoice"
    )
    
    invoice4 = Invoice(
        invoice_number="MANUAL-20251222-130000-C3D4",
        invoice_date="2025-12-23",
        item_name="打车费",
        amount=Decimal("30.00"),
        remark="测试手动记录2",
        file_path="MANUAL",
        scan_time=datetime.now(),
        uploaded_by="管理员",
        reimbursement_person_id=None,
        reimbursement_status="已报销",
        record_type="manual"
    )
    
    data_store.insert(invoice1)
    data_store.insert(invoice2)
    data_store.insert(invoice3)
    data_store.insert(invoice4)
    
    yield data_store
    
    # Cleanup
    import os
    if os.path.exists(db_path):
        os.remove(db_path)


def test_admin_filter_all_records(client, test_db):
    """Test filtering all records (no filter applied)"""
    # Login as admin
    response = client.post('/api/auth/login', json={
        'username': 'admin',
        'password': 'admin123'
    })
    assert response.status_code == 200
    
    # Get all invoices without filter
    response = client.get('/api/invoices')
    assert response.status_code == 200
    data = response.get_json()
    
    # Should return all 4 records
    assert data['total_count'] == 4
    assert len(data['invoices']) == 4


def test_admin_filter_invoice_records(client, test_db):
    """Test filtering only invoice records (Requirements: 13.4, 13.5)"""
    # Login as admin
    response = client.post('/api/auth/login', json={
        'username': 'admin',
        'password': 'admin123'
    })
    assert response.status_code == 200
    
    # Get only invoice records
    response = client.get('/api/invoices?record_type=invoice')
    assert response.status_code == 200
    data = response.get_json()
    
    # Should return only 2 invoice records
    assert data['total_count'] == 2
    assert len(data['invoices']) == 2
    
    # Verify all returned records are invoice type
    for invoice in data['invoices']:
        assert invoice['record_type'] == 'invoice'


def test_admin_filter_manual_records(client, test_db):
    """Test filtering only manual records (Requirements: 13.4, 13.5)"""
    # Login as admin
    response = client.post('/api/auth/login', json={
        'username': 'admin',
        'password': 'admin123'
    })
    assert response.status_code == 200
    
    # Get only manual records
    response = client.get('/api/invoices?record_type=manual')
    assert response.status_code == 200
    data = response.get_json()
    
    # Should return only 2 manual records
    assert data['total_count'] == 2
    assert len(data['invoices']) == 2
    
    # Verify all returned records are manual type
    for invoice in data['invoices']:
        assert invoice['record_type'] == 'manual'


def test_admin_filter_combined_with_status(client, test_db):
    """Test combining record type filter with status filter (Requirements: 13.5)"""
    # Login as admin
    response = client.post('/api/auth/login', json={
        'username': 'admin',
        'password': 'admin123'
    })
    assert response.status_code == 200
    
    # Get only manual records with "已报销" status
    response = client.get('/api/invoices?record_type=manual&reimbursement_status=已报销')
    assert response.status_code == 200
    data = response.get_json()
    
    # Should return only 1 manual record with "已报销" status
    assert data['total_count'] == 1
    assert len(data['invoices']) == 1
    assert data['invoices'][0]['record_type'] == 'manual'
    assert data['invoices'][0]['reimbursement_status'] == '已报销'


def test_admin_filter_combined_with_uploader(client, test_db):
    """Test combining record type filter with uploader filter (Requirements: 13.5)"""
    # Login as admin
    response = client.post('/api/auth/login', json={
        'username': 'admin',
        'password': 'admin123'
    })
    assert response.status_code == 200
    
    # Get only invoice records uploaded by "管理员"
    response = client.get('/api/invoices?record_type=invoice&uploaded_by=管理员')
    assert response.status_code == 200
    data = response.get_json()
    
    # Should return 2 invoice records
    assert data['total_count'] == 2
    assert len(data['invoices']) == 2
    
    # Verify all returned records are invoice type and uploaded by "管理员"
    for invoice in data['invoices']:
        assert invoice['record_type'] == 'invoice'
        assert invoice['uploaded_by'] == '管理员'


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
