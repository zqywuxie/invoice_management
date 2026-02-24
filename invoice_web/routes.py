"""
API Routes Blueprint
Web端电子发票汇总系统 - API路由模块
"""

import json
import os
import tempfile
from datetime import datetime, timedelta
from decimal import Decimal, InvalidOperation
from functools import wraps
from flask import Blueprint, current_app, jsonify, request, send_file, session

from src.models import Invoice

# Create Blueprint for API routes
api = Blueprint('api', __name__, url_prefix='/api')


def login_required(f):
    """登录验证装饰器"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user' not in session:
            return jsonify({'success': False, 'message': '请先登录', 'need_login': True}), 401
        return f(*args, **kwargs)
    return decorated_function


def admin_required(f):
    """管理员权限验证装饰器"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user' not in session:
            return jsonify({'success': False, 'message': '请先登录', 'need_login': True}), 401
        if not session.get('user', {}).get('is_admin', False):
            return jsonify({'success': False, 'message': '需要管理员权限'}), 403
        return f(*args, **kwargs)
    return decorated_function


def get_current_user():
    """获取当前登录用户"""
    return session.get('user', {})


def is_current_user_admin():
    """检查当前用户是否为管理员"""
    return session.get('user', {}).get('is_admin', False)


def get_data_store():
    """获取数据存储实例"""
    return current_app.config['data_store']


def get_invoice_manager():
    """获取发票管理器实例"""
    return current_app.config['invoice_manager']


def get_pdf_parser():
    """获取PDF解析器实例"""
    return current_app.config['pdf_parser']


def get_export_service():
    """获取导出服务实例"""
    return current_app.config['export_service']


def get_voucher_service():
    """获取凭证服务实例"""
    return current_app.config['voucher_service']


def get_docx_export_service():
    """获取DOCX导出服务实例"""
    return current_app.config['docx_export_service']


def get_reimbursement_person_service():
    """获取报销人服务实例"""
    return current_app.config['reimbursement_person_service']


def get_contract_service():
    """获取合同服务实例"""
    return current_app.config['contract_service']


def get_signature_service():
    """获取签章服务实例"""
    return current_app.config['signature_service']


def invoice_to_dict(invoice: Invoice, voucher_count: int = 0, reimbursement_person_name: str = None) -> dict:
    """将Invoice对象转换为字典"""
    # 计算上传时间距今
    time_ago = ""
    if invoice.scan_time:
        delta = datetime.now() - invoice.scan_time
        if delta.days > 0:
            time_ago = f"{delta.days}天前"
        elif delta.seconds >= 3600:
            time_ago = f"{delta.seconds // 3600}小时前"
        elif delta.seconds >= 60:
            time_ago = f"{delta.seconds // 60}分钟前"
        else:
            time_ago = "刚刚"
    
    return {
        'invoice_number': invoice.invoice_number,
        'invoice_date': invoice.invoice_date,
        'item_name': invoice.item_name,
        'amount': str(invoice.amount),
        'remark': invoice.remark,
        'file_path': invoice.file_path,
        'scan_time': invoice.scan_time.isoformat() if invoice.scan_time else None,
        'time_ago': time_ago,
        'uploaded_by': invoice.uploaded_by or '未知',
        'voucher_count': voucher_count,
        'reimbursement_person_id': invoice.reimbursement_person_id,
        'reimbursement_person_name': reimbursement_person_name or '',
        'reimbursement_status': invoice.reimbursement_status or '未报销',
        'record_type': invoice.record_type or 'invoice'
    }


# ========== 认证相关路由 ==========

@api.route('/auth/login', methods=['POST'])
def login():
    """用户登录"""
    data = request.get_json()
    if not data:
        return jsonify({'success': False, 'message': '请提供登录信息'})
    
    username = data.get('username', '').strip()
    password = data.get('password', '')
    
    if not username or not password:
        return jsonify({'success': False, 'message': '用户名和密码不能为空'})
    
    data_store = get_data_store()
    user = data_store.verify_user(username, password)
    
    if user:
        session['user'] = {
            'username': user.username,
            'display_name': user.display_name,
            'is_admin': user.is_admin
        }
        return jsonify({
            'success': True,
            'message': '登录成功',
            'user': {
                'username': user.username,
                'display_name': user.display_name,
                'is_admin': user.is_admin
            }
        })
    else:
        return jsonify({'success': False, 'message': '用户名或密码错误'})


@api.route('/auth/logout', methods=['POST'])
def logout():
    """用户登出"""
    session.pop('user', None)
    return jsonify({'success': True, 'message': '已退出登录'})


@api.route('/auth/status', methods=['GET'])
def auth_status():
    """获取当前登录状态"""
    user = session.get('user')
    if user:
        return jsonify({
            'logged_in': True,
            'user': user
        })
    return jsonify({'logged_in': False})


@api.route('/user/preferences/<string:pref_key>', methods=['GET'])
@login_required
def get_user_preference(pref_key):
    """Get current user's preference by key."""
    current_user = get_current_user()
    username = current_user.get('username', '').strip()
    if not username:
        return jsonify({'success': False, 'message': '未登录用户'}), 401

    value_text = get_data_store().get_user_preference(username, pref_key)
    value = None
    if value_text is not None:
        try:
            value = json.loads(value_text)
        except (TypeError, ValueError):
            value = value_text

    return jsonify({
        'success': True,
        'key': pref_key,
        'value': value
    })


@api.route('/user/preferences/<string:pref_key>', methods=['PUT'])
@login_required
def set_user_preference(pref_key):
    """Save current user's preference by key."""
    data = request.get_json() or {}
    if 'value' not in data:
        return jsonify({'success': False, 'message': '缺少 value 字段'}), 400

    current_user = get_current_user()
    username = current_user.get('username', '').strip()
    if not username:
        return jsonify({'success': False, 'message': '未登录用户'}), 401

    try:
        value_text = json.dumps(data.get('value'), ensure_ascii=False)
    except (TypeError, ValueError):
        return jsonify({'success': False, 'message': 'value 不是有效 JSON 数据'}), 400

    if len(value_text) > 100_000:
        return jsonify({'success': False, 'message': 'value 太大，超过限制'}), 400

    get_data_store().set_user_preference(username, pref_key, value_text)
    return jsonify({'success': True, 'message': '保存成功'})


@api.route('/invoices', methods=['GET'])
@login_required
def get_invoices():
    """
    获取发票列表
    
    Query Parameters:
        search: 搜索关键词（可选）
        start_date: 开始日期（可选，格式 YYYY-MM-DD）
        end_date: 结束日期（可选，格式 YYYY-MM-DD）
        reimbursement_person_id: 报销人ID（可选）
        uploaded_by: 上传人（可选）
        reimbursement_status: 报销状态（可选，未报销 | 已报销）
        record_type: 记录类型（可选，invoice | manual）
    
    Returns:
        JSON: {invoices: [...], total_count: int, total_amount: str}
    """
    person_service = get_reimbursement_person_service()
    data_store = get_data_store()
    search = request.args.get('search', '').strip()
    start_date = request.args.get('start_date', '').strip()
    end_date = request.args.get('end_date', '').strip()
    reimbursement_person_id = request.args.get('reimbursement_person_id', '').strip()
    uploaded_by = request.args.get('uploaded_by', '').strip()
    reimbursement_status = request.args.get('reimbursement_status', '').strip()
    record_type = request.args.get('record_type', '').strip()
    page = request.args.get('page', 1, type=int)
    page_size = request.args.get('page_size', 20, type=int)

    filters = {
        'search': search,
        'start_date': start_date,
        'end_date': end_date,
        'reimbursement_person_id': reimbursement_person_id,
        'uploaded_by': uploaded_by,
        'reimbursement_status': reimbursement_status,
        'record_type': record_type
    }
    current_user = get_current_user()
    if not current_user.get('is_admin', False):
        filters['uploaded_by'] = current_user.get('display_name', '')

    result = data_store.query_invoices(filters=filters, page=page, page_size=page_size)
    all_persons = person_service.get_all_persons()
    person_map = {p.id: p.name for p in all_persons}
    invoice_dicts = []
    for row in result['invoices']:
        inv = row['invoice']
        person_name = person_map.get(inv.reimbursement_person_id, '') if inv.reimbursement_person_id else ''
        invoice_dicts.append(invoice_to_dict(inv, row['voucher_count'], person_name))

    return jsonify({
        'invoices': invoice_dicts,
        'total_count': result['total_count'],
        'total_amount': result['total_amount'],
        'invoice_count': result['invoice_count'],
        'manual_count': result['manual_count'],
        'invoice_amount': result['invoice_amount'],
        'manual_amount': result['manual_amount'],
        'pending_count': result['pending_count'],
        'completed_count': result['completed_count'],
        'page': result['page'],
        'page_size': result['page_size'],
        'total_pages': result['total_pages']
    })

    manager = get_invoice_manager()
    voucher_service = get_voucher_service()
    person_service = get_reimbursement_person_service()
    data_store = get_data_store()
    search = request.args.get('search', '').strip()
    start_date = request.args.get('start_date', '').strip()
    end_date = request.args.get('end_date', '').strip()
    reimbursement_person_id = request.args.get('reimbursement_person_id', '').strip()
    uploaded_by = request.args.get('uploaded_by', '').strip()
    reimbursement_status = request.args.get('reimbursement_status', '').strip()
    record_type = request.args.get('record_type', '').strip()
    
    if search:
        invoices = manager.search_invoices(search)
    else:
        invoices = manager.get_all_invoices()
    
    # 非管理员只能看到自己上传的发票
    current_user = get_current_user()
    if not current_user.get('is_admin', False):
        user_display_name = current_user.get('display_name', '')
        invoices = [inv for inv in invoices if inv.uploaded_by == user_display_name]
    
    # 按日期筛选
    if start_date or end_date:
        filtered = []
        for inv in invoices:
            inv_date = inv.invoice_date
            if start_date and inv_date < start_date:
                continue
            if end_date and inv_date > end_date:
                continue
            filtered.append(inv)
        invoices = filtered
    
    # 按报销人筛选
    if reimbursement_person_id:
        try:
            person_id = int(reimbursement_person_id)
            invoices = [inv for inv in invoices if inv.reimbursement_person_id == person_id]
        except ValueError:
            pass
    
    # 按上传人筛选
    if uploaded_by:
        invoices = [inv for inv in invoices if inv.uploaded_by == uploaded_by]
    
    # 按报销状态筛选
    if reimbursement_status:
        invoices = [inv for inv in invoices if inv.reimbursement_status == reimbursement_status]
    
    # 按记录类型筛选 (Requirements: 13.4, 13.5)
    if record_type:
        invoices = [inv for inv in invoices if inv.record_type == record_type]
    
    # 计算总金额和分类统计 (Requirements: 13.6)
    total_amount = Decimal("0")
    invoice_count = 0
    manual_count = 0
    invoice_amount = Decimal("0")
    manual_amount = Decimal("0")
    
    for inv in invoices:
        total_amount += inv.amount
        if inv.record_type == 'manual':
            manual_count += 1
            manual_amount += inv.amount
        else:
            invoice_count += 1
            invoice_amount += inv.amount
    
    # Build a map of person_id to person_name for efficiency
    all_persons = person_service.get_all_persons()
    person_map = {p.id: p.name for p in all_persons}
    
    # Get voucher counts and person names for each invoice
    invoice_dicts = []
    for inv in invoices:
        voucher_count = voucher_service.get_voucher_count(inv.invoice_number)
        person_name = person_map.get(inv.reimbursement_person_id, '') if inv.reimbursement_person_id else ''
        invoice_dicts.append(invoice_to_dict(inv, voucher_count, person_name))
    
    return jsonify({
        'invoices': invoice_dicts,
        'total_count': len(invoices),
        'total_amount': str(total_amount),
        'invoice_count': invoice_count,
        'manual_count': manual_count,
        'invoice_amount': str(invoice_amount),
        'manual_amount': str(manual_amount)
    })


@api.route('/invoices/<invoice_number>', methods=['GET'])
@login_required
def get_invoice(invoice_number):
    """
    获取单个发票详情
    
    Args:
        invoice_number: 发票号码
    
    Returns:
        JSON: 发票详情或404错误
    """
    manager = get_invoice_manager()
    person_service = get_reimbursement_person_service()
    voucher_service = get_voucher_service()
    invoices = manager.get_all_invoices()
    
    # Build person map
    all_persons = person_service.get_all_persons()
    person_map = {p.id: p.name for p in all_persons}
    
    for invoice in invoices:
        if invoice.invoice_number == invoice_number:
            voucher_count = voucher_service.get_voucher_count(invoice_number)
            person_name = person_map.get(invoice.reimbursement_person_id, '') if invoice.reimbursement_person_id else ''
            return jsonify(invoice_to_dict(invoice, voucher_count, person_name))
    
    return jsonify({'success': False, 'message': '发票不存在'}), 404


def is_valid_invoice(invoice: Invoice) -> tuple:
    """
    检测是否为有效发票
    
    检查发票必要字段是否存在：
    - 发票号码
    - 开票日期
    - 金额
    
    Returns:
        (is_valid: bool, message: str)
    """
    missing_fields = []
    
    if not invoice.invoice_number or not invoice.invoice_number.strip():
        missing_fields.append('发票号码')
    
    if not invoice.invoice_date or not invoice.invoice_date.strip():
        missing_fields.append('开票日期')
    
    if invoice.amount is None or invoice.amount <= 0:
        missing_fields.append('金额')
    
    if missing_fields:
        return False, f'无法识别为有效发票，缺少: {", ".join(missing_fields)}'
    
    return True, '有效发票'


@api.route('/invoices', methods=['POST'])
@login_required
def upload_invoice():
    """
    上传并解析PDF发票
    
    Form Data:
        file: PDF文件
        reimbursement_person_id: 报销人ID（可选）
    
    Returns:
        JSON: 上传结果
    """
    if 'file' not in request.files:
        return jsonify({'success': False, 'message': '未选择文件'})
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'success': False, 'message': '未选择文件'})
    
    if not file.filename.lower().endswith('.pdf'):
        return jsonify({'success': False, 'message': '仅支持PDF文件'})
    
    # Get reimbursement person ID from form data
    reimbursement_person_id = request.form.get('reimbursement_person_id')
    if reimbursement_person_id:
        try:
            reimbursement_person_id = int(reimbursement_person_id)
        except ValueError:
            reimbursement_person_id = None
    
    try:
        # 保存临时文件
        temp_dir = tempfile.gettempdir()
        temp_path = os.path.join(temp_dir, file.filename)
        file.save(temp_path)
        
        # 解析PDF - 返回的是 Invoice 对象
        parser = get_pdf_parser()
        invoice = parser.parse(temp_path)
        
        if not invoice:
            return jsonify({'success': False, 'message': 'PDF解析失败，无法提取发票信息'})
        
        # 检测是否为有效发票
        is_valid, validation_message = is_valid_invoice(invoice)
        if not is_valid:
            return jsonify({
                'success': False, 
                'message': validation_message,
                'is_invalid_invoice': True
            })
        
        # 设置上传人
        current_user = get_current_user()
        invoice.uploaded_by = current_user.get('display_name', current_user.get('username', ''))
        
        # 设置报销人ID
        invoice.reimbursement_person_id = reimbursement_person_id
        
        # 添加发票
        manager = get_invoice_manager()
        result = manager.add_invoice(invoice)
        
        # 如果添加成功，保存PDF数据到数据库
        if result.success:
            data_store = get_data_store()
            with open(temp_path, 'rb') as f:
                pdf_data = f.read()
            data_store.update_pdf_data(invoice.invoice_number, pdf_data)
        
        # Get person name for response
        person_name = ''
        if reimbursement_person_id:
            person_service = get_reimbursement_person_service()
            all_persons = person_service.get_all_persons()
            for p in all_persons:
                if p.id == reimbursement_person_id:
                    person_name = p.name
                    break
        
        if result.is_duplicate:
            # 构建更详细的重复提示信息
            duplicate_msg = result.message
            if result.original_invoice and result.original_invoice.uploaded_by:
                duplicate_msg = f"发票号码 {invoice.invoice_number} 已被 {result.original_invoice.uploaded_by} 上传"
            return jsonify({
                'success': False,
                'is_duplicate': True,
                'message': duplicate_msg,
                'invoice': invoice_to_dict(invoice, 0, person_name),
                'original_invoice': invoice_to_dict(result.original_invoice) if result.original_invoice else None
            })
        
        return jsonify({
            'success': result.success,
            'message': result.message,
            'invoice': invoice_to_dict(invoice, 0, person_name)
        })
        
    except Exception as e:
        error_msg = str(e)
        # 提供更友好的错误信息
        if '无法从PDF提取文本' in error_msg or 'OCR' in error_msg:
            return jsonify({
                'success': False, 
                'message': '该PDF可能是扫描件或图片格式，无法识别文字内容',
                'is_invalid_invoice': True
            })
        elif '无法打开PDF' in error_msg:
            return jsonify({
                'success': False, 
                'message': '无法打开PDF文件，请确认文件格式正确',
                'is_invalid_invoice': True
            })
        return jsonify({'success': False, 'message': f'处理失败: {error_msg}'})


@api.route('/invoices/<invoice_number>', methods=['DELETE'])
@login_required
def delete_invoice(invoice_number):
    """
    删除发票
    
    Args:
        invoice_number: 发票号码
    
    Returns:
        JSON: 删除结果
    """
    manager = get_invoice_manager()
    success = manager.delete_invoice(invoice_number)
    
    if success:
        return jsonify({'success': True, 'message': '删除成功'})
    else:
        return jsonify({'success': False, 'message': '发票不存在'}), 404


@api.route('/invoices/<invoice_number>', methods=['PUT'])
@login_required
def update_invoice(invoice_number):
    """
    修改发票信息
    
    Args:
        invoice_number: 发票号码
    
    JSON Body:
        invoice_date: 开票日期
        item_name: 项目名称
        amount: 金额
        remark: 备注
    
    Returns:
        JSON: 修改结果
    """
    data = request.get_json()
    if not data:
        return jsonify({'success': False, 'message': '请提供修改信息'})
    
    manager = get_invoice_manager()
    data_store = get_data_store()
    
    # 查找发票
    invoice = None
    for inv in manager.get_all_invoices():
        if inv.invoice_number == invoice_number:
            invoice = inv
            break
    
    if not invoice:
        return jsonify({'success': False, 'message': '发票不存在'}), 404
    
    try:
        # 更新字段
        if 'invoice_date' in data:
            invoice.invoice_date = data['invoice_date'].strip()
        if 'item_name' in data:
            invoice.item_name = data['item_name'].strip()
        if 'amount' in data:
            invoice.amount = Decimal(str(data['amount']))
        if 'remark' in data:
            invoice.remark = data['remark'].strip()
        
        # 验证必填字段
        if not invoice.invoice_date:
            return jsonify({'success': False, 'message': '开票日期不能为空'})
        if invoice.amount is None or invoice.amount <= 0:
            return jsonify({'success': False, 'message': '金额必须大于0'})
        
        # 保存到数据库
        data_store.update_invoice(invoice)
        
        return jsonify({
            'success': True,
            'message': '修改成功',
            'invoice': invoice_to_dict(invoice)
        })
        
    except (ValueError, InvalidOperation) as e:
        return jsonify({'success': False, 'message': f'数据格式错误: {str(e)}'})


@api.route('/invoices/export', methods=['GET', 'POST'])
@login_required
def export_invoices():
    """
    导出发票到Excel
    
    GET: 导出所有发票
    POST: 批量导出选中的发票
    
    POST JSON Body:
        invoice_numbers: 发票号码列表 (可选)
        indices: 发票序号列表 (可选，从0开始)
    
    Returns:
        Excel文件下载
    """
    try:
        manager = get_invoice_manager()
        export_service = get_export_service()
        
        all_invoices = manager.get_all_invoices()
        
        # 如果是POST请求，处理批量导出
        if request.method == 'POST':
            data = request.get_json()
            
            # 支持通过发票号码列表导出
            if data and 'invoice_numbers' in data:
                invoice_numbers = data['invoice_numbers']
                invoices = [inv for inv in all_invoices if inv.invoice_number in invoice_numbers]
            # 支持通过序号列表导出
            elif data and 'indices' in data:
                indices = data['indices']
                invoices = [all_invoices[i] for i in indices if 0 <= i < len(all_invoices)]
            else:
                invoices = all_invoices
        else:
            # GET请求导出所有发票
            invoices = all_invoices
        
        if not invoices:
            return jsonify({'success': False, 'message': '没有可导出的发票'}), 400
        
        # 创建临时文件
        temp_dir = tempfile.gettempdir()
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        export_path = os.path.join(temp_dir, f'invoices_export_{timestamp}.xlsx')
        
        # 导出
        export_service.export_to_excel(invoices, export_path)
        
        # 生成文件名
        if len(invoices) == len(all_invoices):
            filename = f'发票汇总_全部_{timestamp}.xlsx'
        else:
            filename = f'发票汇总_已选{len(invoices)}条_{timestamp}.xlsx'
        
        return send_file(
            export_path,
            as_attachment=True,
            download_name=filename,
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        
    except Exception as e:
        logger.error(f'导出Excel失败: {str(e)}')
        return jsonify({'success': False, 'message': f'导出失败: {str(e)}'}), 500


@api.route('/invoices/<invoice_number>/pdf', methods=['GET'])
@login_required
def download_pdf(invoice_number):
    """
    下载或预览发票PDF原件
    
    Args:
        invoice_number: 发票号码
    
    Query Parameters:
        preview: 如果为 true，则内联显示（用于预览）
    
    Returns:
        PDF文件
    """
    try:
        manager = get_invoice_manager()
        invoices = manager.get_all_invoices()
        
        # 是否为预览模式（内联显示）
        preview = request.args.get('preview', 'false').lower() == 'true'
        
        for invoice in invoices:
            if invoice.invoice_number == invoice_number:
                # 检查文件路径
                if not invoice.file_path:
                    logger.error(f"发票 {invoice_number} 没有文件路径")
                    return jsonify({'success': False, 'message': 'PDF文件路径不存在'}), 404
                
                # 检查文件是否存在
                if not os.path.exists(invoice.file_path):
                    logger.error(f"PDF文件不存在: {invoice.file_path}")
                    return jsonify({'success': False, 'message': f'PDF文件不存在: {invoice.file_path}'}), 404
                
                # 返回PDF文件
                return send_file(
                    invoice.file_path,
                    as_attachment=not preview,  # 预览时不作为附件
                    download_name=f'{invoice_number}.pdf',
                    mimetype='application/pdf'
                )
        
        logger.error(f"发票不存在: {invoice_number}")
        return jsonify({'success': False, 'message': '发票不存在'}), 404
        
    except Exception as e:
        logger.error(f"获取PDF文件失败: {str(e)}")
        return jsonify({'success': False, 'message': f'获取PDF文件失败: {str(e)}'}), 500


# ========== 支出凭证相关路由 ==========

@api.route('/invoices/<invoice_number>/vouchers', methods=['POST'])
@login_required
def upload_voucher(invoice_number):
    """
    上传支出凭证
    
    Args:
        invoice_number: 发票号码
    
    Form Data:
        file: 凭证图片文件 (JPG, PNG, JPEG)
    
    Returns:
        JSON: 上传结果
    """
    # Check if invoice exists
    data_store = get_data_store()
    invoice = data_store.get_invoice_by_number(invoice_number)
    if not invoice:
        return jsonify({'success': False, 'message': '发票不存在'}), 404
    
    if 'file' not in request.files:
        return jsonify({'success': False, 'message': '未选择文件'})
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'success': False, 'message': '未选择文件'})
    
    voucher_service = get_voucher_service()
    
    # Validate file format
    if not voucher_service.validate_file_format(file.filename):
        return jsonify({'success': False, 'message': '仅支持JPG、PNG格式图片'}), 400
    
    try:
        # Read file data and add voucher
        file_data = file.read()
        voucher = voucher_service.add_voucher(invoice_number, file_data, file.filename)
        
        return jsonify({
            'success': True,
            'message': '凭证上传成功',
            'voucher': {
                'id': voucher.id,
                'invoice_number': voucher.invoice_number,
                'original_filename': voucher.original_filename,
                'upload_time': voucher.upload_time.isoformat()
            }
        })
        
    except ValueError as e:
        return jsonify({'success': False, 'message': str(e)}), 400
    except Exception as e:
        return jsonify({'success': False, 'message': f'文件保存失败: {str(e)}'}), 500


@api.route('/invoices/<invoice_number>/vouchers', methods=['GET'])
@login_required
def get_vouchers(invoice_number):
    """
    获取发票的所有支出凭证
    
    Args:
        invoice_number: 发票号码
    
    Returns:
        JSON: 凭证列表
    """
    # Check if invoice exists
    data_store = get_data_store()
    invoice = data_store.get_invoice_by_number(invoice_number)
    if not invoice:
        return jsonify({'success': False, 'message': '发票不存在'}), 404
    
    voucher_service = get_voucher_service()
    vouchers = voucher_service.get_vouchers(invoice_number)
    
    return jsonify({
        'vouchers': [
            {
                'id': v.id,
                'invoice_number': v.invoice_number,
                'original_filename': v.original_filename,
                'upload_time': v.upload_time.isoformat()
            }
            for v in vouchers
        ],
        'count': len(vouchers)
    })


@api.route('/vouchers/<int:voucher_id>', methods=['DELETE'])
@login_required
def delete_voucher(voucher_id):
    """
    删除支出凭证
    
    Args:
        voucher_id: 凭证ID
    
    Returns:
        JSON: 删除结果
    """
    voucher_service = get_voucher_service()
    success = voucher_service.delete_voucher(voucher_id)
    
    if success:
        return jsonify({'success': True, 'message': '凭证删除成功'})
    else:
        return jsonify({'success': False, 'message': '凭证不存在'}), 404


@api.route('/vouchers/<int:voucher_id>/image', methods=['GET'])
@login_required
def get_voucher_image(voucher_id):
    """
    获取凭证图片（用于预览）
    
    Args:
        voucher_id: 凭证ID
    
    Returns:
        图片文件
    """
    data_store = get_data_store()
    
    # Get voucher info from database
    with data_store._get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT file_path, original_filename FROM expense_vouchers WHERE id = ?",
            (voucher_id,)
        )
        row = cursor.fetchone()
    
    if not row:
        return jsonify({'success': False, 'message': '凭证不存在'}), 404
    
    file_path, original_filename = row
    
    # Try to find the file, handling path inconsistencies
    if not os.path.exists(file_path):
        # Get project root (invoice-management directory)
        current_file = os.path.abspath(__file__)
        invoice_web_dir = os.path.dirname(current_file)
        project_root = os.path.dirname(invoice_web_dir)
        
        # Normalize path separators
        normalized_path = file_path.replace('\\', '/')
        
        # Try different path corrections
        corrected_path = None
        
        # Case 1: Path contains "invoice_web/data/vouchers/" - remove "invoice_web/"
        if 'invoice_web/data/vouchers/' in normalized_path:
            parts = normalized_path.split('invoice_web/data/vouchers/')
            if len(parts) > 1:
                corrected_path = os.path.join(project_root, 'data', 'vouchers', parts[-1])
        # Case 2: Path contains "data/vouchers/" but file doesn't exist
        elif 'data/vouchers/' in normalized_path:
            parts = normalized_path.split('data/vouchers/')
            if len(parts) > 1:
                corrected_path = os.path.join(project_root, 'data', 'vouchers', parts[-1])
        
        if corrected_path and os.path.exists(corrected_path):
            file_path = corrected_path
        else:
            return jsonify({'success': False, 'message': '凭证文件不存在'}), 404
    
    # Determine mimetype based on file extension
    extension = original_filename.rsplit('.', 1)[-1].lower() if '.' in original_filename else ''
    mimetype_map = {
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png'
    }
    mimetype = mimetype_map.get(extension, 'application/octet-stream')
    
    return send_file(
        file_path,
        mimetype=mimetype,
        as_attachment=False
    )


@api.route('/invoices/<invoice_number>/export-docx', methods=['GET'])
@login_required
def export_invoice_docx(invoice_number):
    """
    导出发票和支出凭证为DOCX文档
    
    Args:
        invoice_number: 发票号码
    
    Returns:
        DOCX文件下载
    """
    # Check if invoice exists
    data_store = get_data_store()
    invoice = data_store.get_invoice_by_number(invoice_number)
    if not invoice:
        return jsonify({'success': False, 'message': '发票不存在'}), 404
    
    try:
        docx_service = get_docx_export_service()
        
        # Generate output path in temp directory
        temp_dir = tempfile.gettempdir()
        filename = docx_service.generate_export_filename(invoice_number)
        output_path = os.path.join(temp_dir, filename)
        
        # Export to DOCX
        docx_service.export_invoice_with_vouchers(invoice_number, output_path)
        
        return send_file(
            output_path,
            as_attachment=True,
            download_name=filename,
            mimetype='application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        )
        
    except ValueError as e:
        return jsonify({'success': False, 'message': str(e)}), 404
    except RuntimeError as e:
        return jsonify({'success': False, 'message': str(e)}), 500
    except Exception as e:
        return jsonify({'success': False, 'message': f'文档生成失败: {str(e)}'}), 500


@api.route('/invoices/export-docx-batch', methods=['POST'])
@login_required
def export_invoices_docx_batch():
    """
    批量导出多个发票和支出凭证为单个DOCX文档
    
    每个发票按顺序排列：第一页是发票PDF图片，第二页是凭证
    
    JSON Body:
        invoice_numbers: 发票号码列表（按顺序）
    
    Returns:
        DOCX文件下载
    """
    data = request.get_json()
    if not data:
        return jsonify({'success': False, 'message': '请提供发票列表'}), 400
    
    invoice_numbers = data.get('invoice_numbers', [])
    if not invoice_numbers:
        return jsonify({'success': False, 'message': '发票列表不能为空'}), 400
    
    # Validate that at least one invoice exists
    data_store = get_data_store()
    valid_invoices = []
    for inv_num in invoice_numbers:
        invoice = data_store.get_invoice_by_number(inv_num)
        if invoice:
            valid_invoices.append(inv_num)
    
    if not valid_invoices:
        return jsonify({'success': False, 'message': '没有找到有效的发票'}), 404
    
    try:
        docx_service = get_docx_export_service()
        
        # Generate output path in temp directory
        temp_dir = tempfile.gettempdir()
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f"发票批量导出_{timestamp}.docx"
        output_path = os.path.join(temp_dir, filename)
        
        # Export multiple invoices to DOCX
        docx_service.export_multiple_invoices(valid_invoices, output_path)
        
        return send_file(
            output_path,
            as_attachment=True,
            download_name=filename,
            mimetype='application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        )
        
    except ValueError as e:
        return jsonify({'success': False, 'message': str(e)}), 400
    except RuntimeError as e:
        return jsonify({'success': False, 'message': str(e)}), 500
    except Exception as e:
        return jsonify({'success': False, 'message': f'文档生成失败: {str(e)}'}), 500


# ========== 报销人相关路由 ==========

@api.route('/reimbursement-persons', methods=['GET'])
@login_required
def get_reimbursement_persons():
    """
    获取所有报销人列表
    
    Returns:
        JSON: 报销人列表，用于下拉选择
    """
    person_service = get_reimbursement_person_service()
    persons = person_service.get_all_persons()
    
    return jsonify({
        'persons': [
            {
                'id': p.id,
                'name': p.name,
                'created_time': p.created_time.isoformat()
            }
            for p in persons
        ],
        'count': len(persons)
    })


@api.route('/reimbursement-persons', methods=['POST'])
@login_required
def create_reimbursement_person():
    """
    创建新报销人或返回已存在的报销人
    
    JSON Body:
        name: 报销人姓名
    
    Returns:
        JSON: 报销人信息
    """
    data = request.get_json()
    if not data:
        return jsonify({'success': False, 'message': '请提供报销人信息'}), 400
    
    name = data.get('name', '').strip()
    if not name:
        return jsonify({'success': False, 'message': '请指定报销人'}), 400
    
    person_service = get_reimbursement_person_service()
    
    try:
        # Use get_or_create to avoid duplicates
        person = person_service.get_or_create_person(name)
        
        return jsonify({
            'success': True,
            'message': '报销人创建成功',
            'person': {
                'id': person.id,
                'name': person.name,
                'created_time': person.created_time.isoformat()
            }
        })
        
    except ValueError as e:
        return jsonify({'success': False, 'message': str(e)}), 400
    except Exception as e:
        return jsonify({'success': False, 'message': f'创建失败: {str(e)}'}), 500


# ========== 上传人相关路由 ==========

@api.route('/uploaders', methods=['GET'])
@login_required
def get_uploaders():
    """
    获取所有上传人列表（去重）
    
    Returns:
        JSON: 上传人列表，用于下拉筛选
    """
    manager = get_invoice_manager()
    invoices = manager.get_all_invoices()
    
    # 获取所有不重复的上传人
    uploaders = set()
    for inv in invoices:
        if inv.uploaded_by:
            uploaders.add(inv.uploaded_by)
    
    # 按名称排序
    sorted_uploaders = sorted(list(uploaders))
    
    return jsonify({
        'uploaders': sorted_uploaders,
        'count': len(sorted_uploaders)
    })


# ========== 用户管理相关路由（仅管理员） ==========

@api.route('/admin/users', methods=['GET'])
@admin_required
def get_all_users():
    """
    获取所有用户列表（仅管理员）
    
    Returns:
        JSON: 用户列表
    """
    data_store = get_data_store()
    users = data_store.get_all_users()
    
    return jsonify({
        'users': [
            {
                'id': u.id,
                'username': u.username,
                'display_name': u.display_name,
                'is_admin': u.is_admin,
                'created_at': u.created_at.isoformat()
            }
            for u in users
        ],
        'count': len(users)
    })


@api.route('/admin/users', methods=['POST'])
@admin_required
def create_user():
    """
    创建新用户（仅管理员）
    
    JSON Body:
        username: 用户名
        password: 密码
        display_name: 显示名称
        is_admin: 是否为管理员（可选，默认False）
    
    Returns:
        JSON: 创建结果
    """
    data = request.get_json()
    if not data:
        return jsonify({'success': False, 'message': '请提供用户信息'}), 400
    
    username = data.get('username', '').strip()
    password = data.get('password', '')
    display_name = data.get('display_name', '').strip()
    is_admin = data.get('is_admin', False)
    
    if not username or not password or not display_name:
        return jsonify({'success': False, 'message': '用户名、密码和显示名称不能为空'}), 400
    
    if len(password) < 6:
        return jsonify({'success': False, 'message': '密码长度至少6位'}), 400
    
    data_store = get_data_store()
    success = data_store.create_user(username, password, display_name, is_admin)
    
    if success:
        return jsonify({'success': True, 'message': '用户创建成功'})
    else:
        return jsonify({'success': False, 'message': '用户名已存在'}), 400


@api.route('/admin/users/<int:user_id>', methods=['PUT'])
@admin_required
def update_user(user_id):
    """
    更新用户信息（仅管理员）
    
    Args:
        user_id: 用户ID
    
    JSON Body:
        display_name: 显示名称（可选）
        is_admin: 是否为管理员（可选）
        password: 新密码（可选）
    
    Returns:
        JSON: 更新结果
    """
    data = request.get_json()
    if not data:
        return jsonify({'success': False, 'message': '请提供更新信息'}), 400
    
    display_name = data.get('display_name')
    is_admin = data.get('is_admin')
    password = data.get('password')
    
    # 验证密码长度
    if password is not None and len(password) < 6:
        return jsonify({'success': False, 'message': '密码长度至少6位'}), 400
    
    data_store = get_data_store()
    success = data_store.update_user(user_id, display_name, is_admin, password)
    
    if success:
        return jsonify({'success': True, 'message': '用户更新成功'})
    else:
        return jsonify({'success': False, 'message': '用户不存在'}), 404


@api.route('/invoices/<invoice_number>/reimbursement-status', methods=['PUT'])
@admin_required
def update_reimbursement_status(invoice_number):
    """
    更新发票的报销状态（仅管理员）
    
    Args:
        invoice_number: 发票号码
    
    JSON Body:
        status: 报销状态（未报销 | 已报销）
    
    Returns:
        JSON: 更新结果
    """
    data = request.get_json()
    if not data:
        return jsonify({'success': False, 'message': '请提供状态信息'}), 400
    
    status = data.get('status', '').strip()
    if status not in ('未报销', '已报销'):
        return jsonify({'success': False, 'message': '无效的报销状态，必须是"未报销"或"已报销"'}), 400
    
    data_store = get_data_store()
    
    # Check if invoice exists
    invoice = data_store.get_invoice_by_number(invoice_number)
    if not invoice:
        return jsonify({'success': False, 'message': '发票不存在'}), 404
    
    try:
        success = data_store.update_reimbursement_status(invoice_number, status)
        if success:
            return jsonify({
                'success': True,
                'message': '报销状态更新成功',
                'invoice_number': invoice_number,
                'reimbursement_status': status
            })
        else:
            return jsonify({'success': False, 'message': '更新失败'}), 500
    except ValueError as e:
        return jsonify({'success': False, 'message': str(e)}), 400


@api.route('/admin/users/<int:user_id>', methods=['DELETE'])
@admin_required
def delete_user(user_id):
    """
    删除用户（仅管理员）
    
    Args:
        user_id: 用户ID
    
    Returns:
        JSON: 删除结果
    """
    # 不能删除自己
    current_user = get_current_user()
    data_store = get_data_store()
    
    # 获取要删除的用户
    users = data_store.get_all_users()
    target_user = None
    for u in users:
        if u.id == user_id:
            target_user = u
            break
    
    if not target_user:
        return jsonify({'success': False, 'message': '用户不存在'}), 404
    
    if target_user.username == current_user.get('username'):
        return jsonify({'success': False, 'message': '不能删除自己'}), 400
    
    success = data_store.delete_user(user_id)
    
    if success:
        return jsonify({'success': True, 'message': '用户删除成功'})
    else:
        return jsonify({'success': False, 'message': '删除失败'}), 500


# ========== 合同相关路由 ==========

@api.route('/invoices/<invoice_number>/contract', methods=['POST'])
@login_required
def upload_contract(invoice_number):
    """
    上传发票合同
    
    Args:
        invoice_number: 发票号码
    
    Form Data:
        file: 合同文件 (PDF, DOC, DOCX, JPG, PNG)
    
    Returns:
        JSON: 上传结果
    """
    if 'file' not in request.files:
        return jsonify({'success': False, 'message': '未选择文件'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'success': False, 'message': '未选择文件'}), 400
    
    # 验证文件格式
    allowed_extensions = {'pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png'}
    ext = file.filename.rsplit('.', 1)[-1].lower() if '.' in file.filename else ''
    if ext not in allowed_extensions:
        return jsonify({'success': False, 'message': '仅支持PDF、DOC、DOCX、JPG、PNG格式文件'}), 400
    
    try:
        contract_service = get_contract_service()
        file_data = file.read()
        
        success, message, contract = contract_service.upload_contract(
            invoice_number, file_data, file.filename
        )
        
        if success:
            return jsonify({
                'success': True,
                'message': message,
                'contract': {
                    'id': contract.id,
                    'invoice_number': contract.invoice_number,
                    'original_filename': contract.original_filename,
                    'upload_time': contract.upload_time.isoformat()
                }
            })
        else:
            return jsonify({'success': False, 'message': message}), 400
            
    except Exception as e:
        return jsonify({'success': False, 'message': f'上传失败: {str(e)}'}), 500


@api.route('/invoices/<invoice_number>/contract', methods=['GET'])
@login_required
def get_contract(invoice_number):
    """
    获取发票的合同信息
    
    Args:
        invoice_number: 发票号码
    
    Returns:
        JSON: 合同信息
    """
    contract_service = get_contract_service()
    contract = contract_service.get_contract(invoice_number)
    
    if contract:
        return jsonify({
            'has_contract': True,
            'contract': {
                'id': contract.id,
                'invoice_number': contract.invoice_number,
                'original_filename': contract.original_filename,
                'upload_time': contract.upload_time.isoformat()
            }
        })
    else:
        return jsonify({'has_contract': False, 'contract': None})


@api.route('/invoices/<invoice_number>/contract/download', methods=['GET'])
@login_required
def download_contract(invoice_number):
    """
    下载发票合同文件
    
    Args:
        invoice_number: 发票号码
    
    Returns:
        合同文件
    """
    contract_service = get_contract_service()
    result = contract_service.get_contract_file(invoice_number)
    
    if not result:
        return jsonify({'success': False, 'message': '合同不存在'}), 404
    
    file_data, original_filename = result
    
    # 确定MIME类型
    ext = original_filename.rsplit('.', 1)[-1].lower() if '.' in original_filename else ''
    mimetype_map = {
        'pdf': 'application/pdf',
        'doc': 'application/msword',
        'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png'
    }
    mimetype = mimetype_map.get(ext, 'application/octet-stream')
    
    # 创建临时文件用于发送
    import tempfile
    temp_dir = tempfile.gettempdir()
    temp_path = os.path.join(temp_dir, original_filename)
    with open(temp_path, 'wb') as f:
        f.write(file_data)
    
    return send_file(
        temp_path,
        as_attachment=True,
        download_name=original_filename,
        mimetype=mimetype
    )


@api.route('/invoices/<invoice_number>/contract', methods=['DELETE'])
@login_required
def delete_contract(invoice_number):
    """
    删除发票合同
    
    Args:
        invoice_number: 发票号码
    
    Returns:
        JSON: 删除结果
    """
    contract_service = get_contract_service()
    success, message = contract_service.delete_contract(invoice_number)
    
    if success:
        return jsonify({'success': True, 'message': message})
    else:
        return jsonify({'success': False, 'message': message}), 404


# ========== 电子签章相关路由 ==========

@api.route('/invoices/<invoice_number>/signature', methods=['POST'])
@admin_required
def upload_signature(invoice_number):
    """
    上传电子签章（仅管理员）
    
    Args:
        invoice_number: 发票号码
    
    Form Data:
        file: 签章图片文件 (PNG, JPG)
        position_x: X坐标（可选，默认0）
        position_y: Y坐标（可选，默认0）
        width: 宽度（可选，默认100）
        height: 高度（可选，默认100）
        page_number: 页码（可选，默认0）
    
    Returns:
        JSON: 上传结果
    """
    if 'file' not in request.files:
        return jsonify({'success': False, 'message': '未选择文件'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'success': False, 'message': '未选择文件'}), 400
    
    # 验证文件格式
    allowed_extensions = {'png', 'jpg', 'jpeg'}
    ext = file.filename.rsplit('.', 1)[-1].lower() if '.' in file.filename else ''
    if ext not in allowed_extensions:
        return jsonify({'success': False, 'message': '仅支持PNG、JPG格式图片'}), 400
    
    try:
        signature_service = get_signature_service()
        file_data = file.read()
        
        # 获取位置参数
        position_x = float(request.form.get('position_x', 0))
        position_y = float(request.form.get('position_y', 0))
        width = float(request.form.get('width', 100))
        height = float(request.form.get('height', 100))
        page_number = int(request.form.get('page_number', 0))
        
        success, message, signature = signature_service.upload_signature(
            invoice_number, file_data, file.filename,
            position_x, position_y, width, height, page_number
        )
        
        if success:
            return jsonify({
                'success': True,
                'message': message,
                'signature': {
                    'id': signature.id,
                    'invoice_number': signature.invoice_number,
                    'original_filename': signature.original_filename,
                    'position_x': signature.position_x,
                    'position_y': signature.position_y,
                    'width': signature.width,
                    'height': signature.height,
                    'page_number': signature.page_number,
                    'upload_time': signature.upload_time.isoformat()
                }
            })
        else:
            return jsonify({'success': False, 'message': message}), 400
            
    except Exception as e:
        return jsonify({'success': False, 'message': f'上传失败: {str(e)}'}), 500


@api.route('/invoices/<invoice_number>/signature', methods=['GET'])
@login_required
def get_signature(invoice_number):
    """
    获取发票的电子签章信息
    
    Args:
        invoice_number: 发票号码
    
    Returns:
        JSON: 签章信息
    """
    signature_service = get_signature_service()
    signature = signature_service.get_signature(invoice_number)
    
    if signature:
        return jsonify({
            'has_signature': True,
            'signature': {
                'id': signature.id,
                'invoice_number': signature.invoice_number,
                'original_filename': signature.original_filename,
                'position_x': signature.position_x,
                'position_y': signature.position_y,
                'width': signature.width,
                'height': signature.height,
                'page_number': signature.page_number,
                'upload_time': signature.upload_time.isoformat()
            }
        })
    else:
        return jsonify({'has_signature': False, 'signature': None})


@api.route('/invoices/<invoice_number>/signature/position', methods=['PUT'])
@admin_required
def update_signature_position(invoice_number):
    """
    更新电子签章位置（仅管理员）
    
    Args:
        invoice_number: 发票号码
    
    JSON Body:
        position_x: X坐标
        position_y: Y坐标
        width: 宽度
        height: 高度
        page_number: 页码（可选）
    
    Returns:
        JSON: 更新结果
    """
    data = request.get_json()
    if not data:
        return jsonify({'success': False, 'message': '请提供位置信息'}), 400
    
    try:
        position_x = float(data.get('position_x', 0))
        position_y = float(data.get('position_y', 0))
        width = float(data.get('width', 100))
        height = float(data.get('height', 100))
        page_number = int(data.get('page_number', 0))
        
        signature_service = get_signature_service()
        success, message = signature_service.update_position(
            invoice_number, position_x, position_y, width, height, page_number
        )
        
        if success:
            return jsonify({'success': True, 'message': message})
        else:
            return jsonify({'success': False, 'message': message}), 404
            
    except (ValueError, TypeError) as e:
        return jsonify({'success': False, 'message': f'参数格式错误: {str(e)}'}), 400


@api.route('/invoices/<invoice_number>/signature', methods=['DELETE'])
@admin_required
def delete_signature(invoice_number):
    """
    删除电子签章（仅管理员）
    
    Args:
        invoice_number: 发票号码
    
    Returns:
        JSON: 删除结果
    """
    signature_service = get_signature_service()
    success, message = signature_service.delete_signature(invoice_number)
    
    if success:
        return jsonify({'success': True, 'message': message})
    else:
        return jsonify({'success': False, 'message': message}), 404


@api.route('/invoices/<invoice_number>/signature/image', methods=['GET'])
@login_required
def get_signature_image(invoice_number):
    """
    获取签章图片（用于预览）
    
    Args:
        invoice_number: 发票号码
    
    Returns:
        图片文件
    """
    signature_service = get_signature_service()
    result = signature_service.get_signature_image(invoice_number)
    
    if not result:
        return jsonify({'success': False, 'message': '签章不存在'}), 404
    
    file_data, original_filename = result
    
    # 确定MIME类型
    ext = original_filename.rsplit('.', 1)[-1].lower() if '.' in original_filename else ''
    mimetype_map = {
        'png': 'image/png',
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg'
    }
    mimetype = mimetype_map.get(ext, 'image/png')
    
    # 创建临时文件用于发送
    import tempfile
    temp_dir = tempfile.gettempdir()
    temp_path = os.path.join(temp_dir, original_filename)
    with open(temp_path, 'wb') as f:
        f.write(file_data)
    
    return send_file(
        temp_path,
        mimetype=mimetype,
        as_attachment=False
    )


@api.route('/invoices/<invoice_number>/pdf-with-signature', methods=['GET'])
@login_required
def get_pdf_with_signature(invoice_number):
    """
    导出带签章的PDF
    
    Args:
        invoice_number: 发票号码
    
    Returns:
        带签章的PDF文件
    """
    signature_service = get_signature_service()
    result = signature_service.render_pdf_with_signature(invoice_number)
    
    if not result:
        return jsonify({'success': False, 'message': '无法生成带签章的PDF'}), 404
    
    pdf_data, filename = result
    
    # 创建临时文件用于发送
    import tempfile
    temp_dir = tempfile.gettempdir()
    temp_path = os.path.join(temp_dir, filename)
    with open(temp_path, 'wb') as f:
        f.write(pdf_data)
    
    return send_file(
        temp_path,
        as_attachment=True,
        download_name=filename,
        mimetype='application/pdf'
    )


@api.route('/invoices/<invoice_number>/pdf-dimensions', methods=['GET'])
@login_required
def get_pdf_dimensions(invoice_number):
    """
    获取发票PDF的实际尺寸
    
    Args:
        invoice_number: 发票号码
    
    Returns:
        JSON: {width: float, height: float}
    """
    try:
        data_store = get_data_store()
        
        # 获取PDF数据
        pdf_data = data_store.get_pdf_data(invoice_number)
        if not pdf_data:
            # 尝试从文件路径读取
            invoice = data_store.get_invoice_by_number(invoice_number)
            if not invoice:
                return jsonify({'success': False, 'message': '发票不存在'}), 404
            if not os.path.exists(invoice.file_path):
                return jsonify({'success': False, 'message': 'PDF文件不存在'}), 404
            with open(invoice.file_path, 'rb') as f:
                pdf_data = f.read()
        
        # 使用PyMuPDF获取尺寸
        try:
            import fitz
            doc = fitz.open(stream=pdf_data, filetype="pdf")
            page = doc[0]
            page_rect = page.rect
            width = page_rect.width
            height = page_rect.height
            doc.close()
            
            return jsonify({
                'success': True,
                'width': width,
                'height': height
            })
        except ImportError:
            # 如果没有PyMuPDF，返回默认A4尺寸
            return jsonify({
                'success': True,
                'width': 595,
                'height': 842
            })
            
    except Exception as e:
        return jsonify({'success': False, 'message': f'获取PDF尺寸失败: {str(e)}'}), 500


# ========== 签章库相关路由 ==========

@api.route('/signature-templates', methods=['GET'])
@admin_required
def get_signature_templates():
    """
    获取所有签章模板（仅管理员）
    
    Returns:
        JSON: 签章模板列表
    """
    signature_service = get_signature_service()
    templates = signature_service.get_all_templates()
    
    return jsonify({
        'templates': [
            {
                'id': t.id,
                'name': t.name,
                'original_filename': t.original_filename,
                'upload_time': t.upload_time.isoformat()
            }
            for t in templates
        ],
        'count': len(templates)
    })


@api.route('/signature-templates', methods=['POST'])
@admin_required
def upload_signature_template():
    """
    上传签章模板到签章库（仅管理员）
    
    Form Data:
        file: 签章图片文件 (PNG, JPG)
        name: 签章名称
    
    Returns:
        JSON: 上传结果
    """
    if 'file' not in request.files:
        return jsonify({'success': False, 'message': '未选择文件'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'success': False, 'message': '未选择文件'}), 400
    
    # 验证文件格式
    allowed_extensions = {'png', 'jpg', 'jpeg'}
    ext = file.filename.rsplit('.', 1)[-1].lower() if '.' in file.filename else ''
    if ext not in allowed_extensions:
        return jsonify({'success': False, 'message': '仅支持PNG、JPG格式图片'}), 400
    
    name = request.form.get('name', '').strip()
    if not name:
        name = file.filename.rsplit('.', 1)[0] if '.' in file.filename else file.filename
    
    try:
        signature_service = get_signature_service()
        file_data = file.read()
        
        success, message, template = signature_service.upload_template(
            name, file_data, file.filename
        )
        
        if success:
            return jsonify({
                'success': True,
                'message': message,
                'template': {
                    'id': template.id,
                    'name': template.name,
                    'original_filename': template.original_filename,
                    'upload_time': template.upload_time.isoformat()
                }
            })
        else:
            return jsonify({'success': False, 'message': message}), 400
            
    except Exception as e:
        return jsonify({'success': False, 'message': f'上传失败: {str(e)}'}), 500


@api.route('/signature-templates/<int:template_id>', methods=['DELETE'])
@admin_required
def delete_signature_template(template_id):
    """
    删除签章模板（仅管理员）
    
    Args:
        template_id: 模板ID
    
    Returns:
        JSON: 删除结果
    """
    signature_service = get_signature_service()
    success, message = signature_service.delete_template(template_id)
    
    if success:
        return jsonify({'success': True, 'message': message})
    else:
        return jsonify({'success': False, 'message': message}), 404


@api.route('/signature-templates/<int:template_id>/image', methods=['GET'])
@admin_required
def get_signature_template_image(template_id):
    """
    获取签章模板图片（用于预览）
    
    Args:
        template_id: 模板ID
    
    Returns:
        图片文件
    """
    signature_service = get_signature_service()
    result = signature_service.get_template_image(template_id)
    
    if not result:
        return jsonify({'success': False, 'message': '签章模板不存在'}), 404
    
    file_data, original_filename = result
    
    # 确定MIME类型
    ext = original_filename.rsplit('.', 1)[-1].lower() if '.' in original_filename else ''
    mimetype_map = {
        'png': 'image/png',
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg'
    }
    mimetype = mimetype_map.get(ext, 'image/png')
    
    # 创建临时文件用于发送
    import tempfile
    temp_dir = tempfile.gettempdir()
    temp_path = os.path.join(temp_dir, original_filename)
    with open(temp_path, 'wb') as f:
        f.write(file_data)
    
    return send_file(
        temp_path,
        mimetype=mimetype,
        as_attachment=False
    )


@api.route('/invoices/<invoice_number>/apply-signature-template', methods=['POST'])
@admin_required
def apply_signature_template(invoice_number):
    """
    将签章模板应用到发票（仅管理员）
    
    Args:
        invoice_number: 发票号码
    
    JSON Body:
        template_id: 签章模板ID
        position_x: X坐标（可选，默认400）
        position_y: Y坐标（可选，默认700）
        width: 宽度（可选，默认100）
        height: 高度（可选，默认100）
        page_number: 页码（可选，默认0）
    
    Returns:
        JSON: 应用结果
    """
    data = request.get_json()
    if not data:
        return jsonify({'success': False, 'message': '请提供签章信息'}), 400
    
    template_id = data.get('template_id')
    if not template_id:
        return jsonify({'success': False, 'message': '请选择签章模板'}), 400
    
    try:
        position_x = float(data.get('position_x', 400))
        position_y = float(data.get('position_y', 700))
        width = float(data.get('width', 100))
        height = float(data.get('height', 100))
        page_number = int(data.get('page_number', 0))
        
        signature_service = get_signature_service()
        success, message, signature = signature_service.apply_template_to_invoice(
            invoice_number, template_id,
            position_x, position_y, width, height, page_number
        )
        
        if success:
            return jsonify({
                'success': True,
                'message': message,
                'signature': {
                    'id': signature.id,
                    'invoice_number': signature.invoice_number,
                    'original_filename': signature.original_filename,
                    'position_x': signature.position_x,
                    'position_y': signature.position_y,
                    'width': signature.width,
                    'height': signature.height,
                    'page_number': signature.page_number,
                    'upload_time': signature.upload_time.isoformat()
                }
            })
        else:
            return jsonify({'success': False, 'message': message}), 400
            
    except (ValueError, TypeError) as e:
        return jsonify({'success': False, 'message': f'参数格式错误: {str(e)}'}), 400
