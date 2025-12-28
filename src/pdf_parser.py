"""
InvoicePDFParser for extracting invoice information from PDF files.
PDF发票解析器 - 负责从PDF文件中提取发票信息
"""

import io
import re
from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Optional

import pdfplumber

from src.models import Invoice


class InvalidPDFError(Exception):
    """PDF文件无效或无法解析时抛出的异常"""
    pass


class InvoicePDFParser:
    """
    PDF发票解析器
    
    从PDF格式的电子发票中提取关键信息，包括：
    - 发票号码
    - 开票日期
    - 项目名称
    - 金额
    - 备注
    
    支持两种模式：
    1. 直接提取文本（电子发票）
    2. OCR识别（扫描件发票，需要安装 pytesseract）
    """
    
    def __init__(self):
        self._ocr_available = self._check_ocr_available()
    
    def _check_ocr_available(self) -> bool:
        """检查 OCR 功能是否可用"""
        try:
            import pytesseract
            from PIL import Image
            # 尝试获取 tesseract 版本来验证安装
            pytesseract.get_tesseract_version()
            return True
        except Exception:
            return False
    
    def _ocr_extract_text(self, file_path: str) -> str:
        """使用 OCR 从 PDF 提取文字"""
        try:
            import pytesseract
            from pdf2image import convert_from_path
            
            # 将 PDF 转换为图片
            images = convert_from_path(file_path, dpi=300, first_page=1, last_page=1)
            if not images:
                return ""
            
            # OCR 识别
            text = pytesseract.image_to_string(images[0], lang='chi_sim+eng')
            return text
        except Exception as e:
            print(f"OCR 识别失败: {e}")
            return ""
    
    def parse(self, file_path: str) -> Invoice:
        """
        解析PDF文件，提取发票信息
        
        Args:
            file_path: PDF文件路径
            
        Returns:
            Invoice对象，包含提取的发票信息
            
        Raises:
            FileNotFoundError: 文件不存在
            InvalidPDFError: PDF文件无效或无法解析
        """
        text = ""
        ocr_used = False
        
        try:
            with pdfplumber.open(file_path) as pdf:
                if len(pdf.pages) == 0:
                    raise InvalidPDFError(f"PDF文件没有页面: {file_path}")
                
                # Extract text from first page
                page = pdf.pages[0]
                text = page.extract_text() or ""
                
                # 如果无法提取文字，尝试 OCR
                if not text.strip():
                    if self._ocr_available:
                        text = self._ocr_extract_text(file_path)
                        ocr_used = True
                        if not text.strip():
                            raise InvalidPDFError(f"无法从PDF提取文本（已尝试OCR）: {file_path}")
                    else:
                        raise InvalidPDFError(f"无法从PDF提取文本（该PDF可能是扫描件，需要安装OCR组件）: {file_path}")
                
        except FileNotFoundError:
            raise
        except InvalidPDFError:
            raise
        except Exception as e:
            raise InvalidPDFError(f"无法打开PDF文件 {file_path}: {e}")
        
        # Extract all fields
        invoice_number = self._extract_invoice_number(text)
        invoice_date = self._extract_date(text)
        item_name = self._extract_item_name(text)
        amount = self._extract_amount(text)
        remark = self._extract_remark(text)
        
        return Invoice(
            invoice_number=invoice_number,
            invoice_date=invoice_date,
            item_name=item_name,
            amount=amount,
            remark=remark,
            file_path=file_path,
            scan_time=datetime.now()
        )
    
    def _extract_invoice_number(self, text: str) -> str:
        """
        从文本中提取发票号码
        
        发票号码通常位于发票右上角，格式为"发票号码：XXXXXXXX"
        
        Args:
            text: PDF提取的文本
            
        Returns:
            发票号码字符串，如果未找到则返回空字符串
        """
        # Pattern for invoice number: 发票号码：followed by digits
        patterns = [
            r'发票号码[：:]\s*(\d+)',
            r'发票号码\s*[：:]\s*(\d+)',
            r'No[.：:]\s*(\d+)',
            r'号码[：:]\s*(\d+)',
        ]
        
        for pattern in patterns:
            match = re.search(pattern, text)
            if match:
                return match.group(1)
        
        return ""
    
    def _extract_date(self, text: str) -> str:
        """
        从文本中提取开票日期
        
        支持多种中文日期格式：
        - 2025年10月13日
        - 2025-10-13
        - 2025/10/13
        
        Args:
            text: PDF提取的文本
            
        Returns:
            YYYY-MM-DD格式的日期字符串，如果未找到则返回空字符串
        """
        # Pattern for Chinese date format: YYYY年MM月DD日
        patterns = [
            (r'开票日期[：:]\s*(\d{4})年(\d{1,2})月(\d{1,2})日', lambda m: f"{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"),
            (r'(\d{4})年(\d{1,2})月(\d{1,2})日', lambda m: f"{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"),
            (r'开票日期[：:]\s*(\d{4})-(\d{1,2})-(\d{1,2})', lambda m: f"{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"),
            (r'开票日期[：:]\s*(\d{4})/(\d{1,2})/(\d{1,2})', lambda m: f"{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"),
        ]
        
        for pattern, formatter in patterns:
            match = re.search(pattern, text)
            if match:
                return formatter(match)
        
        return ""
    
    def _extract_item_name(self, text: str) -> str:
        """
        从文本中提取项目名称
        
        项目名称通常在发票明细区域，格式如"*快递服务*收派服务费"
        
        Args:
            text: PDF提取的文本
            
        Returns:
            项目名称字符串，如果未找到则返回空字符串
        """
        # Pattern for item name with asterisks: *类别*具体名称
        patterns = [
            r'\*([^*]+)\*([^\s]+)',  # *快递服务*收派服务费
            r'项目名称\s+(.+?)(?:\s+规格|$)',  # 项目名称 后面的内容
        ]
        
        for pattern in patterns:
            match = re.search(pattern, text)
            if match:
                if match.lastindex == 2:
                    # Format: *category*name
                    return f"*{match.group(1)}*{match.group(2)}"
                else:
                    return match.group(1).strip()
        
        return ""
    
    def _extract_amount(self, text: str) -> Decimal:
        """
        从文本中提取金额
        
        提取价税合计金额（小写），处理货币符号和格式
        
        Args:
            text: PDF提取的文本
            
        Returns:
            Decimal金额，如果未找到则返回Decimal("0")
        """
        # Pattern for total amount: 价税合计...（小写）¥XX.XX
        patterns = [
            r'（小写）[¥￥]?\s*([\d,]+\.?\d*)',  # （小写）¥17.00
            r'\(小写\)[¥￥]?\s*([\d,]+\.?\d*)',  # (小写)¥17.00
            r'价税合计.*?[¥￥]\s*([\d,]+\.?\d*)',  # 价税合计...¥17.00
            r'合\s*计\s*[¥￥]?\s*([\d,]+\.?\d*)',  # 合 计 ¥16.04
        ]
        
        for pattern in patterns:
            match = re.search(pattern, text)
            if match:
                amount_str = match.group(1).replace(',', '')
                try:
                    return Decimal(amount_str)
                except InvalidOperation:
                    continue
        
        return Decimal("0")
    
    def _extract_remark(self, text: str) -> str:
        """
        从文本中提取备注信息
        
        备注通常在发票底部，内容可能在"备注"标签之前或之后
        
        Args:
            text: PDF提取的文本
            
        Returns:
            备注字符串，如果未找到则返回空字符串
        """
        # Pattern 1: Content between 价税合计 line and 备注 label
        # This captures remarks that appear before the 备注 label
        pattern1 = r'[（\(]小写[）\)][¥￥]?[\d,.]+\n(.+?)(?=备\s*注|开票人)'
        match = re.search(pattern1, text, re.DOTALL)
        if match:
            remark = match.group(1).strip()
            # Clean up - remove extra whitespace and newlines
            remark = re.sub(r'\s+', ' ', remark).strip()
            if remark:
                return remark
        
        # Pattern 2: Content after 备注 label
        patterns = [
            r'备\s*注\s*[：:]?\s*(.+?)(?=开票人|$)',
            r'备注\s*(.+?)(?=开票人|$)',
        ]
        
        for pattern in patterns:
            match = re.search(pattern, text, re.DOTALL)
            if match:
                remark = match.group(1).strip()
                remark = re.sub(r'\s+', ' ', remark).strip()
                if remark:
                    return remark
        
        return ""
