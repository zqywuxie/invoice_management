"""
InvoiceManager for managing invoice operations.
发票管理器 - 负责发票的添加、查询和汇总
"""

from decimal import Decimal
from typing import List, Union

from src.models import AddResult, Invoice, InvoiceSummary
from src.data_store import DataStore
from src.sqlite_data_store import SQLiteDataStore
from src.duplicate_detector import DuplicateDetector


class InvoiceManager:
    """
    发票管理器
    
    负责管理发票的添加、查询、汇总等操作，
    集成重复检测和数据持久化功能。
    支持JSON DataStore和SQLite DataStore两种存储方式。
    """
    
    def __init__(self, data_store: Union[DataStore, SQLiteDataStore] = None, voucher_service=None):
        """
        初始化发票管理器
        
        Args:
            data_store: 数据存储实例，支持DataStore或SQLiteDataStore
                       如果为None则创建默认DataStore实例
            voucher_service: 凭证服务实例，用于级联删除凭证
        """
        self._data_store = data_store or DataStore()
        self._use_sqlite = isinstance(self._data_store, SQLiteDataStore)
        self._voucher_service = voucher_service
        
        # Load existing invoices based on store type
        if self._use_sqlite:
            self._invoices: List[Invoice] = self._data_store.load_all()
        else:
            self._invoices: List[Invoice] = self._data_store.load()
        
        self._duplicate_detector = DuplicateDetector(self._invoices)
    
    def set_voucher_service(self, voucher_service):
        """
        设置凭证服务实例
        
        Args:
            voucher_service: 凭证服务实例
        """
        self._voucher_service = voucher_service
    
    def add_invoice(self, invoice: Invoice) -> AddResult:
        """
        添加发票，返回添加结果
        
        如果发票号码已存在，则返回重复警告并阻止添加。
        
        Args:
            invoice: 要添加的发票对象
            
        Returns:
            AddResult对象，包含添加结果状态
        """
        # Check for duplicate
        if self._duplicate_detector.is_duplicate(invoice.invoice_number):
            original = self._duplicate_detector.get_original(invoice.invoice_number)
            return AddResult(
                success=False,
                is_duplicate=True,
                original_invoice=original,
                message=f"重复发票：发票号码 {invoice.invoice_number} 已存在"
            )
        
        # Add invoice to list and detector
        self._invoices.append(invoice)
        self._duplicate_detector.add_invoice(invoice)
        
        # Persist to storage based on store type
        if self._use_sqlite:
            self._data_store.insert(invoice)
        else:
            self._data_store.save(self._invoices)
        
        return AddResult(
            success=True,
            is_duplicate=False,
            original_invoice=None,
            message=f"发票 {invoice.invoice_number} 添加成功"
        )
    
    def delete_invoice(self, invoice_number: str) -> bool:
        """
        删除发票
        
        从内部列表、重复检测器和数据库中移除指定发票。
        同时删除关联的所有凭证（数据库记录和文件系统文件）。
        
        Args:
            invoice_number: 要删除的发票号码
            
        Returns:
            True表示删除成功，False表示发票不存在
        """
        # Find and remove from internal list
        invoice_to_remove = None
        for invoice in self._invoices:
            if invoice.invoice_number == invoice_number:
                invoice_to_remove = invoice
                break
        
        if invoice_to_remove is None:
            return False
        
        # Delete associated vouchers first (cascade delete)
        if self._voucher_service:
            self._voucher_service.delete_vouchers_by_invoice(invoice_number)
        
        # Remove from internal list
        self._invoices.remove(invoice_to_remove)
        
        # Remove from duplicate detector
        self._duplicate_detector.remove_invoice(invoice_number)
        
        # Delete from storage
        if self._use_sqlite:
            self._data_store.delete(invoice_number)
        else:
            self._data_store.save(self._invoices)
        
        return True
    
    def search_invoices(self, keyword: str) -> List[Invoice]:
        """
        搜索发票
        
        根据关键词搜索发票，在所有文本字段中查找匹配项。
        
        Args:
            keyword: 搜索关键词
            
        Returns:
            匹配的发票列表
        """
        if not keyword or not keyword.strip():
            return self.get_all_invoices()
        
        if self._use_sqlite:
            return self._data_store.search(keyword)
        else:
            # For JSON DataStore, perform in-memory search
            keyword_lower = keyword.lower()
            results = []
            for invoice in self._invoices:
                if (keyword_lower in invoice.invoice_number.lower() or
                    keyword_lower in invoice.invoice_date.lower() or
                    keyword_lower in invoice.item_name.lower() or
                    keyword_lower in str(invoice.amount).lower() or
                    keyword_lower in invoice.remark.lower() or
                    keyword_lower in invoice.file_path.lower()):
                    results.append(invoice)
            return results

    def get_all_invoices(self) -> List[Invoice]:
        """
        获取所有发票
        
        Returns:
            发票列表的副本
        """
        return list(self._invoices)
    
    def get_summary(self) -> InvoiceSummary:
        """
        获取汇总信息
        
        Returns:
            InvoiceSummary对象，包含发票列表、总金额和发票数量
        """
        return InvoiceSummary(
            invoices=self.get_all_invoices(),
            total_amount=self.get_total_amount(),
            invoice_count=self.get_invoice_count()
        )
    
    def get_total_amount(self) -> Decimal:
        """
        计算总金额
        
        使用Decimal算术确保精确计算
        
        Returns:
            所有发票金额的总和
        """
        return sum((inv.amount for inv in self._invoices), Decimal("0"))
    
    def get_invoice_count(self) -> int:
        """
        获取发票数量
        
        Returns:
            唯一发票的数量
        """
        return len(self._invoices)
