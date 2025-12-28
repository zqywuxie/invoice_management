"""
DuplicateDetector for detecting duplicate invoices.
重复发票检测器 - 负责检测和管理重复发票
"""

from typing import Dict, List, Optional, Set

from src.models import Invoice


class DuplicateDetector:
    """
    重复发票检测器
    
    使用发票号码集合来快速检测重复发票，
    并维护发票号码到发票对象的映射以便获取原始发票信息。
    """
    
    def __init__(self, existing_invoices: List[Invoice] = None):
        """
        初始化重复检测器
        
        Args:
            existing_invoices: 已存在的发票列表，用于初始化检测器
        """
        self._invoice_numbers: Set[str] = set()
        self._invoice_map: Dict[str, Invoice] = {}
        
        if existing_invoices:
            for invoice in existing_invoices:
                self._invoice_numbers.add(invoice.invoice_number)
                self._invoice_map[invoice.invoice_number] = invoice
    
    def is_duplicate(self, invoice_number: str) -> bool:
        """
        检查发票号码是否重复
        
        Args:
            invoice_number: 要检查的发票号码
            
        Returns:
            如果发票号码已存在则返回True，否则返回False
        """
        return invoice_number in self._invoice_numbers
    
    def get_original(self, invoice_number: str) -> Optional[Invoice]:
        """
        获取原始发票信息
        
        Args:
            invoice_number: 发票号码
            
        Returns:
            如果找到则返回原始Invoice对象，否则返回None
        """
        return self._invoice_map.get(invoice_number)
    
    def add_invoice(self, invoice: Invoice) -> None:
        """
        添加发票到检测器（内部使用）
        
        Args:
            invoice: 要添加的发票对象
        """
        self._invoice_numbers.add(invoice.invoice_number)
        self._invoice_map[invoice.invoice_number] = invoice
    
    def remove_invoice(self, invoice_number: str) -> bool:
        """
        从检测器中移除发票
        
        Args:
            invoice_number: 要移除的发票号码
            
        Returns:
            True表示移除成功，False表示发票不存在
        """
        if invoice_number in self._invoice_numbers:
            self._invoice_numbers.discard(invoice_number)
            self._invoice_map.pop(invoice_number, None)
            return True
        return False
