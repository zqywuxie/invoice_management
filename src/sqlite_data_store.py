"""
SQLiteDataStore for SQLite database persistence.
SQLite数据存储模块 - 负责发票数据的SQLite数据库存储
"""

import os
import sqlite3
import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional

import hashlib
from src.models import Invoice, User, ExpenseVoucher, ReimbursementPerson, Contract, ElectronicSignature, SignatureTemplate


class SQLiteDataStore:
    """
    SQLite数据存储类，负责发票数据的数据库存储和查询
    """
    
    DEFAULT_DB_PATH = "data/invoices.db"
    
    def __init__(self, db_path: str = None):
        """
        初始化数据库连接
        
        Args:
            db_path: 数据库文件路径，默认为 "data/invoices.db"
        """
        self.db_path = db_path or self.DEFAULT_DB_PATH
        self._memory_keeper: Optional[sqlite3.Connection] = None
        self._memory_uri: Optional[str] = None
        self._is_memory_db = self.db_path == ':memory:'
        if self._is_memory_db:
            self._memory_uri = f"file:invoice_mgmt_{uuid.uuid4().hex}?mode=memory&cache=shared"
            self._memory_keeper = sqlite3.connect(self._memory_uri, uri=True, check_same_thread=False)
            self._configure_connection(self._memory_keeper)
        self._ensure_data_dir()
        self._init_database()
    
    def _ensure_data_dir(self) -> None:
        """确保数据目录存在"""
        data_dir = os.path.dirname(self.db_path)
        if data_dir and not os.path.exists(data_dir):
            os.makedirs(data_dir)
    
    def _get_connection(self) -> sqlite3.Connection:
        """获取数据库连接"""
        if self._is_memory_db and self._memory_uri:
            conn = sqlite3.connect(self._memory_uri, uri=True, check_same_thread=False)
        else:
            conn = sqlite3.connect(self.db_path)
        self._configure_connection(conn)
        return conn

    def _configure_connection(self, conn: sqlite3.Connection) -> None:
        """Apply per-connection pragmas."""
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA busy_timeout = 3000")
    
    def _init_database(self) -> None:
        """创建数据库表结构和索引"""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            if not self._is_memory_db:
                cursor.execute("PRAGMA journal_mode=WAL")
                cursor.execute("PRAGMA synchronous=NORMAL")
            
            # Create invoices table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS invoices (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    invoice_number TEXT UNIQUE NOT NULL,
                    invoice_date TEXT NOT NULL,
                    item_name TEXT NOT NULL,
                    amount TEXT NOT NULL,
                    remark TEXT,
                    file_path TEXT NOT NULL,
                    scan_time TEXT NOT NULL
                )
            """)
            
            # Create users table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    display_name TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    is_admin INTEGER DEFAULT 0
                )
            """)

            cursor.execute("""
                CREATE TABLE IF NOT EXISTS user_preferences (
                    username TEXT NOT NULL,
                    pref_key TEXT NOT NULL,
                    pref_value TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    PRIMARY KEY (username, pref_key)
                )
            """)
            
            # Add is_admin column if it doesn't exist (migration)
            self._migrate_add_is_admin_column(cursor)
            
            # Create indexes for invoice_number and invoice_date
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_invoice_number 
                ON invoices(invoice_number)
            """)
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_invoice_date 
                ON invoices(invoice_date)
            """)
            
            # Add pdf_data column if it doesn't exist (migration for existing databases)
            self._migrate_add_pdf_column(cursor)
            
            # Add uploaded_by column if it doesn't exist
            self._migrate_add_uploaded_by_column(cursor)
            
            # Add reimbursement_person_id column if it doesn't exist
            self._migrate_add_reimbursement_person_id_column(cursor)
            
            # Add reimbursement_status column if it doesn't exist
            self._migrate_add_reimbursement_status_column(cursor)
            
            # Add record_type column if it doesn't exist
            self._migrate_add_record_type_column(cursor)
            
            # Create expense_vouchers table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS expense_vouchers (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    invoice_number TEXT NOT NULL,
                    file_path TEXT NOT NULL,
                    original_filename TEXT NOT NULL,
                    upload_time TEXT NOT NULL,
                    FOREIGN KEY (invoice_number) REFERENCES invoices(invoice_number)
                )
            """)
            
            # Create index for voucher invoice_number
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_voucher_invoice 
                ON expense_vouchers(invoice_number)
            """)
            
            # Create reimbursement_persons table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS reimbursement_persons (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL UNIQUE,
                    created_time TEXT NOT NULL
                )
            """)
            
            # Create index for person name
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_person_name 
                ON reimbursement_persons(name)
            """)
            
            # Create contracts table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS contracts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    invoice_number TEXT NOT NULL,
                    file_path TEXT NOT NULL,
                    original_filename TEXT NOT NULL,
                    upload_time TEXT NOT NULL,
                    FOREIGN KEY (invoice_number) REFERENCES invoices(invoice_number)
                )
            """)
            
            # Create index for contract invoice_number
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_contract_invoice 
                ON contracts(invoice_number)
            """)
            
            # Create electronic_signatures table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS electronic_signatures (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    invoice_number TEXT NOT NULL,
                    image_path TEXT NOT NULL,
                    original_filename TEXT NOT NULL,
                    position_x REAL DEFAULT 0,
                    position_y REAL DEFAULT 0,
                    width REAL DEFAULT 100,
                    height REAL DEFAULT 100,
                    page_number INTEGER DEFAULT 0,
                    upload_time TEXT NOT NULL,
                    FOREIGN KEY (invoice_number) REFERENCES invoices(invoice_number)
                )
            """)
            
            # Create index for signature invoice_number
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_signature_invoice 
                ON electronic_signatures(invoice_number)
            """)
            
            # Create signature_templates table (签章库)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS signature_templates (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    image_path TEXT NOT NULL,
                    original_filename TEXT NOT NULL,
                    upload_time TEXT NOT NULL
                )
            """)
            
            # Create default admin user if no users exist
            self._create_default_user(cursor)
            
            conn.commit()
    
    def _migrate_add_pdf_column(self, cursor: sqlite3.Cursor) -> None:
        """
        迁移：添加pdf_data列（如果不存在）
        
        Args:
            cursor: 数据库游标
        """
        # Check if pdf_data column exists
        cursor.execute("PRAGMA table_info(invoices)")
        columns = [col[1] for col in cursor.fetchall()]
        
        if 'pdf_data' not in columns:
            cursor.execute("ALTER TABLE invoices ADD COLUMN pdf_data BLOB")
    
    def _migrate_add_uploaded_by_column(self, cursor: sqlite3.Cursor) -> None:
        """
        迁移：添加uploaded_by列（如果不存在）
        """
        cursor.execute("PRAGMA table_info(invoices)")
        columns = [col[1] for col in cursor.fetchall()]
        
        if 'uploaded_by' not in columns:
            cursor.execute("ALTER TABLE invoices ADD COLUMN uploaded_by TEXT DEFAULT ''")
    
    def _migrate_add_reimbursement_person_id_column(self, cursor: sqlite3.Cursor) -> None:
        """
        迁移：添加reimbursement_person_id列（如果不存在）
        """
        cursor.execute("PRAGMA table_info(invoices)")
        columns = [col[1] for col in cursor.fetchall()]
        
        if 'reimbursement_person_id' not in columns:
            cursor.execute("""
                ALTER TABLE invoices 
                ADD COLUMN reimbursement_person_id INTEGER 
                REFERENCES reimbursement_persons(id)
            """)
    
    def _migrate_add_reimbursement_status_column(self, cursor: sqlite3.Cursor) -> None:
        """
        迁移：添加reimbursement_status列（如果不存在）
        """
        cursor.execute("PRAGMA table_info(invoices)")
        columns = [col[1] for col in cursor.fetchall()]
        
        if 'reimbursement_status' not in columns:
            cursor.execute("""
                ALTER TABLE invoices 
                ADD COLUMN reimbursement_status TEXT DEFAULT '未报销'
            """)
    
    def _migrate_add_is_admin_column(self, cursor: sqlite3.Cursor) -> None:
        """
        迁移：添加is_admin列（如果不存在）
        """
        cursor.execute("PRAGMA table_info(users)")
        columns = [col[1] for col in cursor.fetchall()]
        
        if 'is_admin' not in columns:
            cursor.execute("ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0")
            # 将现有的admin用户设为管理员
            cursor.execute("UPDATE users SET is_admin = 1 WHERE username = 'admin'")
    
    def _migrate_add_record_type_column(self, cursor: sqlite3.Cursor) -> None:
        """
        迁移：添加record_type列（如果不存在）
        """
        cursor.execute("PRAGMA table_info(invoices)")
        columns = [col[1] for col in cursor.fetchall()]
        
        if 'record_type' not in columns:
            cursor.execute("ALTER TABLE invoices ADD COLUMN record_type TEXT DEFAULT 'invoice'")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_record_type ON invoices(record_type)")
    
    def _create_default_user(self, cursor: sqlite3.Cursor) -> None:
        """创建默认管理员用户"""
        cursor.execute("SELECT COUNT(*) FROM users")
        if cursor.fetchone()[0] == 0:
            password_hash = hashlib.sha256("admin123".encode()).hexdigest()
            cursor.execute("""
                INSERT INTO users (username, password_hash, display_name, created_at, is_admin)
                VALUES (?, ?, ?, ?, ?)
            """, ("admin", password_hash, "管理员", datetime.now().isoformat(), 1))
    
    # ========== 用户相关方法 ==========
    
    def get_user_by_username(self, username: str) -> Optional[User]:
        """根据用户名获取用户"""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id, username, password_hash, display_name, created_at, is_admin FROM users WHERE username = ?", (username,))
            row = cursor.fetchone()
            if row:
                return User(
                    id=row[0],
                    username=row[1],
                    password_hash=row[2],
                    display_name=row[3],
                    created_at=datetime.fromisoformat(row[4]),
                    is_admin=bool(row[5]) if row[5] is not None else False
                )
            return None
    
    def verify_user(self, username: str, password: str) -> Optional[User]:
        """验证用户登录"""
        user = self.get_user_by_username(username)
        if user:
            password_hash = hashlib.sha256(password.encode()).hexdigest()
            if user.password_hash == password_hash:
                return user
        return None
    
    def create_user(self, username: str, password: str, display_name: str, is_admin: bool = False) -> bool:
        """创建新用户"""
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                password_hash = hashlib.sha256(password.encode()).hexdigest()
                cursor.execute("""
                    INSERT INTO users (username, password_hash, display_name, created_at, is_admin)
                    VALUES (?, ?, ?, ?, ?)
                """, (username, password_hash, display_name, datetime.now().isoformat(), 1 if is_admin else 0))
                conn.commit()
                return True
        except sqlite3.IntegrityError:
            return False
    
    def get_all_users(self) -> List[User]:
        """获取所有用户"""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id, username, password_hash, display_name, created_at, is_admin FROM users ORDER BY created_at DESC")
            rows = cursor.fetchall()
            return [
                User(
                    id=row[0],
                    username=row[1],
                    password_hash=row[2],
                    display_name=row[3],
                    created_at=datetime.fromisoformat(row[4]),
                    is_admin=bool(row[5]) if row[5] is not None else False
                )
                for row in rows
            ]
    
    def update_user(self, user_id: int, display_name: str = None, is_admin: bool = None, password: str = None) -> bool:
        """更新用户信息"""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            updates = []
            params = []
            
            if display_name is not None:
                updates.append("display_name = ?")
                params.append(display_name)
            if is_admin is not None:
                updates.append("is_admin = ?")
                params.append(1 if is_admin else 0)
            if password is not None:
                updates.append("password_hash = ?")
                params.append(hashlib.sha256(password.encode()).hexdigest())
            
            if not updates:
                return False
            
            params.append(user_id)
            cursor.execute(f"UPDATE users SET {', '.join(updates)} WHERE id = ?", params)
            conn.commit()
            return cursor.rowcount > 0
    
    def delete_user(self, user_id: int) -> bool:
        """删除用户"""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM users WHERE id = ?", (user_id,))
            conn.commit()
            return cursor.rowcount > 0

    def get_user_preference(self, username: str, pref_key: str) -> Optional[str]:
        """Get a user preference value by key."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT pref_value FROM user_preferences WHERE username = ? AND pref_key = ?",
                (username, pref_key)
            )
            row = cursor.fetchone()
            return row[0] if row else None

    def set_user_preference(self, username: str, pref_key: str, pref_value: str) -> bool:
        """Insert or update a user preference value by key."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO user_preferences (username, pref_key, pref_value, updated_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(username, pref_key) DO UPDATE SET
                    pref_value = excluded.pref_value,
                    updated_at = excluded.updated_at
            """, (username, pref_key, pref_value, datetime.now().isoformat()))
            conn.commit()
            return True

    def serialize_invoice(self, invoice: Invoice) -> tuple:
        """
        将Invoice对象序列化为数据库元组
        
        Args:
            invoice: Invoice对象
            
        Returns:
            包含发票数据的元组，用于数据库插入
        """
        return (
            invoice.invoice_number,
            invoice.invoice_date,
            invoice.item_name,
            str(invoice.amount),
            invoice.remark,
            invoice.file_path,
            invoice.scan_time.isoformat(),
            invoice.uploaded_by,
            invoice.reimbursement_person_id,
            invoice.reimbursement_status,
            invoice.record_type
        )
    
    def deserialize_invoice(self, row: tuple) -> Invoice:
        """
        将数据库行反序列化为Invoice对象
        
        Args:
            row: 数据库查询结果行 (id, invoice_number, invoice_date, item_name, 
                 amount, remark, file_path, scan_time, pdf_data, uploaded_by, 
                 reimbursement_person_id, reimbursement_status, record_type)
            
        Returns:
            Invoice对象
        """
        # Handle both old format and new format with reimbursement_status and record_type
        uploaded_by = row[9] if len(row) > 9 else ""
        reimbursement_person_id = row[10] if len(row) > 10 else None
        reimbursement_status = row[11] if len(row) > 11 else "未报销"
        record_type = row[12] if len(row) > 12 else "invoice"
        return Invoice(
            invoice_number=row[1],
            invoice_date=row[2],
            item_name=row[3],
            amount=Decimal(row[4]),
            remark=row[5] or "",
            file_path=row[6],
            scan_time=datetime.fromisoformat(row[7]),
            uploaded_by=uploaded_by or "",
            reimbursement_person_id=reimbursement_person_id,
            reimbursement_status=reimbursement_status or "未报销",
            record_type=record_type or "invoice"
        )
    
    def insert(self, invoice: Invoice) -> None:
        """
        插入单条发票记录
        
        Args:
            invoice: 要插入的Invoice对象
            
        Raises:
            sqlite3.IntegrityError: 发票号码重复时抛出
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()
            data = self.serialize_invoice(invoice)
            cursor.execute("""
                INSERT INTO invoices 
                (invoice_number, invoice_date, item_name, amount, remark, file_path, scan_time, uploaded_by, reimbursement_person_id, reimbursement_status, record_type)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, data)
            conn.commit()
    
    def delete(self, invoice_number: str) -> bool:
        """
        删除指定发票号码的记录
        
        Args:
            invoice_number: 要删除的发票号码
            
        Returns:
            True表示删除成功，False表示未找到记录
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "DELETE FROM invoices WHERE invoice_number = ?",
                (invoice_number,)
            )
            conn.commit()
            return cursor.rowcount > 0
    
    def update_invoice(self, invoice: Invoice) -> bool:
        """
        更新发票记录
        
        Args:
            invoice: 要更新的Invoice对象
            
        Returns:
            True表示更新成功，False表示未找到记录
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                UPDATE invoices 
                SET invoice_date = ?,
                    item_name = ?,
                    amount = ?,
                    remark = ?
                WHERE invoice_number = ?
            """, (
                invoice.invoice_date,
                invoice.item_name,
                str(invoice.amount),
                invoice.remark,
                invoice.invoice_number
            ))
            conn.commit()
            return cursor.rowcount > 0
    
    def load_all(self) -> List[Invoice]:
        """
        加载所有发票记录
        
        Returns:
            发票列表
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM invoices")
            rows = cursor.fetchall()
            return [self.deserialize_invoice(row) for row in rows]
    
    def search(self, keyword: str) -> List[Invoice]:
        """
        搜索发票记录，在所有文本字段中查找关键词
        
        Args:
            keyword: 搜索关键词
            
        Returns:
            匹配的发票列表
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()
            search_pattern = f"%{keyword}%"
            cursor.execute("""
                SELECT * FROM invoices 
                WHERE invoice_number LIKE ?
                   OR invoice_date LIKE ?
                   OR item_name LIKE ?
                   OR amount LIKE ?
                   OR remark LIKE ?
                   OR file_path LIKE ?
            """, (search_pattern,) * 6)
            rows = cursor.fetchall()
            return [self.deserialize_invoice(row) for row in rows]

    def _build_invoice_filters(self, filters: Optional[Dict[str, Any]] = None) -> tuple[str, List[Any]]:
        """Build SQL WHERE clauses and params for invoice listing."""
        filters = filters or {}
        clauses: List[str] = []
        params: List[Any] = []

        search = str(filters.get('search') or '').strip()
        if search:
            pattern = f"%{search}%"
            clauses.append(
                "(i.invoice_number LIKE ? OR i.invoice_date LIKE ? OR i.item_name LIKE ? "
                "OR i.amount LIKE ? OR i.remark LIKE ? OR i.file_path LIKE ?)"
            )
            params.extend([pattern] * 6)

        start_date = str(filters.get('start_date') or '').strip()
        if start_date:
            clauses.append("i.invoice_date >= ?")
            params.append(start_date)

        end_date = str(filters.get('end_date') or '').strip()
        if end_date:
            clauses.append("i.invoice_date <= ?")
            params.append(end_date)

        reimbursement_person_id = filters.get('reimbursement_person_id')
        if reimbursement_person_id not in (None, ''):
            try:
                clauses.append("i.reimbursement_person_id = ?")
                params.append(int(reimbursement_person_id))
            except (TypeError, ValueError):
                pass

        uploaded_by = str(filters.get('uploaded_by') or '').strip()
        if uploaded_by:
            clauses.append("i.uploaded_by = ?")
            params.append(uploaded_by)

        reimbursement_status = str(filters.get('reimbursement_status') or '').strip()
        if reimbursement_status:
            clauses.append("i.reimbursement_status = ?")
            params.append(reimbursement_status)

        record_type = str(filters.get('record_type') or '').strip()
        if record_type in ('invoice', 'manual'):
            clauses.append("i.record_type = ?")
            params.append(record_type)

        where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        return where_sql, params

    def query_invoices(
        self,
        filters: Optional[Dict[str, Any]] = None,
        page: int = 1,
        page_size: int = 20
    ) -> Dict[str, Any]:
        """
        Query invoices with DB-side filtering, pagination and aggregated stats.
        """
        page = max(int(page or 1), 1)
        page_size = min(max(int(page_size or 20), 1), 100)
        offset = (page - 1) * page_size

        where_sql, params = self._build_invoice_filters(filters)

        with self._get_connection() as conn:
            cursor = conn.cursor()

            cursor.execute(f"SELECT COUNT(*) FROM invoices i {where_sql}", params)
            total_count = int(cursor.fetchone()[0] or 0)
            total_pages = (total_count + page_size - 1) // page_size if total_count else 0

            cursor.execute(
                f"""
                SELECT
                    i.id, i.invoice_number, i.invoice_date, i.item_name, i.amount,
                    i.remark, i.file_path, i.scan_time, i.pdf_data, i.uploaded_by,
                    i.reimbursement_person_id, i.reimbursement_status, i.record_type,
                    COALESCE(v.voucher_count, 0) AS voucher_count
                FROM invoices i
                LEFT JOIN (
                    SELECT invoice_number, COUNT(*) AS voucher_count
                    FROM expense_vouchers
                    GROUP BY invoice_number
                ) v ON i.invoice_number = v.invoice_number
                {where_sql}
                ORDER BY i.scan_time DESC
                LIMIT ? OFFSET ?
                """,
                params + [page_size, offset]
            )
            rows = cursor.fetchall()

            cursor.execute(
                f"""
                SELECT
                    COALESCE(SUM(CAST(i.amount AS REAL)), 0) AS total_amount,
                    COALESCE(SUM(CASE WHEN i.record_type = 'invoice' THEN 1 ELSE 0 END), 0) AS invoice_count,
                    COALESCE(SUM(CASE WHEN i.record_type = 'manual' THEN 1 ELSE 0 END), 0) AS manual_count,
                    COALESCE(SUM(CASE WHEN i.record_type = 'invoice' THEN CAST(i.amount AS REAL) ELSE 0 END), 0) AS invoice_amount,
                    COALESCE(SUM(CASE WHEN i.record_type = 'manual' THEN CAST(i.amount AS REAL) ELSE 0 END), 0) AS manual_amount,
                    COALESCE(SUM(CASE WHEN i.reimbursement_status = '未报销' THEN 1 ELSE 0 END), 0) AS pending_count,
                    COALESCE(SUM(CASE WHEN i.reimbursement_status = '已报销' THEN 1 ELSE 0 END), 0) AS completed_count
                FROM invoices i
                {where_sql}
                """,
                params
            )
            stats_row = cursor.fetchone()

        invoice_rows = []
        for row in rows:
            invoice_rows.append({
                'invoice': self.deserialize_invoice(row[:13]),
                'voucher_count': int(row[13] or 0)
            })

        return {
            'invoices': invoice_rows,
            'total_count': total_count,
            'page': page,
            'page_size': page_size,
            'total_pages': total_pages,
            'total_amount': str(Decimal(str(stats_row[0]))),
            'invoice_count': int(stats_row[1] or 0),
            'manual_count': int(stats_row[2] or 0),
            'invoice_amount': str(Decimal(str(stats_row[3]))),
            'manual_amount': str(Decimal(str(stats_row[4]))),
            'pending_count': int(stats_row[5] or 0),
            'completed_count': int(stats_row[6] or 0)
        }
    
    def insert_with_pdf(self, invoice: Invoice, pdf_data: bytes) -> None:
        """
        插入发票记录并存储PDF二进制数据
        
        Args:
            invoice: 要插入的Invoice对象
            pdf_data: PDF文件的二进制内容
            
        Raises:
            sqlite3.IntegrityError: 发票号码重复时抛出
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO invoices 
                (invoice_number, invoice_date, item_name, amount, remark, file_path, scan_time, pdf_data)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                invoice.invoice_number,
                invoice.invoice_date,
                invoice.item_name,
                str(invoice.amount),
                invoice.remark,
                invoice.file_path,
                invoice.scan_time.isoformat(),
                pdf_data
            ))
            conn.commit()
    
    def get_pdf_data(self, invoice_number: str) -> Optional[bytes]:
        """
        获取发票的PDF二进制数据
        
        Args:
            invoice_number: 发票号码
            
        Returns:
            PDF二进制数据，如果不存在则返回None
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT pdf_data FROM invoices WHERE invoice_number = ?",
                (invoice_number,)
            )
            row = cursor.fetchone()
            if row and row[0]:
                return row[0]
            return None
    
    def update_pdf_data(self, invoice_number: str, pdf_data: bytes) -> bool:
        """
        更新发票的PDF二进制数据
        
        Args:
            invoice_number: 发票号码
            pdf_data: PDF文件的二进制内容
            
        Returns:
            True表示更新成功，False表示未找到记录
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "UPDATE invoices SET pdf_data = ? WHERE invoice_number = ?",
                (pdf_data, invoice_number)
            )
            conn.commit()
            return cursor.rowcount > 0
    
    def get_invoice_by_number(self, invoice_number: str) -> Optional[Invoice]:
        """
        根据发票号码获取发票
        
        Args:
            invoice_number: 发票号码
            
        Returns:
            Invoice对象，如果不存在则返回None
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT * FROM invoices WHERE invoice_number = ?",
                (invoice_number,)
            )
            row = cursor.fetchone()
            if row:
                return self.deserialize_invoice(row)
            return None
    
    def update_reimbursement_status(self, invoice_number: str, status: str) -> bool:
        """
        更新发票的报销状态
        
        Args:
            invoice_number: 发票号码
            status: 报销状态（未报销 | 已报销）
            
        Returns:
            True表示更新成功，False表示未找到记录
        """
        if status not in ("未报销", "已报销"):
            raise ValueError("无效的报销状态，必须是'未报销'或'已报销'")
        
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "UPDATE invoices SET reimbursement_status = ? WHERE invoice_number = ?",
                (status, invoice_number)
            )
            conn.commit()
            return cursor.rowcount > 0

    # ========== 支出凭证相关方法 ==========

    def serialize_voucher(self, voucher: ExpenseVoucher) -> tuple:
        """
        将ExpenseVoucher对象序列化为数据库元组
        
        Args:
            voucher: ExpenseVoucher对象
            
        Returns:
            包含凭证数据的元组，用于数据库插入
        """
        return (
            voucher.invoice_number,
            voucher.file_path,
            voucher.original_filename,
            voucher.upload_time.isoformat()
        )

    def deserialize_voucher(self, row: tuple) -> ExpenseVoucher:
        """
        将数据库行反序列化为ExpenseVoucher对象
        
        Args:
            row: 数据库查询结果行 (id, invoice_number, file_path, 
                 original_filename, upload_time)
            
        Returns:
            ExpenseVoucher对象
        """
        return ExpenseVoucher(
            id=row[0],
            invoice_number=row[1],
            file_path=row[2],
            original_filename=row[3],
            upload_time=datetime.fromisoformat(row[4])
        )

    def insert_voucher(self, voucher: ExpenseVoucher) -> int:
        """
        插入支出凭证记录
        
        Args:
            voucher: 要插入的ExpenseVoucher对象
            
        Returns:
            新插入记录的ID
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()
            data = self.serialize_voucher(voucher)
            cursor.execute("""
                INSERT INTO expense_vouchers 
                (invoice_number, file_path, original_filename, upload_time)
                VALUES (?, ?, ?, ?)
            """, data)
            conn.commit()
            return cursor.lastrowid

    def get_vouchers_by_invoice(self, invoice_number: str) -> List[ExpenseVoucher]:
        """
        获取指定发票的所有支出凭证
        
        Args:
            invoice_number: 发票号码
            
        Returns:
            支出凭证列表
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT * FROM expense_vouchers WHERE invoice_number = ?",
                (invoice_number,)
            )
            rows = cursor.fetchall()
            return [self.deserialize_voucher(row) for row in rows]

    def delete_voucher(self, voucher_id: int) -> bool:
        """
        删除指定ID的支出凭证
        
        Args:
            voucher_id: 凭证ID
            
        Returns:
            True表示删除成功，False表示未找到记录
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "DELETE FROM expense_vouchers WHERE id = ?",
                (voucher_id,)
            )
            conn.commit()
            return cursor.rowcount > 0

    # ========== 报销人相关方法 ==========

    def serialize_person(self, person: ReimbursementPerson) -> tuple:
        """
        将ReimbursementPerson对象序列化为数据库元组
        
        Args:
            person: ReimbursementPerson对象
            
        Returns:
            包含报销人数据的元组，用于数据库插入
        """
        return (
            person.name,
            person.created_time.isoformat()
        )

    def deserialize_person(self, row: tuple) -> ReimbursementPerson:
        """
        将数据库行反序列化为ReimbursementPerson对象
        
        Args:
            row: 数据库查询结果行 (id, name, created_time)
            
        Returns:
            ReimbursementPerson对象
        """
        return ReimbursementPerson(
            id=row[0],
            name=row[1],
            created_time=datetime.fromisoformat(row[2])
        )

    def insert_person(self, person: ReimbursementPerson) -> int:
        """
        插入报销人记录
        
        Args:
            person: 要插入的ReimbursementPerson对象
            
        Returns:
            新插入记录的ID
            
        Raises:
            sqlite3.IntegrityError: 报销人姓名重复时抛出
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()
            data = self.serialize_person(person)
            cursor.execute("""
                INSERT INTO reimbursement_persons (name, created_time)
                VALUES (?, ?)
            """, data)
            conn.commit()
            return cursor.lastrowid

    def get_all_persons(self) -> List[ReimbursementPerson]:
        """
        获取所有报销人记录
        
        Returns:
            报销人列表
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM reimbursement_persons ORDER BY name")
            rows = cursor.fetchall()
            return [self.deserialize_person(row) for row in rows]

    def get_person_by_name(self, name: str) -> Optional[ReimbursementPerson]:
        """
        根据姓名获取报销人
        
        Args:
            name: 报销人姓名
            
        Returns:
            ReimbursementPerson对象，如果不存在则返回None
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT * FROM reimbursement_persons WHERE name = ?",
                (name,)
            )
            row = cursor.fetchone()
            if row:
                return self.deserialize_person(row)
            return None

    # ========== 合同相关方法 ==========

    def serialize_contract(self, contract: Contract) -> tuple:
        """
        将Contract对象序列化为数据库元组
        
        Args:
            contract: Contract对象
            
        Returns:
            包含合同数据的元组，用于数据库插入
        """
        return (
            contract.invoice_number,
            contract.file_path,
            contract.original_filename,
            contract.upload_time.isoformat()
        )

    def deserialize_contract(self, row: tuple) -> Contract:
        """
        将数据库行反序列化为Contract对象
        
        Args:
            row: 数据库查询结果行 (id, invoice_number, file_path, 
                 original_filename, upload_time)
            
        Returns:
            Contract对象
        """
        return Contract(
            id=row[0],
            invoice_number=row[1],
            file_path=row[2],
            original_filename=row[3],
            upload_time=datetime.fromisoformat(row[4])
        )

    def insert_contract(self, contract: Contract) -> int:
        """
        插入合同记录
        
        Args:
            contract: 要插入的Contract对象
            
        Returns:
            新插入记录的ID
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()
            data = self.serialize_contract(contract)
            cursor.execute("""
                INSERT INTO contracts 
                (invoice_number, file_path, original_filename, upload_time)
                VALUES (?, ?, ?, ?)
            """, data)
            conn.commit()
            return cursor.lastrowid

    def get_contract_by_invoice(self, invoice_number: str) -> Optional[Contract]:
        """
        获取指定发票的合同
        
        Args:
            invoice_number: 发票号码
            
        Returns:
            Contract对象，如果不存在则返回None
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT * FROM contracts WHERE invoice_number = ?",
                (invoice_number,)
            )
            row = cursor.fetchone()
            if row:
                return self.deserialize_contract(row)
            return None

    def delete_contract(self, contract_id: int) -> bool:
        """
        删除指定ID的合同
        
        Args:
            contract_id: 合同ID
            
        Returns:
            True表示删除成功，False表示未找到记录
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "DELETE FROM contracts WHERE id = ?",
                (contract_id,)
            )
            conn.commit()
            return cursor.rowcount > 0

    def delete_contracts_by_invoice(self, invoice_number: str) -> int:
        """
        删除指定发票的所有合同
        
        Args:
            invoice_number: 发票号码
            
        Returns:
            删除的记录数
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "DELETE FROM contracts WHERE invoice_number = ?",
                (invoice_number,)
            )
            conn.commit()
            return cursor.rowcount

    # ========== 电子签章相关方法 ==========

    def serialize_signature(self, signature: ElectronicSignature) -> tuple:
        """
        将ElectronicSignature对象序列化为数据库元组
        
        Args:
            signature: ElectronicSignature对象
            
        Returns:
            包含签章数据的元组，用于数据库插入
        """
        return (
            signature.invoice_number,
            signature.image_path,
            signature.original_filename,
            signature.position_x,
            signature.position_y,
            signature.width,
            signature.height,
            signature.page_number,
            signature.upload_time.isoformat()
        )

    def deserialize_signature(self, row: tuple) -> ElectronicSignature:
        """
        将数据库行反序列化为ElectronicSignature对象
        
        Args:
            row: 数据库查询结果行 (id, invoice_number, image_path, 
                 original_filename, position_x, position_y, width, height,
                 page_number, upload_time)
            
        Returns:
            ElectronicSignature对象
        """
        return ElectronicSignature(
            id=row[0],
            invoice_number=row[1],
            image_path=row[2],
            original_filename=row[3],
            position_x=row[4],
            position_y=row[5],
            width=row[6],
            height=row[7],
            page_number=row[8],
            upload_time=datetime.fromisoformat(row[9])
        )

    def insert_signature(self, signature: ElectronicSignature) -> int:
        """
        插入电子签章记录
        
        Args:
            signature: 要插入的ElectronicSignature对象
            
        Returns:
            新插入记录的ID
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()
            data = self.serialize_signature(signature)
            cursor.execute("""
                INSERT INTO electronic_signatures 
                (invoice_number, image_path, original_filename, position_x, 
                 position_y, width, height, page_number, upload_time)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, data)
            conn.commit()
            return cursor.lastrowid

    def get_signature_by_invoice(self, invoice_number: str) -> Optional[ElectronicSignature]:
        """
        获取指定发票的电子签章
        
        Args:
            invoice_number: 发票号码
            
        Returns:
            ElectronicSignature对象，如果不存在则返回None
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT * FROM electronic_signatures WHERE invoice_number = ?",
                (invoice_number,)
            )
            row = cursor.fetchone()
            if row:
                return self.deserialize_signature(row)
            return None

    def update_signature_position(self, signature_id: int, position_x: float, 
                                   position_y: float, width: float, height: float,
                                   page_number: int = 0) -> bool:
        """
        更新电子签章的位置和大小
        
        Args:
            signature_id: 签章ID
            position_x: X坐标
            position_y: Y坐标
            width: 宽度
            height: 高度
            page_number: 页码
            
        Returns:
            True表示更新成功，False表示未找到记录
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                UPDATE electronic_signatures 
                SET position_x = ?, position_y = ?, width = ?, height = ?, page_number = ?
                WHERE id = ?
            """, (position_x, position_y, width, height, page_number, signature_id))
            conn.commit()
            return cursor.rowcount > 0

    def delete_signature(self, signature_id: int) -> bool:
        """
        删除指定ID的电子签章
        
        Args:
            signature_id: 签章ID
            
        Returns:
            True表示删除成功，False表示未找到记录
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "DELETE FROM electronic_signatures WHERE id = ?",
                (signature_id,)
            )
            conn.commit()
            return cursor.rowcount > 0

    def delete_signatures_by_invoice(self, invoice_number: str) -> int:
        """
        删除指定发票的所有电子签章
        
        Args:
            invoice_number: 发票号码
            
        Returns:
            删除的记录数
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "DELETE FROM electronic_signatures WHERE invoice_number = ?",
                (invoice_number,)
            )
            conn.commit()
            return cursor.rowcount


    # ========== 签章模板相关方法 ==========

    def serialize_signature_template(self, template: SignatureTemplate) -> tuple:
        """
        将SignatureTemplate对象序列化为数据库元组
        """
        return (
            template.name,
            template.image_path,
            template.original_filename,
            template.upload_time.isoformat()
        )

    def deserialize_signature_template(self, row: tuple) -> SignatureTemplate:
        """
        将数据库行反序列化为SignatureTemplate对象
        """
        return SignatureTemplate(
            id=row[0],
            name=row[1],
            image_path=row[2],
            original_filename=row[3],
            upload_time=datetime.fromisoformat(row[4])
        )

    def insert_signature_template(self, template: SignatureTemplate) -> int:
        """
        插入签章模板记录
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()
            data = self.serialize_signature_template(template)
            cursor.execute("""
                INSERT INTO signature_templates 
                (name, image_path, original_filename, upload_time)
                VALUES (?, ?, ?, ?)
            """, data)
            conn.commit()
            return cursor.lastrowid

    def get_all_signature_templates(self) -> List[SignatureTemplate]:
        """
        获取所有签章模板
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM signature_templates ORDER BY upload_time DESC")
            rows = cursor.fetchall()
            return [self.deserialize_signature_template(row) for row in rows]

    def get_signature_template_by_id(self, template_id: int) -> Optional[SignatureTemplate]:
        """
        根据ID获取签章模板
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT * FROM signature_templates WHERE id = ?",
                (template_id,)
            )
            row = cursor.fetchone()
            if row:
                return self.deserialize_signature_template(row)
            return None

    def delete_signature_template(self, template_id: int) -> bool:
        """
        删除签章模板
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "DELETE FROM signature_templates WHERE id = ?",
                (template_id,)
            )
            conn.commit()
            return cursor.rowcount > 0

    # ========== 手动记录重复检测方法 ==========

    def check_manual_duplicate(
        self,
        amount: Decimal,
        invoice_date: str,
        item_name: str,
        uploaded_by: str
    ) -> Optional[Invoice]:
        """
        检查手动记录的潜在重复
        
        基于以下字段的组合检测潜在重复：
        - amount（金额）
        - invoice_date（日期）
        - item_name（项目名称）
        - uploaded_by（上传人）
        
        Args:
            amount: 金额
            invoice_date: 日期（YYYY-MM-DD格式）
            item_name: 项目名称
            uploaded_by: 上传人
            
        Returns:
            如果找到相似记录，返回该记录；否则返回None
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT * FROM invoices 
                WHERE amount = ?
                  AND invoice_date = ?
                  AND item_name = ?
                  AND uploaded_by = ?
                  AND record_type = 'manual'
            """, (str(amount), invoice_date, item_name, uploaded_by))
            
            row = cursor.fetchone()
            if row:
                return self.deserialize_invoice(row)
            return None
