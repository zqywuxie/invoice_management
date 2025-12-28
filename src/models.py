"""
Data models for the Invoice Summary System.
电子发票汇总系统数据模型
"""

import random
import string
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from typing import List, Optional


@dataclass
class User:
    """
    用户数据模型
    
    Attributes:
        id: 用户ID
        username: 用户名
        password_hash: 密码哈希
        display_name: 显示名称
        created_at: 创建时间
        is_admin: 是否为管理员
    """
    id: Optional[int]
    username: str
    password_hash: str
    display_name: str
    created_at: datetime
    is_admin: bool = False


@dataclass
class Invoice:
    """
    发票数据模型
    
    Attributes:
        invoice_number: 发票号码（唯一标识）
        invoice_date: 开票日期 (YYYY-MM-DD格式)
        item_name: 项目名称
        amount: 金额（精确到分）
        remark: 备注信息
        file_path: 源PDF文件路径
        scan_time: 扫描录入时间
        uploaded_by: 上传人用户名
        reimbursement_person_id: 报销人ID（外键关联reimbursement_persons表）
        reimbursement_status: 报销状态（未报销 | 已报销）
        record_type: 记录类型（invoice | manual）
    """
    invoice_number: str
    invoice_date: str
    item_name: str
    amount: Decimal
    remark: str
    file_path: str
    scan_time: datetime
    uploaded_by: str = ""
    reimbursement_person_id: Optional[int] = None
    reimbursement_status: str = "未报销"
    record_type: str = "invoice"

    def __eq__(self, other: object) -> bool:
        """Compare two Invoice objects for equality."""
        if not isinstance(other, Invoice):
            return NotImplemented
        return (
            self.invoice_number == other.invoice_number
            and self.invoice_date == other.invoice_date
            and self.item_name == other.item_name
            and self.amount == other.amount
            and self.remark == other.remark
            and self.file_path == other.file_path
            and self.scan_time == other.scan_time
            and self.uploaded_by == other.uploaded_by
            and self.reimbursement_person_id == other.reimbursement_person_id
            and self.reimbursement_status == other.reimbursement_status
            and self.record_type == other.record_type
        )


@dataclass
class AddResult:
    """
    添加发票结果
    
    Attributes:
        success: 是否添加成功
        is_duplicate: 是否为重复发票
        original_invoice: 原始发票（如果重复）
        message: 结果消息
    """
    success: bool
    is_duplicate: bool
    original_invoice: Optional[Invoice]
    message: str


@dataclass
class InvoiceSummary:
    """
    发票汇总信息
    
    Attributes:
        invoices: 发票列表
        total_amount: 总金额
        invoice_count: 发票数量
    """
    invoices: List[Invoice]
    total_amount: Decimal
    invoice_count: int


@dataclass
class BatchResult:
    """
    批量处理结果
    
    Attributes:
        success_count: 成功数量
        duplicate_count: 重复数量
        error_count: 错误数量
        errors: 错误信息列表
    """
    success_count: int
    duplicate_count: int
    error_count: int
    errors: List[str]


@dataclass
class ExpenseVoucher:
    """
    支出凭证数据模型
    
    Attributes:
        id: 凭证ID（数据库自增主键）
        invoice_number: 关联的发票号码
        file_path: 凭证图片存储路径
        original_filename: 原始文件名
        upload_time: 上传时间
    """
    id: Optional[int]
    invoice_number: str
    file_path: str
    original_filename: str
    upload_time: datetime

    def __eq__(self, other: object) -> bool:
        """Compare two ExpenseVoucher objects for equality."""
        if not isinstance(other, ExpenseVoucher):
            return NotImplemented
        return (
            self.id == other.id
            and self.invoice_number == other.invoice_number
            and self.file_path == other.file_path
            and self.original_filename == other.original_filename
            and self.upload_time == other.upload_time
        )


@dataclass
class ReimbursementPerson:
    """
    报销人数据模型
    
    Attributes:
        id: 报销人ID（数据库自增主键）
        name: 报销人姓名
        created_time: 创建时间
    """
    id: Optional[int]
    name: str
    created_time: datetime

    def __eq__(self, other: object) -> bool:
        """Compare two ReimbursementPerson objects for equality."""
        if not isinstance(other, ReimbursementPerson):
            return NotImplemented
        return (
            self.id == other.id
            and self.name == other.name
            and self.created_time == other.created_time
        )


@dataclass
class Contract:
    """
    合同数据模型（用于大额发票）
    
    Attributes:
        id: 合同ID（数据库自增主键）
        invoice_number: 关联的发票号码
        file_path: 合同文件存储路径
        original_filename: 原始文件名
        upload_time: 上传时间
    """
    id: Optional[int]
    invoice_number: str
    file_path: str
    original_filename: str
    upload_time: datetime

    def __eq__(self, other: object) -> bool:
        """Compare two Contract objects for equality."""
        if not isinstance(other, Contract):
            return NotImplemented
        return (
            self.id == other.id
            and self.invoice_number == other.invoice_number
            and self.file_path == other.file_path
            and self.original_filename == other.original_filename
            and self.upload_time == other.upload_time
        )


@dataclass
class ElectronicSignature:
    """
    电子签章数据模型
    
    Attributes:
        id: 签章ID（数据库自增主键）
        invoice_number: 关联的发票号码
        image_path: 签章图片存储路径
        original_filename: 原始文件名
        position_x: 签章X坐标（PDF页面上的位置）
        position_y: 签章Y坐标（PDF页面上的位置）
        width: 签章宽度
        height: 签章高度
        page_number: 签章所在页码（从0开始）
        upload_time: 上传时间
    """
    id: Optional[int]
    invoice_number: str
    image_path: str
    original_filename: str
    position_x: float
    position_y: float
    width: float
    height: float
    page_number: int
    upload_time: datetime

    def __eq__(self, other: object) -> bool:
        """Compare two ElectronicSignature objects for equality."""
        if not isinstance(other, ElectronicSignature):
            return NotImplemented
        return (
            self.id == other.id
            and self.invoice_number == other.invoice_number
            and self.image_path == other.image_path
            and self.original_filename == other.original_filename
            and self.position_x == other.position_x
            and self.position_y == other.position_y
            and self.width == other.width
            and self.height == other.height
            and self.page_number == other.page_number
            and self.upload_time == other.upload_time
        )


@dataclass
class SignatureTemplate:
    """
    签章模板数据模型（签章库）
    
    Attributes:
        id: 签章模板ID（数据库自增主键）
        name: 签章名称
        image_path: 签章图片存储路径
        original_filename: 原始文件名
        upload_time: 上传时间
    """
    id: Optional[int]
    name: str
    image_path: str
    original_filename: str
    upload_time: datetime

    def __eq__(self, other: object) -> bool:
        """Compare two SignatureTemplate objects for equality."""
        if not isinstance(other, SignatureTemplate):
            return NotImplemented
        return (
            self.id == other.id
            and self.name == other.name
            and self.image_path == other.image_path
            and self.original_filename == other.original_filename
            and self.upload_time == other.upload_time
        )


class ManualRecordIDGenerator:
    """
    生成手动记录的唯一标识符
    格式：MANUAL-YYYYMMDD-HHMMSS-XXXX
    例如：MANUAL-20251228-143052-A3F2
    """
    
    @staticmethod
    def generate() -> str:
        """
        生成唯一的手动记录ID
        
        Returns:
            格式为 MANUAL-YYYYMMDD-HHMMSS-XXXX 的唯一标识符
        """
        now = datetime.now()
        date_part = now.strftime("%Y%m%d")
        time_part = now.strftime("%H%M%S")
        random_part = ''.join(random.choices(string.ascii_uppercase + string.digits, k=4))
        
        return f"MANUAL-{date_part}-{time_part}-{random_part}"
