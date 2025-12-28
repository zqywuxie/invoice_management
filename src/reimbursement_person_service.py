"""
ReimbursementPersonService for reimbursement person management.
报销人服务 - 负责报销人信息的存储、查询和选择
"""

from datetime import datetime
from typing import List, Optional

from src.models import ReimbursementPerson
from src.sqlite_data_store import SQLiteDataStore


class ReimbursementPersonService:
    """
    报销人服务类，负责报销人的管理操作
    """
    
    def __init__(self, data_store: SQLiteDataStore):
        """
        初始化报销人服务
        
        Args:
            data_store: SQLite数据存储实例
        """
        self.data_store = data_store
    
    def add_person(self, name: str) -> ReimbursementPerson:
        """
        添加新报销人
        
        Args:
            name: 报销人姓名
            
        Returns:
            创建的ReimbursementPerson对象
            
        Raises:
            ValueError: 姓名为空或已存在时抛出
        """
        if not name or not name.strip():
            raise ValueError("报销人姓名不能为空")
        
        name = name.strip()
        
        # Check if person already exists
        existing = self.data_store.get_person_by_name(name)
        if existing:
            raise ValueError(f"报销人 '{name}' 已存在")
        
        # Create person record
        person = ReimbursementPerson(
            id=None,
            name=name,
            created_time=datetime.now()
        )
        
        # Insert into database and get ID
        person_id = self.data_store.insert_person(person)
        person.id = person_id
        
        return person
    
    def get_all_persons(self) -> List[ReimbursementPerson]:
        """
        获取所有报销人列表
        
        Returns:
            报销人列表，按姓名排序
        """
        return self.data_store.get_all_persons()
    
    def get_person_by_name(self, name: str) -> Optional[ReimbursementPerson]:
        """
        根据姓名获取报销人
        
        Args:
            name: 报销人姓名
            
        Returns:
            ReimbursementPerson对象，如果不存在则返回None
        """
        if not name or not name.strip():
            return None
        
        return self.data_store.get_person_by_name(name.strip())
    
    def get_or_create_person(self, name: str) -> ReimbursementPerson:
        """
        获取或创建报销人（存在则返回，不存在则创建）
        
        Args:
            name: 报销人姓名
            
        Returns:
            ReimbursementPerson对象
            
        Raises:
            ValueError: 姓名为空时抛出
        """
        if not name or not name.strip():
            raise ValueError("报销人姓名不能为空")
        
        name = name.strip()
        
        # Try to get existing person
        existing = self.data_store.get_person_by_name(name)
        if existing:
            return existing
        
        # Create new person
        person = ReimbursementPerson(
            id=None,
            name=name,
            created_time=datetime.now()
        )
        
        person_id = self.data_store.insert_person(person)
        person.id = person_id
        
        return person
