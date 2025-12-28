"""
DataStore for JSON serialization and persistence.
数据存储模块 - 负责发票数据的JSON序列化和持久化
"""

import json
import os
from datetime import datetime
from decimal import Decimal
from typing import List

from src.models import Invoice


class DataStore:
    """
    数据存储类，负责发票数据的序列化、反序列化和文件存储
    """
    
    DEFAULT_DATA_DIR = "data"
    DEFAULT_FILE_NAME = "invoices.json"
    
    def __init__(self, data_dir: str = None, file_name: str = None):
        """
        初始化数据存储
        
        Args:
            data_dir: 数据目录路径，默认为 "data"
            file_name: 数据文件名，默认为 "invoices.json"
        """
        self.data_dir = data_dir or self.DEFAULT_DATA_DIR
        self.file_name = file_name or self.DEFAULT_FILE_NAME
        self.file_path = os.path.join(self.data_dir, self.file_name)
    
    def serialize_invoice(self, invoice: Invoice) -> dict:
        """
        将发票对象序列化为字典
        
        Args:
            invoice: Invoice对象
            
        Returns:
            包含发票数据的字典，Decimal转为字符串，datetime转为ISO格式字符串
        """
        return {
            "invoice_number": invoice.invoice_number,
            "invoice_date": invoice.invoice_date,
            "item_name": invoice.item_name,
            "amount": str(invoice.amount),
            "remark": invoice.remark,
            "file_path": invoice.file_path,
            "scan_time": invoice.scan_time.isoformat()
        }
    
    def deserialize_invoice(self, data: dict) -> Invoice:
        """
        将字典反序列化为发票对象
        
        Args:
            data: 包含发票数据的字典
            
        Returns:
            Invoice对象
        """
        return Invoice(
            invoice_number=data["invoice_number"],
            invoice_date=data["invoice_date"],
            item_name=data["item_name"],
            amount=Decimal(data["amount"]),
            remark=data["remark"],
            file_path=data["file_path"],
            scan_time=datetime.fromisoformat(data["scan_time"])
        )

    def save(self, invoices: List[Invoice]) -> None:
        """
        保存发票数据到JSON文件
        
        Args:
            invoices: 发票列表
            
        Raises:
            IOError: 文件写入失败时抛出
        """
        # Create data directory if not exists
        if not os.path.exists(self.data_dir):
            os.makedirs(self.data_dir)
        
        # Serialize all invoices
        data = [self.serialize_invoice(inv) for inv in invoices]
        
        # Write to file
        try:
            with open(self.file_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
        except Exception as e:
            raise IOError(f"Failed to save invoices to {self.file_path}: {e}")
    
    def load(self) -> List[Invoice]:
        """
        从JSON文件加载发票数据
        
        Returns:
            发票列表，如果文件不存在则返回空列表
            
        Raises:
            IOError: 文件读取失败时抛出
            ValueError: JSON解析失败时抛出
        """
        if not os.path.exists(self.file_path):
            return []
        
        try:
            with open(self.file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
        except json.JSONDecodeError as e:
            raise ValueError(f"Failed to parse JSON from {self.file_path}: {e}")
        except Exception as e:
            raise IOError(f"Failed to load invoices from {self.file_path}: {e}")
        
        return [self.deserialize_invoice(item) for item in data]
