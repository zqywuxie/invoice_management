"""
Tests for Task 3: Duplicate Detection Logic
测试任务3：重复检测逻辑
"""

import os
import sys
import tempfile
from datetime import datetime
from decimal import Decimal

# Add src directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from src.sqlite_data_store import SQLiteDataStore
from src.models import Invoice


def test_check_manual_duplicate_finds_duplicate():
    """测试重复检测能够找到重复记录"""
    # 创建临时数据库
    with tempfile.NamedTemporaryFile(suffix='.db', delete=False) as f:
        db_path = f.name
    
    try:
        data_store = SQLiteDataStore(db_path)
        
        # 创建第一条手动记录
        invoice1 = Invoice(
            invoice_number='MANUAL-20251228-120000-A1B2',
            invoice_date='2025-12-28',
            item_name='交通费',
            amount=Decimal('50.00'),
            remark='打车费用',
            file_path='MANUAL',
            scan_time=datetime.now(),
            uploaded_by='张三',
            reimbursement_person_id=None,
            reimbursement_status='未报销',
            record_type='manual'
        )
        data_store.insert(invoice1)
        
        # 检查重复（相同的金额、日期、项目名称、上传人）
        duplicate = data_store.check_manual_duplicate(
            amount=Decimal('50.00'),
            invoice_date='2025-12-28',
            item_name='交通费',
            uploaded_by='张三'
        )
        
        assert duplicate is not None, "应该检测到重复记录"
        assert duplicate.invoice_number == 'MANUAL-20251228-120000-A1B2'
        assert duplicate.item_name == '交通费'
        assert duplicate.amount == Decimal('50.00')
        
        print("✓ 测试通过：重复检测能够找到重复记录")
        
        # 关闭数据库连接
        del data_store
        
    finally:
        # 清理临时数据库
        try:
            if os.path.exists(db_path):
                os.remove(db_path)
        except PermissionError:
            pass  # Windows文件锁定问题，忽略


def test_check_manual_duplicate_no_duplicate():
    """测试重复检测在没有重复时返回None"""
    # 创建临时数据库
    with tempfile.NamedTemporaryFile(suffix='.db', delete=False) as f:
        db_path = f.name
    
    try:
        data_store = SQLiteDataStore(db_path)
        
        # 创建第一条手动记录
        invoice1 = Invoice(
            invoice_number='MANUAL-20251228-120000-A1B2',
            invoice_date='2025-12-28',
            item_name='交通费',
            amount=Decimal('50.00'),
            remark='打车费用',
            file_path='MANUAL',
            scan_time=datetime.now(),
            uploaded_by='张三',
            reimbursement_person_id=None,
            reimbursement_status='未报销',
            record_type='manual'
        )
        data_store.insert(invoice1)
        
        # 检查不同金额的记录（不应该重复）
        duplicate = data_store.check_manual_duplicate(
            amount=Decimal('100.00'),  # 不同金额
            invoice_date='2025-12-28',
            item_name='交通费',
            uploaded_by='张三'
        )
        
        assert duplicate is None, "不应该检测到重复记录（金额不同）"
        
        # 检查不同日期的记录（不应该重复）
        duplicate = data_store.check_manual_duplicate(
            amount=Decimal('50.00'),
            invoice_date='2025-12-29',  # 不同日期
            item_name='交通费',
            uploaded_by='张三'
        )
        
        assert duplicate is None, "不应该检测到重复记录（日期不同）"
        
        # 检查不同项目名称的记录（不应该重复）
        duplicate = data_store.check_manual_duplicate(
            amount=Decimal('50.00'),
            invoice_date='2025-12-28',
            item_name='餐饮费',  # 不同项目名称
            uploaded_by='张三'
        )
        
        assert duplicate is None, "不应该检测到重复记录（项目名称不同）"
        
        # 检查不同上传人的记录（不应该重复）
        duplicate = data_store.check_manual_duplicate(
            amount=Decimal('50.00'),
            invoice_date='2025-12-28',
            item_name='交通费',
            uploaded_by='李四'  # 不同上传人
        )
        
        assert duplicate is None, "不应该检测到重复记录（上传人不同）"
        
        print("✓ 测试通过：重复检测在没有重复时返回None")
        
        # 关闭数据库连接
        del data_store
        
    finally:
        # 清理临时数据库
        try:
            if os.path.exists(db_path):
                os.remove(db_path)
        except PermissionError:
            pass  # Windows文件锁定问题，忽略


def test_check_manual_duplicate_ignores_invoice_records():
    """测试重复检测只检查手动记录，忽略发票记录"""
    # 创建临时数据库
    with tempfile.NamedTemporaryFile(suffix='.db', delete=False) as f:
        db_path = f.name
    
    try:
        data_store = SQLiteDataStore(db_path)
        
        # 创建一条发票记录（record_type='invoice'）
        invoice1 = Invoice(
            invoice_number='12345678',
            invoice_date='2025-12-28',
            item_name='交通费',
            amount=Decimal('50.00'),
            remark='打车费用',
            file_path='/path/to/pdf',
            scan_time=datetime.now(),
            uploaded_by='张三',
            reimbursement_person_id=None,
            reimbursement_status='未报销',
            record_type='invoice'  # 发票记录
        )
        data_store.insert(invoice1)
        
        # 检查重复（相同的金额、日期、项目名称、上传人，但是发票记录）
        duplicate = data_store.check_manual_duplicate(
            amount=Decimal('50.00'),
            invoice_date='2025-12-28',
            item_name='交通费',
            uploaded_by='张三'
        )
        
        assert duplicate is None, "不应该检测到重复记录（发票记录不应该被检测）"
        
        print("✓ 测试通过：重复检测只检查手动记录，忽略发票记录")
        
        # 关闭数据库连接
        del data_store
        
    finally:
        # 清理临时数据库
        try:
            if os.path.exists(db_path):
                os.remove(db_path)
        except PermissionError:
            pass  # Windows文件锁定问题，忽略


if __name__ == '__main__':
    print("运行任务3的重复检测测试...\n")
    
    test_check_manual_duplicate_finds_duplicate()
    test_check_manual_duplicate_no_duplicate()
    test_check_manual_duplicate_ignores_invoice_records()
    
    print("\n所有测试通过！✓")
