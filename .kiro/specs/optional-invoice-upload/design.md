# Design Document

## Overview

本设计文档描述了如何扩展现有的Web端电子发票汇总系统，以支持无发票报销场景。系统将允许用户在上传报销记录时选择不上传发票PDF，而是手动填写报销信息。这将通过在现有的Invoice模型中添加一个标识字段来区分发票记录和手动记录，并在前端提供两种输入模式的切换。

核心设计原则：
- 复用现有的Invoice数据模型和数据库表结构
- 最小化对现有代码的修改
- 保持向后兼容性
- 提供清晰的用户界面区分两种记录类型

## Architecture

系统架构保持不变，继续使用Flask作为Web框架，SQLite作为数据存储。主要变更集中在以下几个层面：

1. **数据层（Data Layer）**
   - 在Invoice模型中添加`record_type`字段，用于区分"invoice"（有发票）和"manual"（手动输入）
   - 在数据库表中添加相应的列
   - 为手动记录生成唯一标识符的逻辑

2. **业务逻辑层（Business Logic Layer）**
   - 扩展InvoiceManager以支持手动记录的创建和验证
   - 添加手动记录的重复检测逻辑
   - 修改统计计算以区分两种记录类型

3. **API层（API Layer）**
   - 添加新的API端点用于创建手动记录
   - 修改现有的列表和详情API以返回记录类型信息
   - 添加编辑手动记录的API端点

4. **前端层（Frontend Layer）**
   - 在上传页面添加模式切换UI（上传PDF vs 手动输入）
   - 创建手动输入表单组件
   - 在列表页面显示记录类型标识
   - 修改详情页面以适配两种记录类型

## Components and Interfaces

### 1. Data Models

#### Invoice Model Extension

扩展现有的`Invoice`模型，添加新字段：

```python
@dataclass
class Invoice:
    invoice_number: str  # 对于手动记录，使用生成的唯一ID
    invoice_date: str
    item_name: str
    amount: Decimal
    remark: str
    file_path: str  # 对于手动记录，存储空字符串或"MANUAL"
    scan_time: datetime
    uploaded_by: str
    reimbursement_person_id: Optional[int]
    reimbursement_status: str
    record_type: str = "invoice"  # 新增：'invoice' 或 'manual'
```

#### Manual Record ID Generator

为手动记录生成唯一标识符的工具类：

```python
class ManualRecordIDGenerator:
    """
    生成手动记录的唯一标识符
    格式：MANUAL-YYYYMMDD-HHMMSS-XXXX
    例如：MANUAL-20251228-143052-A3F2
    """
    
    @staticmethod
    def generate() -> str:
        """生成唯一的手动记录ID"""
        pass
```

### 2. Database Schema Changes

在`invoices`表中添加新列：

```sql
ALTER TABLE invoices ADD COLUMN record_type TEXT DEFAULT 'invoice';
CREATE INDEX idx_record_type ON invoices(record_type);
```

迁移函数：

```python
def _migrate_add_record_type_column(self, cursor: sqlite3.Cursor) -> None:
    """迁移：添加record_type列（如果不存在）"""
    cursor.execute("PRAGMA table_info(invoices)")
    columns = [col[1] for col in cursor.fetchall()]
    
    if 'record_type' not in columns:
        cursor.execute("ALTER TABLE invoices ADD COLUMN record_type TEXT DEFAULT 'invoice'")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_record_type ON invoices(record_type)")
```

### 3. API Endpoints

#### POST /user/api/create-manual

创建手动报销记录

**Request Body:**
```json
{
  "item_name": "交通费",
  "amount": "50.00",
  "invoice_date": "2025-12-28",
  "remark": "打车费用",
  "reimbursement_person_id": 1
}
```

**Response:**
```json
{
  "success": true,
  "message": "手动记录创建成功",
  "record": {
    "invoice_number": "MANUAL-20251228-143052-A3F2",
    "item_name": "交通费",
    "amount": "50.00",
    "invoice_date": "2025-12-28",
    "remark": "打车费用",
    "record_type": "manual",
    "uploaded_by": "张三",
    "scan_time": "2025-12-28T14:30:52"
  }
}
```

#### PUT /user/api/manual/<record_id>

编辑手动报销记录

**Request Body:**
```json
{
  "item_name": "交通费",
  "amount": "55.00",
  "invoice_date": "2025-12-28",
  "remark": "打车费用（已更新）"
}
```

**Response:**
```json
{
  "success": true,
  "message": "记录更新成功"
}
```

#### GET /user/api/invoices?record_type=manual

获取发票列表（支持按记录类型过滤）

**Query Parameters:**
- `record_type`: 可选，值为"invoice"或"manual"，用于过滤记录类型

**Response:**
```json
{
  "invoices": [...],
  "total_count": 10,
  "total_amount": "1500.00",
  "invoice_count": 7,
  "manual_count": 3,
  "invoice_amount": "1200.00",
  "manual_amount": "300.00"
}
```

### 4. Frontend Components

#### Upload Mode Selector

上传页面的模式选择器：

```html
<div class="upload-mode-selector">
  <button class="mode-btn active" data-mode="pdf">
    <i class="icon-pdf"></i>
    上传发票PDF
  </button>
  <button class="mode-btn" data-mode="manual">
    <i class="icon-edit"></i>
    手动输入报销信息
  </button>
</div>
```

#### Manual Entry Form

手动输入表单：

```html
<form id="manual-entry-form" class="manual-form" style="display: none;">
  <div class="form-group">
    <label for="item_name">费用项目名称 <span class="required">*</span></label>
    <input type="text" id="item_name" name="item_name" required>
  </div>
  
  <div class="form-group">
    <label for="amount">金额（元）<span class="required">*</span></label>
    <input type="number" id="amount" name="amount" step="0.01" min="0.01" required>
  </div>
  
  <div class="form-group">
    <label for="invoice_date">日期 <span class="required">*</span></label>
    <input type="date" id="invoice_date" name="invoice_date" required>
  </div>
  
  <div class="form-group">
    <label for="remark">备注</label>
    <textarea id="remark" name="remark" rows="3"></textarea>
  </div>
  
  <div class="form-group">
    <label for="reimbursement_person">报销人</label>
    <select id="reimbursement_person" name="reimbursement_person_id">
      <option value="">请选择</option>
      <!-- 动态加载报销人列表 -->
    </select>
  </div>
  
  <div class="form-group">
    <label for="voucher_files">支出凭证（可选）</label>
    <input type="file" id="voucher_files" name="voucher_files[]" 
           accept="image/jpeg,image/png" multiple>
    <small class="form-text">支持JPG、PNG格式，可上传多张</small>
  </div>
  
  <div class="form-actions">
    <button type="submit" class="btn btn-primary">提交</button>
    <button type="reset" class="btn btn-secondary">重置</button>
  </div>
</form>
```

#### Record Type Badge

记录类型标识：

```html
<!-- 有发票 -->
<span class="badge badge-invoice">
  <i class="icon-document"></i> 有发票
</span>

<!-- 无票报销 -->
<span class="badge badge-manual">
  <i class="icon-edit"></i> 无票报销
</span>
```

## Data Models

### Invoice Record Types

系统支持两种记录类型：

1. **Invoice Record（发票记录）**
   - `record_type = "invoice"`
   - `invoice_number`: 从PDF解析的真实发票号码
   - `file_path`: PDF文件路径或数据库中的PDF数据
   - 所有字段从PDF自动解析
   - 不可编辑（除了报销人和备注）

2. **Manual Record（手动记录）**
   - `record_type = "manual"`
   - `invoice_number`: 系统生成的唯一ID（格式：MANUAL-YYYYMMDD-HHMMSS-XXXX）
   - `file_path`: 空字符串或"MANUAL"
   - 所有字段由用户手动输入
   - 可以编辑所有字段

### Duplicate Detection Logic

#### For Invoice Records

现有逻辑保持不变：基于`invoice_number`检测重复

#### For Manual Records

基于以下字段的组合检测潜在重复：
- `amount`（金额）
- `invoice_date`（日期）
- `item_name`（项目名称）
- `uploaded_by`（上传人）

如果在同一天内，同一用户创建了相同金额和项目名称的记录，系统将显示警告，但允许用户继续创建。

```python
def check_manual_duplicate(
    amount: Decimal,
    invoice_date: str,
    item_name: str,
    uploaded_by: str
) -> Optional[Invoice]:
    """
    检查手动记录的潜在重复
    
    Returns:
        如果找到相似记录，返回该记录；否则返回None
    """
    pass
```

## Correctness Properties

*属性（Property）是系统在所有有效执行中应该保持为真的特征或行为。属性是人类可读规范和机器可验证正确性保证之间的桥梁。*

### Property 1: Manual Record Creation Without PDF
*For any* valid manual entry data (item_name, amount, invoice_date), creating a manual record should succeed without requiring a PDF file, and the record_type field should be set to "manual".
**Validates: Requirements 1.5, 11.2**

### Property 2: Required Field Validation
*For any* form submission with missing required fields (item_name, amount, or invoice_date), validation should fail and prevent record creation.
**Validates: Requirements 1.4, 4.4**

### Property 3: Record Type Visual Indicator
*For any* manual record displayed in the list or detail view, the rendered output should contain a visual indicator (badge/icon) showing "无票报销".
**Validates: Requirements 2.1, 2.2, 3.3**

### Property 4: Invoice Record Visual Indicator
*For any* invoice record (with PDF) displayed in the list, the rendered output should contain a visual indicator showing "有发票".
**Validates: Requirements 2.3**

### Property 5: Record Type Filtering
*For any* dataset containing both invoice and manual records, filtering by record_type should return only records matching that type.
**Validates: Requirements 2.4, 11.5**

### Property 6: Manual Record Detail Fields
*For any* manual record detail view, all required fields (费用项目名称, 金额, 日期, 备注, 上传人, 上传时间, 报销人) should be present in the rendered output.
**Validates: Requirements 3.2**

### Property 7: PDF Download Button Exclusion
*For any* manual record detail view, the PDF download button should not be present in the rendered output.
**Validates: Requirements 3.4**

### Property 8: Edit Button for Manual Records
*For any* manual record detail view, an edit button should be present in the rendered output.
**Validates: Requirements 4.1**

### Property 9: Manual Record Update
*For any* manual record and any valid field modifications, saving the changes should update the corresponding fields in the database.
**Validates: Requirements 4.3**

### Property 10: Invoice Record Edit Restriction
*For any* invoice record (record_type = "invoice"), the system should not allow editing of parsed fields (invoice_number, invoice_date, item_name, amount).
**Validates: Requirements 4.5**

### Property 11: Unique Identifier Generation
*For any* manual record creation, the system should generate a unique identifier that is different from all existing record identifiers.
**Validates: Requirements 5.1**

### Property 12: Manual Record Identifier Format
*For any* generated manual record identifier, it should follow the format "MANUAL-YYYYMMDD-HHMMSS-XXXX" where XXXX is a random alphanumeric string.
**Validates: Requirements 5.2**

### Property 13: Identifier Display in Export
*For any* export operation, all records (both invoice and manual) should have their identifiers included in the exported data.
**Validates: Requirements 5.4, 8.3**

### Property 14: Voucher Image Format Validation
*For any* file upload attempt, if the file format is JPG or PNG, it should be accepted; otherwise, it should be rejected.
**Validates: Requirements 6.2**

### Property 15: Voucher Association
*For any* manual record with uploaded vouchers, querying the vouchers by record identifier should return all associated voucher files.
**Validates: Requirements 6.3, 6.4**

### Property 16: Manual Record Creation Without Vouchers
*For any* manual record creation request without voucher files, the record should be created successfully.
**Validates: Requirements 6.5**

### Property 17: Statistics Aggregation
*For any* dataset containing both invoice and manual records, the total count should equal the sum of invoice_count and manual_count, and the total amount should equal the sum of invoice_amount and manual_amount.
**Validates: Requirements 7.1, 7.2, 7.3, 7.4**

### Property 18: Export Completeness
*For any* export operation, the exported file should include all records from the database, regardless of record type.
**Validates: Requirements 8.1**

### Property 19: Export Record Type Column
*For any* exported file, there should be a column indicating record type, with values "发票" for invoice records and "无票报销" for manual records.
**Validates: Requirements 8.2**

### Property 20: Amount Validation
*For any* amount input that is not a positive number (≤ 0 or non-numeric), validation should fail.
**Validates: Requirements 9.2**

### Property 21: Validation Error Messages
*For any* form submission with validation errors, error messages should be displayed for each invalid field.
**Validates: Requirements 9.5**

### Property 22: Manual Record Deletion
*For any* manual record deletion confirmation, the record and all associated vouchers should be removed from the database.
**Validates: Requirements 10.2**

### Property 23: Manual Record PDF Field
*For any* manual record stored in the database, the pdf_data field should be NULL or empty, and the file_path should be empty or "MANUAL".
**Validates: Requirements 11.4**

### Property 24: Record Type Identification
*For any* record retrieved from the database, the system should correctly identify its type based on the record_type field.
**Validates: Requirements 11.3**

### Property 25: Duplicate Detection
*For any* manual record creation, if there exists a record with the same amount, invoice_date, item_name, and uploaded_by, the system should detect it as a potential duplicate.
**Validates: Requirements 12.1, 12.2**

### Property 26: Duplicate Proceed
*For any* duplicate warning where the user chooses to proceed, the system should create the new record despite the similarity.
**Validates: Requirements 12.4**

### Property 27: Admin Record Type Visual Indicator
*For any* record displayed in the admin portal list, the rendered output should contain a visual indicator showing "有发票" or "无票报销" based on record type.
**Validates: Requirements 13.1, 13.2, 13.3**

### Property 28: Admin Record Type Filtering
*For any* dataset containing both invoice and manual records in admin portal, filtering by record_type should return only records matching that type.
**Validates: Requirements 13.4, 13.5**

### Property 29: Admin Statistics Aggregation
*For any* dataset in admin portal containing both invoice and manual records, the statistics should show separate counts and amounts for "有发票记录" and "无票报销记录".
**Validates: Requirements 13.6**

### Property 30: Admin Export Record Type Column
*For any* export operation from admin portal, the exported file should include a record type column with values "发票" or "无票报销".
**Validates: Requirements 13.7**


## Error Handling

### 1. Validation Errors

**Client-Side Validation:**
- 必填字段检查（费用项目名称、金额、日期）
- 金额格式验证（必须为正数，最多两位小数）
- 日期格式验证（YYYY-MM-DD）
- 实时反馈，在用户输入时显示错误

**Server-Side Validation:**
- 重复所有客户端验证
- 额外的业务规则验证
- 返回详细的错误信息

**Error Response Format:**
```json
{
  "success": false,
  "message": "验证失败",
  "errors": {
    "item_name": "费用项目名称不能为空",
    "amount": "金额必须大于0"
  }
}
```

### 2. Duplicate Detection

**Behavior:**
- 检测到潜在重复时，返回警告而非错误
- 允许用户选择继续或取消
- 显示相似记录的详细信息供用户比较

**Warning Response Format:**
```json
{
  "success": false,
  "is_duplicate_warning": true,
  "message": "检测到相似的报销记录",
  "similar_record": {
    "invoice_number": "MANUAL-20251228-120000-A1B2",
    "item_name": "交通费",
    "amount": "50.00",
    "invoice_date": "2025-12-28",
    "uploaded_by": "张三"
  }
}
```

### 3. Database Errors

**Handling Strategy:**
- 捕获所有数据库异常
- 记录详细错误日志
- 向用户返回友好的错误消息
- 对于唯一性约束违反，提供特定的错误消息

**Example:**
```python
try:
    data_store.insert(manual_record)
except sqlite3.IntegrityError as e:
    if "UNIQUE constraint" in str(e):
        return jsonify({
            'success': False,
            'message': '记录ID冲突，请重试'
        }), 409
    else:
        return jsonify({
            'success': False,
            'message': '数据库错误，请联系管理员'
        }), 500
```

### 4. File Upload Errors

**Voucher Upload:**
- 文件格式验证（仅接受JPG、PNG）
- 文件大小限制（例如：每个文件最大5MB）
- 文件数量限制（例如：最多10个凭证）
- 磁盘空间检查

**Error Handling:**
```python
def validate_voucher_file(file):
    """验证凭证文件"""
    if not file.filename:
        raise ValueError("文件名为空")
    
    ext = file.filename.rsplit('.', 1)[-1].lower()
    if ext not in ['jpg', 'jpeg', 'png']:
        raise ValueError(f"不支持的文件格式: {ext}")
    
    # Check file size (5MB limit)
    file.seek(0, os.SEEK_END)
    size = file.tell()
    file.seek(0)
    if size > 5 * 1024 * 1024:
        raise ValueError("文件大小超过5MB限制")
```

### 5. Edit Permission Errors

**Scenario:**
- 用户尝试编辑发票记录（非手动记录）
- 用户尝试编辑其他用户的记录

**Response:**
```json
{
  "success": false,
  "message": "无权编辑此记录",
  "reason": "invoice_record_not_editable"
}
```

### 6. Not Found Errors

**Scenario:**
- 请求不存在的记录ID
- 请求已删除的记录

**Response:**
```json
{
  "success": false,
  "message": "记录不存在",
  "error_code": "RECORD_NOT_FOUND"
}
```

## Testing Strategy

### Overview

本项目采用双重测试策略，结合单元测试和基于属性的测试（Property-Based Testing, PBT），以确保系统的正确性和健壮性。

### Unit Testing

**Purpose:**
- 验证特定示例和边界情况
- 测试UI组件的存在和行为
- 测试特定的用户交互流程

**Framework:** pytest

**Test Coverage:**

1. **API Endpoint Tests**
   - 测试每个API端点的基本功能
   - 测试错误响应
   - 测试权限验证

2. **Database Tests**
   - 测试记录的插入、更新、删除
   - 测试迁移脚本
   - 测试数据完整性约束

3. **Validation Tests**
   - 测试特定的无效输入
   - 测试边界值（如金额为0、负数）
   - 测试空字符串和NULL值

4. **UI Component Tests**
   - 测试表单元素的存在
   - 测试按钮的可见性
   - 测试模式切换功能

**Example Unit Tests:**
```python
def test_manual_entry_form_exists():
    """测试手动输入表单存在"""
    response = client.get('/user/')
    assert b'manual-entry-form' in response.data

def test_create_manual_record_with_valid_data():
    """测试使用有效数据创建手动记录"""
    data = {
        'item_name': '交通费',
        'amount': '50.00',
        'invoice_date': '2025-12-28',
        'remark': '打车费用'
    }
    response = client.post('/user/api/create-manual', json=data)
    assert response.status_code == 200
    assert response.json['success'] is True

def test_create_manual_record_missing_required_field():
    """测试缺少必填字段时创建失败"""
    data = {
        'amount': '50.00',
        'invoice_date': '2025-12-28'
    }
    response = client.post('/user/api/create-manual', json=data)
    assert response.status_code == 400
    assert 'item_name' in response.json['errors']
```

### Property-Based Testing

**Purpose:**
- 验证系统在所有有效输入下的通用属性
- 通过随机生成大量测试用例发现边界情况
- 确保系统行为的一致性

**Framework:** Hypothesis (Python)

**Configuration:**
- 每个属性测试至少运行100次迭代
- 使用自定义生成器创建有效的测试数据

**Test Tagging:**
每个属性测试必须使用注释标记其对应的设计文档属性：
```python
# Feature: optional-invoice-upload, Property 1: Manual Record Creation Without PDF
@given(manual_entry_data=manual_entry_strategy())
def test_manual_record_creation_without_pdf(manual_entry_data):
    """验证可以在没有PDF的情况下创建手动记录"""
    # Test implementation
```

**Custom Strategies:**

```python
from hypothesis import strategies as st

@st.composite
def manual_entry_strategy(draw):
    """生成有效的手动记录数据"""
    return {
        'item_name': draw(st.text(min_size=1, max_size=100)),
        'amount': draw(st.decimals(min_value=0.01, max_value=999999.99, places=2)),
        'invoice_date': draw(st.dates(min_value=date(2020, 1, 1), max_value=date(2030, 12, 31))).isoformat(),
        'remark': draw(st.text(max_size=500)),
        'reimbursement_person_id': draw(st.one_of(st.none(), st.integers(min_value=1, max_value=100)))
    }

@st.composite
def invalid_amount_strategy(draw):
    """生成无效的金额值"""
    return draw(st.one_of(
        st.just(0),
        st.floats(max_value=-0.01),
        st.text(),
        st.none()
    ))
```

**Property Test Examples:**

```python
# Feature: optional-invoice-upload, Property 1: Manual Record Creation Without PDF
@given(data=manual_entry_strategy())
@settings(max_examples=100)
def test_property_1_manual_record_creation(data):
    """
    Property 1: 对于任何有效的手动输入数据，
    创建手动记录应该成功，且record_type应为"manual"
    """
    response = client.post('/user/api/create-manual', json=data)
    assert response.status_code == 200
    assert response.json['success'] is True
    
    record_id = response.json['record']['invoice_number']
    record = data_store.get_invoice_by_number(record_id)
    assert record is not None
    assert record.record_type == 'manual'

# Feature: optional-invoice-upload, Property 2: Required Field Validation
@given(
    data=manual_entry_strategy(),
    missing_field=st.sampled_from(['item_name', 'amount', 'invoice_date'])
)
@settings(max_examples=100)
def test_property_2_required_field_validation(data, missing_field):
    """
    Property 2: 对于任何缺少必填字段的表单提交，
    验证应该失败
    """
    # Remove the required field
    incomplete_data = data.copy()
    del incomplete_data[missing_field]
    
    response = client.post('/user/api/create-manual', json=incomplete_data)
    assert response.status_code == 400
    assert response.json['success'] is False
    assert missing_field in response.json.get('errors', {})

# Feature: optional-invoice-upload, Property 5: Record Type Filtering
@given(
    invoice_records=st.lists(invoice_strategy(), min_size=1, max_size=10),
    manual_records=st.lists(manual_entry_strategy(), min_size=1, max_size=10)
)
@settings(max_examples=100)
def test_property_5_record_type_filtering(invoice_records, manual_records):
    """
    Property 5: 对于任何包含两种记录类型的数据集，
    按类型过滤应该只返回该类型的记录
    """
    # Create test data
    for inv_data in invoice_records:
        create_invoice_record(inv_data)
    for man_data in manual_records:
        create_manual_record(man_data)
    
    # Test filtering by manual
    response = client.get('/user/api/invoices?record_type=manual')
    assert response.status_code == 200
    returned_records = response.json['invoices']
    assert len(returned_records) == len(manual_records)
    assert all(r['record_type'] == 'manual' for r in returned_records)
    
    # Test filtering by invoice
    response = client.get('/user/api/invoices?record_type=invoice')
    assert response.status_code == 200
    returned_records = response.json['invoices']
    assert len(returned_records) == len(invoice_records)
    assert all(r['record_type'] == 'invoice' for r in returned_records)

# Feature: optional-invoice-upload, Property 11: Unique Identifier Generation
@given(st.lists(manual_entry_strategy(), min_size=2, max_size=20))
@settings(max_examples=100)
def test_property_11_unique_identifier_generation(manual_records):
    """
    Property 11: 对于任何手动记录创建，
    系统应该生成唯一的标识符
    """
    generated_ids = []
    
    for data in manual_records:
        response = client.post('/user/api/create-manual', json=data)
        assert response.status_code == 200
        record_id = response.json['record']['invoice_number']
        generated_ids.append(record_id)
    
    # All IDs should be unique
    assert len(generated_ids) == len(set(generated_ids))

# Feature: optional-invoice-upload, Property 17: Statistics Aggregation
@given(
    invoice_records=st.lists(invoice_strategy(), min_size=0, max_size=10),
    manual_records=st.lists(manual_entry_strategy(), min_size=0, max_size=10)
)
@settings(max_examples=100)
def test_property_17_statistics_aggregation(invoice_records, manual_records):
    """
    Property 17: 对于任何包含两种记录类型的数据集，
    总计数应等于两种类型的计数之和，总金额应等于两种类型的金额之和
    """
    # Create test data
    for inv_data in invoice_records:
        create_invoice_record(inv_data)
    for man_data in manual_records:
        create_manual_record(man_data)
    
    response = client.get('/user/api/invoices')
    assert response.status_code == 200
    stats = response.json
    
    assert stats['total_count'] == stats['invoice_count'] + stats['manual_count']
    assert Decimal(stats['total_amount']) == Decimal(stats['invoice_amount']) + Decimal(stats['manual_amount'])
```

### Integration Testing

**Purpose:**
- 测试完整的用户工作流
- 验证前后端集成
- 测试数据库事务

**Example Scenarios:**
1. 用户创建手动记录 → 查看列表 → 查看详情 → 编辑 → 删除
2. 用户上传PDF发票 → 创建手动记录 → 查看混合列表 → 导出Excel
3. 用户创建手动记录 → 上传凭证 → 查看凭证 → 删除凭证

### Test Execution

**Local Development:**
```bash
# Run all tests
pytest

# Run only unit tests
pytest -m "not property"

# Run only property tests
pytest -m property

# Run with coverage
pytest --cov=src --cov=invoice_web --cov-report=html
```

**Continuous Integration:**
- 所有测试必须在合并前通过
- 代码覆盖率目标：80%以上
- 属性测试失败时，保存反例用于调试

### Test Data Management

**Strategy:**
- 使用临时数据库进行测试
- 每个测试前清理数据库
- 使用fixtures创建常用测试数据
- 属性测试使用Hypothesis生成随机数据

**Example Fixtures:**
```python
@pytest.fixture
def test_db():
    """创建临时测试数据库"""
    db_path = "test_invoices.db"
    data_store = SQLiteDataStore(db_path)
    yield data_store
    os.remove(db_path)

@pytest.fixture
def test_user(test_db):
    """创建测试用户"""
    test_db.create_user("testuser", "password123", "测试用户")
    return test_db.get_user_by_username("testuser")

@pytest.fixture
def sample_manual_record():
    """创建示例手动记录数据"""
    return {
        'item_name': '办公用品',
        'amount': '100.00',
        'invoice_date': '2025-12-28',
        'remark': '购买文具'
    }
```

### 5. Admin Portal Components

#### Admin Record Type Filter

管理员后台的记录类型过滤器：

```html
<div class="filter-controls">
  <label>记录类型：</label>
  <div class="btn-group" role="group">
    <input type="radio" class="btn-check" name="adminRecordTypeFilter" id="admin-filter-all" value="" checked>
    <label class="btn btn-outline-secondary btn-sm" for="admin-filter-all">
      <i class="bi bi-list-ul me-1"></i>全部
    </label>
    
    <input type="radio" class="btn-check" name="adminRecordTypeFilter" id="admin-filter-invoice" value="invoice">
    <label class="btn btn-outline-primary btn-sm" for="admin-filter-invoice">
      <i class="bi bi-file-earmark-pdf me-1"></i>有发票
    </label>
    
    <input type="radio" class="btn-check" name="adminRecordTypeFilter" id="admin-filter-manual" value="manual">
    <label class="btn btn-outline-secondary btn-sm" for="admin-filter-manual">
      <i class="bi bi-pencil-square me-1"></i>无票报销
    </label>
  </div>
</div>
```

#### Admin Statistics Display

管理员后台的分类统计显示：

```html
<div class="statistics-panel">
  <div class="stat-card">
    <div class="stat-icon bg-primary">
      <i class="bi bi-file-earmark-pdf"></i>
    </div>
    <div class="stat-content">
      <div class="stat-label">有发票记录</div>
      <div class="stat-value" id="admin-invoice-count">0</div>
      <div class="stat-amount" id="admin-invoice-amount">¥0.00</div>
    </div>
  </div>
  
  <div class="stat-card">
    <div class="stat-icon bg-secondary">
      <i class="bi bi-pencil-square"></i>
    </div>
    <div class="stat-content">
      <div class="stat-label">无票报销记录</div>
      <div class="stat-value" id="admin-manual-count">0</div>
      <div class="stat-amount" id="admin-manual-amount">¥0.00</div>
    </div>
  </div>
</div>
```

#### Admin Record Type Badge

管理员后台的记录类型标识（与用户端一致）：

```html
<!-- 有发票 -->
<span class="badge badge-invoice">
  <i class="bi bi-file-earmark-pdf"></i> 有发票
</span>

<!-- 无票报销 -->
<span class="badge badge-manual">
  <i class="bi bi-pencil-square"></i> 无票报销
</span>
```

## Implementation Notes

### Migration Strategy

1. **Database Migration**
   - 添加`record_type`列到现有的`invoices`表
   - 为所有现有记录设置`record_type = 'invoice'`
   - 创建索引以提高查询性能

2. **Backward Compatibility**
   - 现有的发票记录不受影响
   - 所有现有API继续正常工作
   - 新的API端点是附加的，不替换现有端点

3. **Deployment Steps**
   - 运行数据库迁移脚本
   - 部署后端代码更新
   - 部署前端代码更新
   - 验证功能正常

### Performance Considerations

1. **Database Indexing**
   - 在`record_type`列上创建索引
   - 优化混合查询性能

2. **Query Optimization**
   - 使用WHERE子句过滤记录类型
   - 避免全表扫描

3. **Caching**
   - 考虑缓存报销人列表
   - 缓存统计数据（短期）

### Security Considerations

1. **Input Validation**
   - 严格验证所有用户输入
   - 防止SQL注入（使用参数化查询）
   - 防止XSS攻击（转义输出）

2. **Access Control**
   - 用户只能编辑自己创建的手动记录
   - 验证用户身份和权限

3. **File Upload Security**
   - 验证文件类型和大小
   - 使用安全的文件名
   - 存储在受保护的目录

### Monitoring and Logging

1. **Logging**
   - 记录所有手动记录的创建、编辑、删除操作
   - 记录重复检测结果
   - 记录验证失败

2. **Metrics**
   - 跟踪手动记录vs发票记录的比例
   - 监控重复检测的准确性
   - 跟踪用户采用率

3. **Error Tracking**
   - 捕获并报告所有异常
   - 监控API错误率
   - 设置告警阈值
