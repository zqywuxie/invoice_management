"""
ContractService for managing invoice contracts.
合同服务模块 - 负责大额发票合同的上传、查询、删除功能
"""

import os
import shutil
from datetime import datetime
from typing import Optional, Tuple

from src.models import Contract
from src.sqlite_data_store import SQLiteDataStore


class ContractService:
    """
    合同服务类，负责大额发票合同的管理
    """
    
    # 大额发票金额阈值（超过此金额需要上传合同）
    LARGE_INVOICE_THRESHOLD = 10000
    
    def __init__(self, data_store: SQLiteDataStore, storage_base_path: str = "data/contracts"):
        """
        初始化合同服务
        
        Args:
            data_store: 数据存储实例
            storage_base_path: 合同文件存储基础路径
        """
        self.data_store = data_store
        self.storage_base_path = storage_base_path
        self._ensure_storage_dir()
    
    def _ensure_storage_dir(self) -> None:
        """确保存储目录存在"""
        if not os.path.exists(self.storage_base_path):
            os.makedirs(self.storage_base_path)
    
    def _get_contract_dir(self, invoice_number: str) -> str:
        """获取发票合同存储目录"""
        return os.path.join(self.storage_base_path, invoice_number)
    
    def upload_contract(self, invoice_number: str, file_data: bytes, 
                        original_filename: str) -> Tuple[bool, str, Optional[Contract]]:
        """
        上传合同文件
        
        Args:
            invoice_number: 发票号码
            file_data: 文件二进制数据
            original_filename: 原始文件名
            
        Returns:
            (成功标志, 消息, Contract对象或None)
        """
        try:
            # 检查发票是否存在
            invoice = self.data_store.get_invoice_by_number(invoice_number)
            if not invoice:
                return False, "发票不存在", None
            
            # 检查是否已有合同，如果有则先删除
            existing_contract = self.data_store.get_contract_by_invoice(invoice_number)
            if existing_contract:
                self.delete_contract(invoice_number)
            
            # 创建存储目录
            contract_dir = self._get_contract_dir(invoice_number)
            if not os.path.exists(contract_dir):
                os.makedirs(contract_dir)
            
            # 保存文件
            file_path = os.path.join(contract_dir, original_filename)
            with open(file_path, 'wb') as f:
                f.write(file_data)
            
            # 创建合同记录
            contract = Contract(
                id=None,
                invoice_number=invoice_number,
                file_path=file_path,
                original_filename=original_filename,
                upload_time=datetime.now()
            )
            
            contract_id = self.data_store.insert_contract(contract)
            contract.id = contract_id
            
            return True, "合同上传成功", contract
            
        except Exception as e:
            return False, f"合同上传失败: {str(e)}", None
    
    def get_contract(self, invoice_number: str) -> Optional[Contract]:
        """
        获取发票的合同
        
        Args:
            invoice_number: 发票号码
            
        Returns:
            Contract对象，如果不存在则返回None
        """
        return self.data_store.get_contract_by_invoice(invoice_number)
    
    def get_contract_file(self, invoice_number: str) -> Optional[Tuple[bytes, str]]:
        """
        获取合同文件内容
        
        Args:
            invoice_number: 发票号码
            
        Returns:
            (文件内容, 原始文件名) 或 None
        """
        contract = self.data_store.get_contract_by_invoice(invoice_number)
        if not contract:
            return None
        
        if not os.path.exists(contract.file_path):
            return None
        
        with open(contract.file_path, 'rb') as f:
            file_data = f.read()
        
        return file_data, contract.original_filename
    
    def delete_contract(self, invoice_number: str) -> Tuple[bool, str]:
        """
        删除发票的合同
        
        Args:
            invoice_number: 发票号码
            
        Returns:
            (成功标志, 消息)
        """
        try:
            contract = self.data_store.get_contract_by_invoice(invoice_number)
            if not contract:
                return False, "合同不存在"
            
            # 删除文件
            if os.path.exists(contract.file_path):
                os.remove(contract.file_path)
            
            # 删除目录（如果为空）
            contract_dir = self._get_contract_dir(invoice_number)
            if os.path.exists(contract_dir) and not os.listdir(contract_dir):
                os.rmdir(contract_dir)
            
            # 删除数据库记录
            self.data_store.delete_contract(contract.id)
            
            return True, "合同删除成功"
            
        except Exception as e:
            return False, f"合同删除失败: {str(e)}"
    
    def delete_contracts_by_invoice(self, invoice_number: str) -> Tuple[bool, str]:
        """
        删除发票的所有合同（用于发票删除时的级联删除）
        
        Args:
            invoice_number: 发票号码
            
        Returns:
            (成功标志, 消息)
        """
        try:
            # 删除文件目录
            contract_dir = self._get_contract_dir(invoice_number)
            if os.path.exists(contract_dir):
                shutil.rmtree(contract_dir)
            
            # 删除数据库记录
            self.data_store.delete_contracts_by_invoice(invoice_number)
            
            return True, "合同清理成功"
            
        except Exception as e:
            return False, f"合同清理失败: {str(e)}"
    
    @staticmethod
    def is_large_invoice(amount: float) -> bool:
        """
        判断是否为大额发票
        
        Args:
            amount: 发票金额
            
        Returns:
            True表示是大额发票
        """
        return amount > ContractService.LARGE_INVOICE_THRESHOLD
    
    def validate_large_invoice_contract(self, invoice_number: str, amount: float) -> Tuple[bool, str]:
        """
        验证大额发票是否已上传合同
        
        Args:
            invoice_number: 发票号码
            amount: 发票金额
            
        Returns:
            (验证通过标志, 消息)
        """
        if not self.is_large_invoice(amount):
            return True, "非大额发票，无需合同"
        
        contract = self.get_contract(invoice_number)
        if contract:
            return True, "合同已上传"
        
        return False, f"金额超过{self.LARGE_INVOICE_THRESHOLD}元的大额发票必须上传合同"
