"""
Migration Service for JSON to SQLite data migration.
数据迁移服务 - 负责将JSON数据迁移到SQLite数据库

Requirements: 3.1, 3.2
"""

import os
from typing import List, Tuple

from src.data_store import DataStore
from src.sqlite_data_store import SQLiteDataStore
from src.models import Invoice


class MigrationService:
    """
    数据迁移服务类
    
    负责检测旧JSON数据文件并将数据迁移到SQLite数据库。
    """
    
    DEFAULT_JSON_PATH = "data/invoices.json"
    
    def __init__(self, json_path: str = None, sqlite_store: SQLiteDataStore = None):
        """
        初始化迁移服务
        
        Args:
            json_path: JSON数据文件路径，默认为 "data/invoices.json"
            sqlite_store: SQLite数据存储实例
        """
        self.json_path = json_path or self.DEFAULT_JSON_PATH
        self._sqlite_store = sqlite_store
        self._json_store = None
    
    def has_json_data(self) -> bool:
        """
        检查是否存在JSON数据文件
        
        Returns:
            True表示存在JSON数据文件，False表示不存在
        """
        return os.path.exists(self.json_path) and os.path.isfile(self.json_path)
    
    def get_json_invoice_count(self) -> int:
        """
        获取JSON文件中的发票数量
        
        Returns:
            发票数量，如果文件不存在或无法读取则返回0
        """
        if not self.has_json_data():
            return 0
        
        try:
            self._ensure_json_store()
            invoices = self._json_store.load()
            return len(invoices)
        except Exception:
            return 0
    
    def _ensure_json_store(self) -> None:
        """确保JSON数据存储已初始化"""
        if self._json_store is None:
            data_dir = os.path.dirname(self.json_path)
            file_name = os.path.basename(self.json_path)
            self._json_store = DataStore(data_dir=data_dir, file_name=file_name)
    
    def _ensure_sqlite_store(self) -> None:
        """确保SQLite数据存储已初始化"""
        if self._sqlite_store is None:
            self._sqlite_store = SQLiteDataStore()
    
    def migrate(self) -> Tuple[int, int, List[str]]:
        """
        执行数据迁移
        
        将JSON文件中的发票数据迁移到SQLite数据库。
        
        Returns:
            元组 (成功数量, 跳过数量, 错误列表)
            - 成功数量: 成功迁移的发票数量
            - 跳过数量: 因重复而跳过的发票数量
            - 错误列表: 迁移过程中的错误信息
        """
        if not self.has_json_data():
            return (0, 0, ["JSON数据文件不存在"])
        
        self._ensure_json_store()
        self._ensure_sqlite_store()
        
        success_count = 0
        skip_count = 0
        errors = []
        
        try:
            invoices = self._json_store.load()
        except Exception as e:
            return (0, 0, [f"读取JSON文件失败: {e}"])
        
        for invoice in invoices:
            try:
                self._sqlite_store.insert(invoice)
                success_count += 1
            except Exception as e:
                error_msg = str(e)
                if "UNIQUE constraint failed" in error_msg:
                    # Invoice already exists in database, skip
                    skip_count += 1
                else:
                    errors.append(f"发票 {invoice.invoice_number}: {error_msg}")
        
        return (success_count, skip_count, errors)
    
    def backup_json_file(self) -> bool:
        """
        备份JSON数据文件
        
        将原JSON文件重命名为 .json.bak
        
        Returns:
            True表示备份成功，False表示失败
        """
        if not self.has_json_data():
            return False
        
        backup_path = self.json_path + ".bak"
        try:
            # If backup already exists, remove it first
            if os.path.exists(backup_path):
                os.remove(backup_path)
            os.rename(self.json_path, backup_path)
            return True
        except Exception:
            return False
