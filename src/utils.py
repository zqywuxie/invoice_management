"""
工具函数模块
提供通用的工具函数、装饰器和辅助类
"""

import logging
import functools
import time
from typing import Any, Callable, Optional, TypeVar, Union
from datetime import datetime
from decimal import Decimal

# 配置日志
logger = logging.getLogger(__name__)

# 类型变量
T = TypeVar('T')
F = TypeVar('F', bound=Callable[..., Any])


# ============================================
# 装饰器 - Decorators
# ============================================

def retry(max_attempts: int = 3, delay: float = 1.0, backoff: float = 2.0):
    """
    重试装饰器 - 自动重试失败的函数
    
    Args:
        max_attempts: 最大尝试次数
        delay: 初始延迟时间(秒)
        backoff: 延迟倍增因子
    """
    def decorator(func: F) -> F:
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            current_delay = delay
            last_exception = None
            
            for attempt in range(max_attempts):
                try:
                    return func(*args, **kwargs)
                except Exception as e:
                    last_exception = e
                    logger.warning(
                        f"函数 {func.__name__} 第 {attempt + 1}/{max_attempts} 次尝试失败: {str(e)}"
                    )
                    
                    if attempt < max_attempts - 1:
                        time.sleep(current_delay)
                        current_delay *= backoff
            
            logger.error(f"函数 {func.__name__} 在 {max_attempts} 次尝试后仍然失败")
            raise last_exception
        
        return wrapper
    return decorator


def log_execution(level: int = logging.INFO):
    """
    日志装饰器 - 记录函数执行信息
    
    Args:
        level: 日志级别
    """
    def decorator(func: F) -> F:
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            func_name = func.__name__
            logger.log(level, f"开始执行: {func_name}")
            start_time = time.time()
            
            try:
                result = func(*args, **kwargs)
                elapsed = time.time() - start_time
                logger.log(level, f"完成执行: {func_name} (耗时: {elapsed:.2f}秒)")
                return result
            except Exception as e:
                elapsed = time.time() - start_time
                logger.error(f"执行失败: {func_name} (耗时: {elapsed:.2f}秒) - {str(e)}")
                raise
        
        return wrapper
    return decorator


def validate_params(**validators):
    """
    参数验证装饰器
    
    Example:
        @validate_params(name=lambda x: isinstance(x, str) and len(x) > 0)
        def create_user(name: str):
            pass
    """
    def decorator(func: F) -> F:
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            # 获取函数参数名
            import inspect
            sig = inspect.signature(func)
            bound_args = sig.bind(*args, **kwargs)
            bound_args.apply_defaults()
            
            # 验证参数
            for param_name, validator in validators.items():
                if param_name in bound_args.arguments:
                    value = bound_args.arguments[param_name]
                    if not validator(value):
                        raise ValueError(f"参数 {param_name} 验证失败: {value}")
            
            return func(*args, **kwargs)
        
        return wrapper
    return decorator


def cache_result(ttl: Optional[int] = None):
    """
    结果缓存装饰器
    
    Args:
        ttl: 缓存过期时间(秒),None表示永不过期
    """
    def decorator(func: F) -> F:
        cache = {}
        cache_times = {}
        
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            # 创建缓存键
            key = str(args) + str(kwargs)
            current_time = time.time()
            
            # 检查缓存
            if key in cache:
                if ttl is None or (current_time - cache_times[key]) < ttl:
                    logger.debug(f"使用缓存结果: {func.__name__}")
                    return cache[key]
            
            # 执行函数并缓存结果
            result = func(*args, **kwargs)
            cache[key] = result
            cache_times[key] = current_time
            
            return result
        
        # 添加清除缓存的方法
        wrapper.clear_cache = lambda: cache.clear()
        
        return wrapper
    return decorator


# ============================================
# 数据验证 - Validation
# ============================================

class Validator:
    """数据验证器"""
    
    @staticmethod
    def is_valid_amount(amount: Union[str, float, Decimal]) -> bool:
        """验证金额是否有效"""
        try:
            decimal_amount = Decimal(str(amount))
            return decimal_amount >= 0
        except (ValueError, TypeError):
            return False
    
    @staticmethod
    def is_valid_date(date_str: str, format: str = '%Y-%m-%d') -> bool:
        """验证日期格式是否有效"""
        try:
            datetime.strptime(date_str, format)
            return True
        except (ValueError, TypeError):
            return False
    
    @staticmethod
    def is_valid_invoice_number(invoice_number: str) -> bool:
        """验证发票号码格式"""
        if not invoice_number or not isinstance(invoice_number, str):
            return False
        # 发票号码通常是数字和字母的组合,长度在8-20之间
        return 8 <= len(invoice_number.strip()) <= 20
    
    @staticmethod
    def is_not_empty(value: Any) -> bool:
        """验证值不为空"""
        if value is None:
            return False
        if isinstance(value, str):
            return len(value.strip()) > 0
        return True


# ============================================
# 数据格式化 - Formatting
# ============================================

class Formatter:
    """数据格式化器"""
    
    @staticmethod
    def format_amount(amount: Union[str, float, Decimal], precision: int = 2) -> str:
        """格式化金额"""
        try:
            decimal_amount = Decimal(str(amount))
            return f"{decimal_amount:.{precision}f}"
        except (ValueError, TypeError):
            return "0.00"
    
    @staticmethod
    def format_date(date: Union[str, datetime], format: str = '%Y-%m-%d') -> str:
        """格式化日期"""
        if isinstance(date, str):
            return date
        if isinstance(date, datetime):
            return date.strftime(format)
        return ""
    
    @staticmethod
    def truncate_text(text: str, max_length: int = 50, suffix: str = "...") -> str:
        """截断文本"""
        if not text or len(text) <= max_length:
            return text
        return text[:max_length - len(suffix)] + suffix
    
    @staticmethod
    def sanitize_filename(filename: str) -> str:
        """清理文件名,移除非法字符"""
        import re
        # 移除或替换非法字符
        sanitized = re.sub(r'[<>:"/\\|?*]', '_', filename)
        # 移除前后空格
        sanitized = sanitized.strip()
        # 限制长度
        if len(sanitized) > 255:
            name, ext = sanitized.rsplit('.', 1) if '.' in sanitized else (sanitized, '')
            sanitized = name[:255 - len(ext) - 1] + ('.' + ext if ext else '')
        return sanitized


# ============================================
# 错误处理 - Error Handling
# ============================================

class AppError(Exception):
    """应用基础异常类"""
    
    def __init__(self, message: str, code: str = "ERROR", details: Optional[dict] = None):
        self.message = message
        self.code = code
        self.details = details or {}
        super().__init__(self.message)
    
    def to_dict(self) -> dict:
        """转换为字典"""
        return {
            'error': True,
            'code': self.code,
            'message': self.message,
            'details': self.details
        }


class ValidationError(AppError):
    """数据验证错误"""
    
    def __init__(self, message: str, field: Optional[str] = None, **kwargs):
        details = {'field': field} if field else {}
        details.update(kwargs)
        super().__init__(message, code="VALIDATION_ERROR", details=details)


class NotFoundError(AppError):
    """资源未找到错误"""
    
    def __init__(self, resource: str, identifier: Any):
        message = f"{resource} 未找到: {identifier}"
        super().__init__(message, code="NOT_FOUND", details={'resource': resource, 'identifier': str(identifier)})


class DuplicateError(AppError):
    """重复数据错误"""
    
    def __init__(self, resource: str, identifier: Any):
        message = f"{resource} 已存在: {identifier}"
        super().__init__(message, code="DUPLICATE", details={'resource': resource, 'identifier': str(identifier)})


class PermissionError(AppError):
    """权限错误"""
    
    def __init__(self, action: str, resource: str):
        message = f"无权限执行操作: {action} on {resource}"
        super().__init__(message, code="PERMISSION_DENIED", details={'action': action, 'resource': resource})


# ============================================
# 响应构建器 - Response Builder
# ============================================

class ResponseBuilder:
    """API响应构建器"""
    
    @staticmethod
    def success(data: Any = None, message: str = "操作成功") -> dict:
        """构建成功响应"""
        response = {
            'success': True,
            'message': message
        }
        if data is not None:
            response['data'] = data
        return response
    
    @staticmethod
    def error(message: str, code: str = "ERROR", details: Optional[dict] = None) -> dict:
        """构建错误响应"""
        response = {
            'success': False,
            'error': True,
            'code': code,
            'message': message
        }
        if details:
            response['details'] = details
        return response
    
    @staticmethod
    def paginated(items: list, total: int, page: int, page_size: int, **kwargs) -> dict:
        """构建分页响应"""
        total_pages = (total + page_size - 1) // page_size if page_size > 0 else 0
        
        return {
            'success': True,
            'data': items,
            'pagination': {
                'total': total,
                'page': page,
                'page_size': page_size,
                'total_pages': total_pages,
                'has_next': page < total_pages,
                'has_prev': page > 1
            },
            **kwargs
        }


# ============================================
# 性能监控 - Performance Monitoring
# ============================================

class PerformanceMonitor:
    """性能监控器"""
    
    def __init__(self, name: str):
        self.name = name
        self.start_time = None
        self.end_time = None
    
    def __enter__(self):
        self.start_time = time.time()
        logger.debug(f"[性能监控] 开始: {self.name}")
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        self.end_time = time.time()
        elapsed = self.end_time - self.start_time
        
        if exc_type is None:
            logger.info(f"[性能监控] 完成: {self.name} (耗时: {elapsed:.3f}秒)")
        else:
            logger.error(f"[性能监控] 失败: {self.name} (耗时: {elapsed:.3f}秒) - {exc_val}")
        
        return False  # 不抑制异常


# ============================================
# 批处理工具 - Batch Processing
# ============================================

def batch_process(items: list, batch_size: int = 100, processor: Callable = None):
    """
    批量处理数据
    
    Args:
        items: 要处理的项目列表
        batch_size: 批次大小
        processor: 处理函数
    
    Yields:
        处理结果
    """
    total = len(items)
    for i in range(0, total, batch_size):
        batch = items[i:i + batch_size]
        logger.debug(f"处理批次 {i // batch_size + 1} (项目 {i + 1}-{min(i + batch_size, total)}/{total})")
        
        if processor:
            yield processor(batch)
        else:
            yield batch


# ============================================
# 安全工具 - Security Utilities
# ============================================

class SecurityUtils:
    """安全工具类"""
    
    @staticmethod
    def sanitize_sql_like(value: str) -> str:
        """清理SQL LIKE查询中的特殊字符"""
        if not value:
            return ""
        # 转义特殊字符
        return value.replace('%', '\\%').replace('_', '\\_')
    
    @staticmethod
    def mask_sensitive_data(data: str, visible_chars: int = 4) -> str:
        """遮蔽敏感数据"""
        if not data or len(data) <= visible_chars:
            return data
        return data[:visible_chars] + '*' * (len(data) - visible_chars)


# ============================================
# 导出所有工具
# ============================================

__all__ = [
    'retry',
    'log_execution',
    'validate_params',
    'cache_result',
    'Validator',
    'Formatter',
    'AppError',
    'ValidationError',
    'NotFoundError',
    'DuplicateError',
    'PermissionError',
    'ResponseBuilder',
    'PerformanceMonitor',
    'batch_process',
    'SecurityUtils',
]
