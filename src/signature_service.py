"""
SignatureService for managing electronic signatures on invoices.
电子签章服务模块 - 负责发票电子签章的上传、位置设置、删除和PDF渲染功能
"""

import os
import shutil
from datetime import datetime
from typing import Optional, Tuple

from src.models import ElectronicSignature, SignatureTemplate
from src.sqlite_data_store import SQLiteDataStore


class SignatureService:
    """
    电子签章服务类，负责发票电子签章的管理
    """
    
    def __init__(self, data_store: SQLiteDataStore, storage_base_path: str = "data/signatures"):
        """
        初始化签章服务
        
        Args:
            data_store: 数据存储实例
            storage_base_path: 签章文件存储基础路径
        """
        self.data_store = data_store
        self.storage_base_path = storage_base_path
        self._ensure_storage_dir()
    
    def _ensure_storage_dir(self) -> None:
        """确保存储目录存在"""
        if not os.path.exists(self.storage_base_path):
            os.makedirs(self.storage_base_path)
    
    def _get_signature_dir(self, invoice_number: str) -> str:
        """获取发票签章存储目录"""
        return os.path.join(self.storage_base_path, invoice_number)
    
    def upload_signature(self, invoice_number: str, file_data: bytes, 
                         original_filename: str, position_x: float = 0,
                         position_y: float = 0, width: float = 100,
                         height: float = 100, page_number: int = 0
                         ) -> Tuple[bool, str, Optional[ElectronicSignature]]:
        """
        上传电子签章
        
        Args:
            invoice_number: 发票号码
            file_data: 文件二进制数据
            original_filename: 原始文件名
            position_x: X坐标
            position_y: Y坐标
            width: 宽度
            height: 高度
            page_number: 页码
            
        Returns:
            (成功标志, 消息, ElectronicSignature对象或None)
        """
        try:
            # 检查发票是否存在
            invoice = self.data_store.get_invoice_by_number(invoice_number)
            if not invoice:
                return False, "发票不存在", None
            
            # 检查是否已有签章，如果有则先删除
            existing_signature = self.data_store.get_signature_by_invoice(invoice_number)
            if existing_signature:
                self.delete_signature(invoice_number)
            
            # 创建存储目录
            signature_dir = self._get_signature_dir(invoice_number)
            if not os.path.exists(signature_dir):
                os.makedirs(signature_dir)
            
            # 保存文件
            file_path = os.path.join(signature_dir, original_filename)
            with open(file_path, 'wb') as f:
                f.write(file_data)
            
            # 创建签章记录
            signature = ElectronicSignature(
                id=None,
                invoice_number=invoice_number,
                image_path=file_path,
                original_filename=original_filename,
                position_x=position_x,
                position_y=position_y,
                width=width,
                height=height,
                page_number=page_number,
                upload_time=datetime.now()
            )
            
            signature_id = self.data_store.insert_signature(signature)
            signature.id = signature_id
            
            return True, "签章上传成功", signature
            
        except Exception as e:
            return False, f"签章上传失败: {str(e)}", None
    
    def get_signature(self, invoice_number: str) -> Optional[ElectronicSignature]:
        """
        获取发票的电子签章
        
        Args:
            invoice_number: 发票号码
            
        Returns:
            ElectronicSignature对象，如果不存在则返回None
        """
        return self.data_store.get_signature_by_invoice(invoice_number)
    
    def get_signature_image(self, invoice_number: str) -> Optional[Tuple[bytes, str]]:
        """
        获取签章图片内容
        
        Args:
            invoice_number: 发票号码
            
        Returns:
            (文件内容, 原始文件名) 或 None
        """
        signature = self.data_store.get_signature_by_invoice(invoice_number)
        if not signature:
            return None
        
        if not os.path.exists(signature.image_path):
            return None
        
        with open(signature.image_path, 'rb') as f:
            file_data = f.read()
        
        return file_data, signature.original_filename
    
    def update_position(self, invoice_number: str, position_x: float, 
                        position_y: float, width: float, height: float,
                        page_number: int = 0) -> Tuple[bool, str]:
        """
        更新签章位置和大小
        
        Args:
            invoice_number: 发票号码
            position_x: X坐标
            position_y: Y坐标
            width: 宽度
            height: 高度
            page_number: 页码
            
        Returns:
            (成功标志, 消息)
        """
        try:
            signature = self.data_store.get_signature_by_invoice(invoice_number)
            if not signature:
                return False, "签章不存在"
            
            success = self.data_store.update_signature_position(
                signature.id, position_x, position_y, width, height, page_number
            )
            
            if success:
                return True, "签章位置更新成功"
            else:
                return False, "更新失败"
                
        except Exception as e:
            return False, f"更新失败: {str(e)}"
    
    def delete_signature(self, invoice_number: str) -> Tuple[bool, str]:
        """
        删除发票的电子签章
        
        Args:
            invoice_number: 发票号码
            
        Returns:
            (成功标志, 消息)
        """
        try:
            signature = self.data_store.get_signature_by_invoice(invoice_number)
            if not signature:
                return False, "签章不存在"
            
            # 删除文件
            if os.path.exists(signature.image_path):
                os.remove(signature.image_path)
            
            # 删除目录（如果为空）
            signature_dir = self._get_signature_dir(invoice_number)
            if os.path.exists(signature_dir) and not os.listdir(signature_dir):
                os.rmdir(signature_dir)
            
            # 删除数据库记录
            self.data_store.delete_signature(signature.id)
            
            return True, "签章删除成功"
            
        except Exception as e:
            return False, f"签章删除失败: {str(e)}"
    
    def delete_signatures_by_invoice(self, invoice_number: str) -> Tuple[bool, str]:
        """
        删除发票的所有签章（用于发票删除时的级联删除）
        
        Args:
            invoice_number: 发票号码
            
        Returns:
            (成功标志, 消息)
        """
        try:
            # 删除文件目录
            signature_dir = self._get_signature_dir(invoice_number)
            if os.path.exists(signature_dir):
                shutil.rmtree(signature_dir)
            
            # 删除数据库记录
            self.data_store.delete_signatures_by_invoice(invoice_number)
            
            return True, "签章清理成功"
            
        except Exception as e:
            return False, f"签章清理失败: {str(e)}"
    
    def render_pdf_with_signature(self, invoice_number: str) -> Optional[Tuple[bytes, str]]:
        """
        渲染带签章的PDF
        
        Args:
            invoice_number: 发票号码
            
        Returns:
            (PDF二进制数据, 文件名) 或 None
        """
        try:
            # 获取签章信息
            signature = self.data_store.get_signature_by_invoice(invoice_number)
            if not signature:
                print(f"签章不存在: {invoice_number}")
                return None
            
            print(f"签章信息: position=({signature.position_x}, {signature.position_y}), size=({signature.width}, {signature.height}), path={signature.image_path}")
            
            # 获取原始PDF数据
            pdf_data = self.data_store.get_pdf_data(invoice_number)
            if not pdf_data:
                # 尝试从文件路径读取
                invoice = self.data_store.get_invoice_by_number(invoice_number)
                if not invoice:
                    print(f"发票不存在: {invoice_number}")
                    return None
                if not os.path.exists(invoice.file_path):
                    print(f"PDF文件不存在: {invoice.file_path}")
                    return None
                with open(invoice.file_path, 'rb') as f:
                    pdf_data = f.read()
            
            # 检查签章图片是否存在
            if not os.path.exists(signature.image_path):
                print(f"签章图片不存在: {signature.image_path}")
                return None
            
            # 使用PyMuPDF渲染签章
            try:
                import fitz  # PyMuPDF
                
                # 打开PDF
                doc = fitz.open(stream=pdf_data, filetype="pdf")
                
                # 获取指定页面
                page_num = min(signature.page_number, len(doc) - 1)
                page = doc[page_num]
                
                # 获取页面尺寸
                page_rect = page.rect
                page_width = page_rect.width
                page_height = page_rect.height
                print(f"PDF页面尺寸: {page_width} x {page_height}")
                
                # 计算签章位置，确保在页面范围内
                sig_width = min(signature.width, page_width)
                sig_height = min(signature.height, page_height)
                
                # 限制X坐标在页面范围内
                x = max(0, min(signature.position_x, page_width - sig_width))
                # 限制Y坐标在页面范围内
                y = max(0, min(signature.position_y, page_height - sig_height))
                
                # 插入签章图片
                # 注意：fitz使用的坐标系是从左上角开始的
                rect = fitz.Rect(x, y, x + sig_width, y + sig_height)
                
                print(f"原始签章位置: ({signature.position_x}, {signature.position_y})")
                print(f"调整后签章位置: {rect}")
                
                # 读取签章图片数据
                with open(signature.image_path, 'rb') as f:
                    img_data = f.read()
                
                page.insert_image(rect, stream=img_data)
                
                # 保存为新的PDF
                output_data = doc.tobytes()
                doc.close()
                
                print(f"PDF渲染成功，大小: {len(output_data)} bytes")
                
                filename = f"{invoice_number}_signed.pdf"
                return output_data, filename
                
            except ImportError as e:
                print(f"PyMuPDF未安装: {e}")
                # 如果没有安装PyMuPDF，尝试使用reportlab
                return self._render_with_reportlab(invoice_number, pdf_data, signature)
                
        except Exception as e:
            import traceback
            print(f"渲染带签章PDF失败: {str(e)}")
            traceback.print_exc()
            return None
    
    def _render_with_reportlab(self, invoice_number: str, pdf_data: bytes, 
                                signature: ElectronicSignature) -> Optional[Tuple[bytes, str]]:
        """
        使用reportlab渲染带签章的PDF（备用方案）
        
        Args:
            invoice_number: 发票号码
            pdf_data: 原始PDF数据
            signature: 签章信息
            
        Returns:
            (PDF二进制数据, 文件名) 或 None
        """
        try:
            from io import BytesIO
            from reportlab.pdfgen import canvas
            from reportlab.lib.utils import ImageReader
            from PyPDF2 import PdfReader, PdfWriter
            
            # 读取原始PDF
            original_pdf = PdfReader(BytesIO(pdf_data))
            output = PdfWriter()
            
            # 获取指定页面
            page_num = min(signature.page_number, len(original_pdf.pages) - 1)
            
            for i, page in enumerate(original_pdf.pages):
                if i == page_num:
                    # 创建签章覆盖层
                    packet = BytesIO()
                    page_width = float(page.mediabox.width)
                    page_height = float(page.mediabox.height)
                    
                    c = canvas.Canvas(packet, pagesize=(page_width, page_height))
                    
                    # 绘制签章图片
                    img = ImageReader(signature.image_path)
                    c.drawImage(
                        img,
                        signature.position_x,
                        page_height - signature.position_y - signature.height,  # 转换坐标系
                        width=signature.width,
                        height=signature.height,
                        mask='auto'
                    )
                    c.save()
                    
                    # 合并签章层到原始页面
                    packet.seek(0)
                    overlay_pdf = PdfReader(packet)
                    page.merge_page(overlay_pdf.pages[0])
                
                output.add_page(page)
            
            # 输出结果
            result = BytesIO()
            output.write(result)
            result.seek(0)
            
            filename = f"{invoice_number}_signed.pdf"
            return result.read(), filename
            
        except ImportError as e:
            print(f"缺少必要的库: {str(e)}")
            return None
        except Exception as e:
            print(f"reportlab渲染失败: {str(e)}")
            return None

    # ========== 签章库相关方法 ==========
    
    def _get_template_storage_path(self) -> str:
        """获取签章模板存储路径"""
        return os.path.join(self.storage_base_path, "_templates")
    
    def upload_template(self, name: str, file_data: bytes, 
                        original_filename: str) -> Tuple[bool, str, Optional[SignatureTemplate]]:
        """
        上传签章模板到签章库
        
        Args:
            name: 签章名称
            file_data: 文件二进制数据
            original_filename: 原始文件名
            
        Returns:
            (成功标志, 消息, SignatureTemplate对象或None)
        """
        try:
            # 创建模板存储目录
            template_dir = self._get_template_storage_path()
            if not os.path.exists(template_dir):
                os.makedirs(template_dir)
            
            # 生成唯一文件名
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            ext = original_filename.rsplit('.', 1)[-1] if '.' in original_filename else 'png'
            unique_filename = f"{timestamp}_{original_filename}"
            file_path = os.path.join(template_dir, unique_filename)
            
            # 保存文件
            with open(file_path, 'wb') as f:
                f.write(file_data)
            
            # 创建模板记录
            template = SignatureTemplate(
                id=None,
                name=name,
                image_path=file_path,
                original_filename=original_filename,
                upload_time=datetime.now()
            )
            
            template_id = self.data_store.insert_signature_template(template)
            template.id = template_id
            
            return True, "签章模板上传成功", template
            
        except Exception as e:
            return False, f"签章模板上传失败: {str(e)}", None
    
    def get_all_templates(self) -> list:
        """
        获取所有签章模板
        
        Returns:
            签章模板列表
        """
        return self.data_store.get_all_signature_templates()
    
    def get_template_by_id(self, template_id: int) -> Optional[SignatureTemplate]:
        """
        根据ID获取签章模板
        
        Args:
            template_id: 模板ID
            
        Returns:
            SignatureTemplate对象或None
        """
        return self.data_store.get_signature_template_by_id(template_id)
    
    def get_template_image(self, template_id: int) -> Optional[Tuple[bytes, str]]:
        """
        获取签章模板图片内容
        
        Args:
            template_id: 模板ID
            
        Returns:
            (文件内容, 原始文件名) 或 None
        """
        template = self.data_store.get_signature_template_by_id(template_id)
        if not template:
            return None
        
        if not os.path.exists(template.image_path):
            return None
        
        with open(template.image_path, 'rb') as f:
            file_data = f.read()
        
        return file_data, template.original_filename
    
    def delete_template(self, template_id: int) -> Tuple[bool, str]:
        """
        删除签章模板
        
        Args:
            template_id: 模板ID
            
        Returns:
            (成功标志, 消息)
        """
        try:
            template = self.data_store.get_signature_template_by_id(template_id)
            if not template:
                return False, "签章模板不存在"
            
            # 删除文件
            if os.path.exists(template.image_path):
                os.remove(template.image_path)
            
            # 删除数据库记录
            self.data_store.delete_signature_template(template_id)
            
            return True, "签章模板删除成功"
            
        except Exception as e:
            return False, f"签章模板删除失败: {str(e)}"
    
    def apply_template_to_invoice(self, invoice_number: str, template_id: int,
                                   position_x: float = 400, position_y: float = 700,
                                   width: float = 100, height: float = 100,
                                   page_number: int = 0) -> Tuple[bool, str, Optional[ElectronicSignature]]:
        """
        将签章模板应用到发票
        
        Args:
            invoice_number: 发票号码
            template_id: 签章模板ID
            position_x: X坐标
            position_y: Y坐标
            width: 宽度
            height: 高度
            page_number: 页码
            
        Returns:
            (成功标志, 消息, ElectronicSignature对象或None)
        """
        try:
            # 检查发票是否存在
            invoice = self.data_store.get_invoice_by_number(invoice_number)
            if not invoice:
                return False, "发票不存在", None
            
            # 获取签章模板
            template = self.data_store.get_signature_template_by_id(template_id)
            if not template:
                return False, "签章模板不存在", None
            
            # 检查模板文件是否存在
            if not os.path.exists(template.image_path):
                return False, "签章模板文件不存在", None
            
            # 读取模板文件
            with open(template.image_path, 'rb') as f:
                file_data = f.read()
            
            # 使用现有的上传方法
            return self.upload_signature(
                invoice_number, file_data, template.original_filename,
                position_x, position_y, width, height, page_number
            )
            
        except Exception as e:
            return False, f"应用签章模板失败: {str(e)}", None
