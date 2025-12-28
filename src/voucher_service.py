"""
VoucherService for expense voucher management.
支出凭证服务 - 负责凭证的上传、存储、查询和删除
"""

import os
import uuid
from datetime import datetime
from typing import List, Optional

from src.models import ExpenseVoucher
from src.sqlite_data_store import SQLiteDataStore


class VoucherService:
    """
    支出凭证服务类，负责凭证的管理操作
    """
    
    SUPPORTED_FORMATS = {'jpg', 'jpeg', 'png'}
    
    def __init__(self, data_store: SQLiteDataStore, voucher_dir: str = "data/vouchers"):
        """
        初始化凭证服务
        
        Args:
            data_store: SQLite数据存储实例
            voucher_dir: 凭证文件存储目录
        """
        self.data_store = data_store
        self.voucher_dir = voucher_dir
    
    def validate_file_format(self, filename: str) -> bool:
        """
        验证文件格式是否为支持的图片格式
        
        Args:
            filename: 文件名
            
        Returns:
            True表示格式有效，False表示格式无效
        """
        if not filename or '.' not in filename:
            return False
        
        extension = filename.rsplit('.', 1)[-1].lower()
        return extension in self.SUPPORTED_FORMATS
    
    def _ensure_voucher_dir(self, invoice_number: str) -> str:
        """
        确保凭证存储目录存在
        
        Args:
            invoice_number: 发票号码
            
        Returns:
            凭证存储目录路径
        """
        voucher_path = os.path.join(self.voucher_dir, invoice_number)
        if not os.path.exists(voucher_path):
            os.makedirs(voucher_path)
        return voucher_path

    def _generate_unique_filename(self, original_filename: str) -> str:
        """
        生成唯一的文件名
        
        Args:
            original_filename: 原始文件名
            
        Returns:
            唯一的文件名
        """
        extension = original_filename.rsplit('.', 1)[-1].lower()
        unique_id = uuid.uuid4().hex[:8]
        timestamp = datetime.now().strftime('%Y%m%d%H%M%S')
        return f"voucher_{timestamp}_{unique_id}.{extension}"
    
    def add_voucher(self, invoice_number: str, file_data: bytes, filename: str) -> ExpenseVoucher:
        """
        添加支出凭证
        
        Args:
            invoice_number: 关联的发票号码
            file_data: 文件二进制数据
            filename: 原始文件名
            
        Returns:
            创建的ExpenseVoucher对象
            
        Raises:
            ValueError: 文件格式无效时抛出
        """
        if not self.validate_file_format(filename):
            raise ValueError("仅支持JPG、PNG格式图片")
        
        # Ensure voucher directory exists
        voucher_path = self._ensure_voucher_dir(invoice_number)
        
        # Generate unique filename and save file
        unique_filename = self._generate_unique_filename(filename)
        file_path = os.path.join(voucher_path, unique_filename)
        
        with open(file_path, 'wb') as f:
            f.write(file_data)
        
        # Create voucher record
        voucher = ExpenseVoucher(
            id=None,
            invoice_number=invoice_number,
            file_path=file_path,
            original_filename=filename,
            upload_time=datetime.now()
        )
        
        # Insert into database and get ID
        voucher_id = self.data_store.insert_voucher(voucher)
        voucher.id = voucher_id
        
        return voucher
    
    def get_vouchers(self, invoice_number: str) -> List[ExpenseVoucher]:
        """
        获取指定发票的所有支出凭证
        
        Args:
            invoice_number: 发票号码
            
        Returns:
            支出凭证列表
        """
        return self.data_store.get_vouchers_by_invoice(invoice_number)
    
    def get_voucher_count(self, invoice_number: str) -> int:
        """
        获取指定发票的支出凭证数量
        
        Args:
            invoice_number: 发票号码
            
        Returns:
            凭证数量
        """
        vouchers = self.data_store.get_vouchers_by_invoice(invoice_number)
        return len(vouchers)
    
    def delete_voucher(self, voucher_id: int) -> bool:
        """
        删除支出凭证
        
        Args:
            voucher_id: 凭证ID
            
        Returns:
            True表示删除成功，False表示未找到记录
        """
        # Get voucher info first to delete the file
        with self.data_store._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT file_path FROM expense_vouchers WHERE id = ?",
                (voucher_id,)
            )
            row = cursor.fetchone()
        
        if not row:
            return False
        
        file_path = row[0]
        
        # Delete from database
        result = self.data_store.delete_voucher(voucher_id)
        
        # Delete file if database deletion was successful
        if result and os.path.exists(file_path):
            try:
                os.remove(file_path)
            except OSError:
                # File deletion failed, but database record is already deleted
                pass
        
        return result
    
    def delete_vouchers_by_invoice(self, invoice_number: str) -> int:
        """
        删除发票关联的所有凭证（数据库记录和文件系统文件）
        
        Args:
            invoice_number: 发票号码
            
        Returns:
            删除的凭证数量
        """
        # Get all vouchers for this invoice
        vouchers = self.get_vouchers(invoice_number)
        
        if not vouchers:
            return 0
        
        deleted_count = 0
        
        for voucher in vouchers:
            # Delete file from filesystem
            if voucher.file_path and os.path.exists(voucher.file_path):
                try:
                    os.remove(voucher.file_path)
                except OSError:
                    # Log error but continue with database deletion
                    pass
            
            # Delete from database
            if self.data_store.delete_voucher(voucher.id):
                deleted_count += 1
        
        # Try to remove the invoice's voucher directory if empty
        voucher_dir = os.path.join(self.voucher_dir, invoice_number)
        if os.path.exists(voucher_dir):
            try:
                os.rmdir(voucher_dir)  # Only removes if empty
            except OSError:
                # Directory not empty or other error, ignore
                pass
        
        return deleted_count
