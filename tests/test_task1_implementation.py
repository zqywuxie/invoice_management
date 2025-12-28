"""
Test for Task 1: 扩展数据模型和数据库架构
"""

import os
import tempfile
from datetime import datetime
from decimal import Decimal

from src.models import Invoice, ManualRecordIDGenerator
from src.sqlite_data_store import SQLiteDataStore


def test_invoice_model_has_record_type():
    """测试Invoice模型包含record_type字段"""
    invoice = Invoice(
        invoice_number="TEST001",
        invoice_date="2025-12-28",
        item_name="测试项目",
        amount=Decimal("100.00"),
        remark="测试备注",
        file_path="/test/path.pdf",
        scan_time=datetime.now()
    )
    
    # 默认值应该是 "invoice"
    assert invoice.record_type == "invoice"
    
    # 可以设置为 "manual"
    manual_invoice = Invoice(
        invoice_number="MANUAL-001",
        invoice_date="2025-12-28",
        item_name="手动记录",
        amount=Decimal("50.00"),
        remark="手动输入",
        file_path="MANUAL",
        scan_time=datetime.now(),
        record_type="manual"
    )
    assert manual_invoice.record_type == "manual"
    print("✓ Invoice模型包含record_type字段")


def test_manual_record_id_generator():
    """测试ManualRecordIDGenerator生成唯一ID"""
    # 生成多个ID
    ids = [ManualRecordIDGenerator.generate() for _ in range(10)]
    
    # 检查格式
    for id_str in ids:
        parts = id_str.split("-")
        assert len(parts) == 4, f"ID格式错误: {id_str}"
        assert parts[0] == "MANUAL", f"前缀错误: {id_str}"
        assert len(parts[1]) == 8, f"日期部分长度错误: {id_str}"
        assert len(parts[2]) == 6, f"时间部分长度错误: {id_str}"
        assert len(parts[3]) == 4, f"随机部分长度错误: {id_str}"
    
    # 检查唯一性（虽然理论上可能重复，但概率极低）
    assert len(ids) == len(set(ids)), "生成的ID应该是唯一的"
    print("✓ ManualRecordIDGenerator生成正确格式的唯一ID")


def test_database_migration_adds_record_type_column():
    """测试数据库迁移添加record_type列"""
    # 创建临时数据库
    with tempfile.NamedTemporaryFile(delete=False, suffix=".db") as tmp:
        db_path = tmp.name
    
    try:
        # 初始化数据库（会自动运行迁移）
        data_store = SQLiteDataStore(db_path)
        
        # 检查record_type列是否存在
        conn = data_store._get_connection()
        cursor = conn.cursor()
        cursor.execute("PRAGMA table_info(invoices)")
        columns = [col[1] for col in cursor.fetchall()]
        cursor.close()
        conn.close()
        
        assert "record_type" in columns, "record_type列应该存在"
        print("✓ 数据库迁移成功添加record_type列")
        
        # 删除data_store引用以释放数据库连接
        del data_store
        
    finally:
        # 清理临时文件
        try:
            if os.path.exists(db_path):
                os.remove(db_path)
        except PermissionError:
            pass  # Windows文件锁定问题，忽略


def test_insert_and_retrieve_manual_record():
    """测试插入和检索手动记录"""
    # 创建临时数据库
    with tempfile.NamedTemporaryFile(delete=False, suffix=".db") as tmp:
        db_path = tmp.name
    
    try:
        data_store = SQLiteDataStore(db_path)
        
        # 创建手动记录
        manual_id = ManualRecordIDGenerator.generate()
        manual_invoice = Invoice(
            invoice_number=manual_id,
            invoice_date="2025-12-28",
            item_name="交通费",
            amount=Decimal("50.00"),
            remark="打车费用",
            file_path="MANUAL",
            scan_time=datetime.now(),
            uploaded_by="测试用户",
            record_type="manual"
        )
        
        # 插入记录
        data_store.insert(manual_invoice)
        
        # 检索记录
        retrieved = data_store.get_invoice_by_number(manual_id)
        
        assert retrieved is not None, "应该能检索到记录"
        assert retrieved.record_type == "manual", "记录类型应该是manual"
        assert retrieved.invoice_number == manual_id, "发票号码应该匹配"
        assert retrieved.item_name == "交通费", "项目名称应该匹配"
        assert retrieved.amount == Decimal("50.00"), "金额应该匹配"
        
        print("✓ 成功插入和检索手动记录")
        
        # 删除data_store引用以释放数据库连接
        del data_store
        
    finally:
        # 清理临时文件
        try:
            if os.path.exists(db_path):
                os.remove(db_path)
        except PermissionError:
            pass  # Windows文件锁定问题，忽略


def test_insert_and_retrieve_invoice_record():
    """测试插入和检索发票记录（确保向后兼容）"""
    # 创建临时数据库
    with tempfile.NamedTemporaryFile(delete=False, suffix=".db") as tmp:
        db_path = tmp.name
    
    try:
        data_store = SQLiteDataStore(db_path)
        
        # 创建发票记录（不指定record_type，应该默认为invoice）
        invoice = Invoice(
            invoice_number="12345678",
            invoice_date="2025-12-28",
            item_name="办公用品",
            amount=Decimal("100.00"),
            remark="购买文具",
            file_path="/path/to/invoice.pdf",
            scan_time=datetime.now(),
            uploaded_by="测试用户"
        )
        
        # 插入记录
        data_store.insert(invoice)
        
        # 检索记录
        retrieved = data_store.get_invoice_by_number("12345678")
        
        assert retrieved is not None, "应该能检索到记录"
        assert retrieved.record_type == "invoice", "记录类型应该默认为invoice"
        assert retrieved.invoice_number == "12345678", "发票号码应该匹配"
        
        print("✓ 成功插入和检索发票记录（向后兼容）")
        
        # 删除data_store引用以释放数据库连接
        del data_store
        
    finally:
        # 清理临时文件
        try:
            if os.path.exists(db_path):
                os.remove(db_path)
        except PermissionError:
            pass  # Windows文件锁定问题，忽略


if __name__ == "__main__":
    print("运行Task 1实现测试...\n")
    test_invoice_model_has_record_type()
    test_manual_record_id_generator()
    test_database_migration_adds_record_type_column()
    test_insert_and_retrieve_manual_record()
    test_insert_and_retrieve_invoice_record()
    print("\n所有测试通过！✓")
