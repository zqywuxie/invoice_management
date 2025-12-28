"""
User Portal API Blueprint
用户端API模块 - 提供用户端专用API接口
"""

import os
import sqlite3
import tempfile
from datetime import datetime
from decimal import Decimal
from functools import wraps
from flask import Blueprint, current_app, jsonify, request, send_file, session

from src.models import Invoice


# Create Blueprint for user API routes
user_api = Blueprint('user_api', __name__, url_prefix='/user/api')


def user_login_required(f):
    """用户登录验证装饰器（API版本）"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user' not in session:
            return jsonify({'success': False, 'message': '请先登录', 'need_login': True}), 401
        return f(*args, **kwargs)
    return decorated_function


def get_current_user():
    """获取当前登录用户"""
    return session.get('user', {})


def get_data_store():
    """获取数据存储实例"""
    return current_app.config['data_store']


def get_invoice_manager():
    """获取发票管理器实例"""
    return current_app.config['invoice_manager']


def get_pdf_parser():
    """获取PDF解析器实例"""
    return current_app.config['pdf_parser']


def get_voucher_service():
    """获取凭证服务实例"""
    return current_app.config['voucher_service']


def get_reimbursement_person_service():
    """获取报销人服务实例"""
    return current_app.config['reimbursement_person_service']


def get_contract_service():
    """获取合同服务实例"""
    return current_app.config['contract_service']


# 大额发票金额阈值
LARGE_INVOICE_THRESHOLD = 10000


def invoice_to_dict(invoice: Invoice, voucher_count: int = 0, reimbursement_person_name: str = None) -> dict:
    """将Invoice对象转换为字典"""
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


def is_valid_invoice(invoice: Invoice) -> tuple:
    """
    检测是否为有效发票
    
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


# ========== 认证相关路由 ==========

@user_api.route('/login', methods=['POST'])
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
                'display_name': user.display_name
            }
        })
    else:
        return jsonify({'success': False, 'message': '用户名或密码错误'}), 401


@user_api.route('/logout', methods=['POST'])
def logout():
    """用户登出"""
    session.pop('user', None)
    return jsonify({'success': True, 'message': '已退出登录'})


@user_api.route('/status', methods=['GET'])
def auth_status():
    """获取当前登录状态"""
    user = session.get('user')
    if user:
        return jsonify({
            'logged_in': True,
            'user': {
                'username': user.get('username'),
                'display_name': user.get('display_name')
            }
        })
    return jsonify({'logged_in': False})


# ========== 上传相关路由 ==========

@user_api.route('/upload', methods=['POST'])
@user_login_required
def upload_pdf():
    """
    上传并解析PDF发票（不持久化）
    
    Form Data:
        file: PDF文件
    
    Returns:
        JSON: 解析结果
    """
    if 'file' not in request.files:
        return jsonify({'success': False, 'message': '未选择文件'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'success': False, 'message': '未选择文件'}), 400
    
    if not file.filename.lower().endswith('.pdf'):
        return jsonify({'success': False, 'message': '仅支持PDF文件'}), 400
    
    try:
        # 保存临时文件
        temp_dir = tempfile.gettempdir()
        temp_path = os.path.join(temp_dir, file.filename)
        file.save(temp_path)
        
        # 解析PDF
        parser = get_pdf_parser()
        invoice = parser.parse(temp_path)
        
        if not invoice:
            return jsonify({
                'success': False, 
                'message': 'PDF解析失败，无法提取发票信息'
            }), 400
        
        # 检测是否为有效发票
        is_valid, validation_message = is_valid_invoice(invoice)
        if not is_valid:
            return jsonify({
                'success': False, 
                'message': validation_message,
                'is_invalid_invoice': True
            }), 400
        
        # 检查是否重复
        data_store = get_data_store()
        existing = data_store.get_invoice_by_number(invoice.invoice_number)
        if existing:
            # 获取报销人名称
            person_name = ''
            if existing.reimbursement_person_id:
                person_service = get_reimbursement_person_service()
                persons = person_service.get_all_persons()
                for p in persons:
                    if p.id == existing.reimbursement_person_id:
                        person_name = p.name
                        break
            
            return jsonify({
                'success': False,
                'message': f'发票号码 {invoice.invoice_number} 已存在',
                'is_duplicate': True,
                'existing_invoice': invoice_to_dict(existing, 0, person_name)
            }), 409
        
        # 返回解析结果（不持久化）
        return jsonify({
            'success': True,
            'invoice': {
                'invoice_number': invoice.invoice_number,
                'invoice_date': invoice.invoice_date,
                'item_name': invoice.item_name,
                'amount': str(invoice.amount),
                'remark': invoice.remark
            }
        })
        
    except Exception as e:
        error_msg = str(e)
        if '无法从PDF提取文本' in error_msg or 'OCR' in error_msg:
            return jsonify({
                'success': False, 
                'message': '该PDF可能是扫描件或图片格式，无法识别文字内容',
                'is_invalid_invoice': True
            }), 400
        return jsonify({'success': False, 'message': f'处理失败: {error_msg}'}), 500


@user_api.route('/confirm', methods=['POST'])
@user_login_required
def confirm_upload():
    """
    确认上传发票和凭证
    
    Form Data:
        invoice_data: JSON字符串，包含发票信息
        pdf_file: PDF文件
        reimbursement_person_id: 报销人ID（可选）
        voucher_files[]: 凭证图片文件（可选，多个）
    
    Returns:
        JSON: 上传结果
    """
    import json
    
    # 获取发票数据
    invoice_data_str = request.form.get('invoice_data')
    if not invoice_data_str:
        return jsonify({'success': False, 'message': '缺少发票数据'}), 400
    
    try:
        invoice_data = json.loads(invoice_data_str)
    except json.JSONDecodeError:
        return jsonify({'success': False, 'message': '发票数据格式错误'}), 400
    
    # 获取PDF文件
    if 'pdf_file' not in request.files:
        return jsonify({'success': False, 'message': '缺少PDF文件'}), 400
    
    pdf_file = request.files['pdf_file']
    if pdf_file.filename == '':
        return jsonify({'success': False, 'message': '未选择PDF文件'}), 400
    
    # 获取报销人ID
    reimbursement_person_id = request.form.get('reimbursement_person_id')
    if reimbursement_person_id:
        try:
            reimbursement_person_id = int(reimbursement_person_id)
        except ValueError:
            reimbursement_person_id = None
    
    try:
        # 保存临时PDF文件
        temp_dir = tempfile.gettempdir()
        temp_path = os.path.join(temp_dir, pdf_file.filename)
        pdf_file.save(temp_path)
        
        # 创建Invoice对象
        current_user = get_current_user()
        invoice = Invoice(
            invoice_number=invoice_data.get('invoice_number', ''),
            invoice_date=invoice_data.get('invoice_date', ''),
            item_name=invoice_data.get('item_name', ''),
            amount=Decimal(str(invoice_data.get('amount', '0'))),
            remark=invoice_data.get('remark', ''),
            file_path=temp_path,
            scan_time=datetime.now(),
            uploaded_by=current_user.get('display_name', current_user.get('username', '')),
            reimbursement_person_id=reimbursement_person_id
        )
        
        # 检查重复
        data_store = get_data_store()
        existing = data_store.get_invoice_by_number(invoice.invoice_number)
        if existing:
            return jsonify({
                'success': False,
                'message': f'发票号码 {invoice.invoice_number} 已存在',
                'is_duplicate': True
            }), 409
        
        # 检查大额发票是否需要合同
        amount_float = float(invoice.amount)
        has_contract = 'contract_file' in request.files and request.files['contract_file'].filename != ''
        
        if amount_float > LARGE_INVOICE_THRESHOLD and not has_contract:
            return jsonify({
                'success': False,
                'message': f'金额超过{LARGE_INVOICE_THRESHOLD}元的大额发票必须上传合同',
                'requires_contract': True,
                'amount': str(invoice.amount)
            }), 400
        
        # 保存发票
        manager = get_invoice_manager()
        result = manager.add_invoice(invoice)
        
        if not result.success:
            return jsonify({'success': False, 'message': result.message}), 400
        
        # 保存PDF数据
        with open(temp_path, 'rb') as f:
            pdf_data = f.read()
        data_store.update_pdf_data(invoice.invoice_number, pdf_data)
        
        # 保存凭证
        voucher_service = get_voucher_service()
        voucher_files = request.files.getlist('voucher_files[]')
        
        for voucher_file in voucher_files:
            if voucher_file.filename:
                if not voucher_service.validate_file_format(voucher_file.filename):
                    continue  # 跳过无效格式
                file_data = voucher_file.read()
                voucher_service.add_voucher(invoice.invoice_number, file_data, voucher_file.filename)
        
        # 保存合同（如果有）
        if has_contract:
            contract_file = request.files['contract_file']
            contract_service = get_contract_service()
            contract_data = contract_file.read()
            contract_service.upload_contract(invoice.invoice_number, contract_data, contract_file.filename)
        
        # 获取报销人名称
        person_name = ''
        if reimbursement_person_id:
            person_service = get_reimbursement_person_service()
            persons = person_service.get_all_persons()
            for p in persons:
                if p.id == reimbursement_person_id:
                    person_name = p.name
                    break
        
        return jsonify({
            'success': True,
            'message': '发票上传成功',
            'invoice': invoice_to_dict(invoice, len(voucher_files), person_name)
        })
        
    except Exception as e:
        return jsonify({'success': False, 'message': f'上传失败: {str(e)}'}), 500


@user_api.route('/submit-batch', methods=['POST'])
@user_login_required
def submit_batch():
    """
    批量提交暂存发票
    
    JSON Body:
        invoices: 发票数据列表，每个包含:
            - invoice_data: 发票信息
            - reimbursement_person_id: 报销人ID（可选）
    
    Returns:
        JSON: 批量提交结果
    """
    import json
    
    data = request.get_json()
    if not data or 'invoices' not in data:
        return jsonify({'success': False, 'message': '缺少发票数据'}), 400
    
    invoices_data = data.get('invoices', [])
    if not invoices_data:
        return jsonify({'success': False, 'message': '发票列表为空'}), 400
    
    current_user = get_current_user()
    data_store = get_data_store()
    manager = get_invoice_manager()
    person_service = get_reimbursement_person_service()
    
    results = []
    success_count = 0
    fail_count = 0
    
    for item in invoices_data:
        invoice_data = item.get('invoice_data', {})
        reimbursement_person_id = item.get('reimbursement_person_id')
        pdf_data = item.get('pdf_data')  # Base64 encoded PDF data
        
        if not invoice_data.get('invoice_number'):
            results.append({
                'success': False,
                'message': '缺少发票号码',
                'invoice_number': None
            })
            fail_count += 1
            continue
        
        invoice_number = invoice_data.get('invoice_number')
        
        # 检查重复
        existing = data_store.get_invoice_by_number(invoice_number)
        if existing:
            results.append({
                'success': False,
                'message': f'发票号码 {invoice_number} 已存在',
                'invoice_number': invoice_number,
                'is_duplicate': True
            })
            fail_count += 1
            continue
        
        try:
            # 检查大额发票是否有合同
            amount_value = Decimal(str(invoice_data.get('amount', '0')))
            has_contract = item.get('has_contract', False)
            
            if float(amount_value) > LARGE_INVOICE_THRESHOLD and not has_contract:
                results.append({
                    'success': False,
                    'message': f'金额超过{LARGE_INVOICE_THRESHOLD}元的大额发票必须上传合同',
                    'invoice_number': invoice_number,
                    'requires_contract': True
                })
                fail_count += 1
                continue
            
            # 创建Invoice对象
            invoice = Invoice(
                invoice_number=invoice_number,
                invoice_date=invoice_data.get('invoice_date', ''),
                item_name=invoice_data.get('item_name', ''),
                amount=amount_value,
                remark=invoice_data.get('remark', ''),
                file_path='',
                scan_time=datetime.now(),
                uploaded_by=current_user.get('display_name', current_user.get('username', '')),
                reimbursement_person_id=int(reimbursement_person_id) if reimbursement_person_id else None
            )
            
            # 保存发票
            result = manager.add_invoice(invoice)
            
            if result.success:
                # 如果有PDF数据，保存到数据库
                if pdf_data:
                    import base64
                    try:
                        pdf_bytes = base64.b64decode(pdf_data)
                        data_store.update_pdf_data(invoice_number, pdf_bytes)
                    except Exception:
                        pass  # PDF保存失败不影响发票保存
                
                success_count += 1
                results.append({
                    'success': True,
                    'message': '上传成功',
                    'invoice_number': invoice_number
                })
            else:
                fail_count += 1
                results.append({
                    'success': False,
                    'message': result.message,
                    'invoice_number': invoice_number
                })
                
        except Exception as e:
            fail_count += 1
            results.append({
                'success': False,
                'message': str(e),
                'invoice_number': invoice_number
            })
    
    return jsonify({
        'success': fail_count == 0,
        'message': f'成功提交 {success_count} 张发票，失败 {fail_count} 张',
        'success_count': success_count,
        'fail_count': fail_count,
        'results': results
    })


# ========== 发票列表和详情路由 ==========

@user_api.route('/invoices', methods=['GET'])
@user_login_required
def get_invoices():
    """
    获取当前用户的发票列表
    
    Query Parameters:
        record_type: 可选，值为"invoice"或"manual"，用于过滤记录类型
    
    Returns:
        JSON: {
            invoices: [...], 
            total_count: int, 
            total_amount: str,
            invoice_count: int,
            manual_count: int,
            invoice_amount: str,
            manual_amount: str
        }
    """
    manager = get_invoice_manager()
    voucher_service = get_voucher_service()
    person_service = get_reimbursement_person_service()
    
    # 获取所有发票
    invoices = manager.get_all_invoices()
    
    # 只返回当前用户上传的发票
    current_user = get_current_user()
    user_display_name = current_user.get('display_name', '')
    invoices = [inv for inv in invoices if inv.uploaded_by == user_display_name]
    
    # 获取record_type查询参数
    record_type_filter = request.args.get('record_type', '').strip()
    
    # 应用record_type过滤
    if record_type_filter in ['invoice', 'manual']:
        invoices = [inv for inv in invoices if inv.record_type == record_type_filter]
    
    # 计算总金额和分类统计
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
    
    # 构建报销人映射
    all_persons = person_service.get_all_persons()
    person_map = {p.id: p.name for p in all_persons}
    
    # 构建响应
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


@user_api.route('/invoices/<invoice_number>', methods=['GET'])
@user_login_required
def get_invoice_detail(invoice_number):
    """
    获取发票详情
    
    Args:
        invoice_number: 发票号码
    
    Returns:
        JSON: 发票详情，包含所有字段和关联凭证列表
    """
    data_store = get_data_store()
    voucher_service = get_voucher_service()
    person_service = get_reimbursement_person_service()
    
    invoice = data_store.get_invoice_by_number(invoice_number)
    if not invoice:
        return jsonify({'success': False, 'message': '发票不存在'}), 404
    
    # 验证发票属于当前用户
    current_user = get_current_user()
    if invoice.uploaded_by != current_user.get('display_name', ''):
        return jsonify({'success': False, 'message': '无权访问此发票'}), 403
    
    # 获取凭证列表
    vouchers = voucher_service.get_vouchers(invoice_number)
    voucher_list = [
        {
            'id': v.id,
            'original_filename': v.original_filename,
            'upload_time': v.upload_time.isoformat() if v.upload_time else None
        }
        for v in vouchers
    ]
    
    # 获取报销人名称
    person_name = ''
    if invoice.reimbursement_person_id:
        persons = person_service.get_all_persons()
        for p in persons:
            if p.id == invoice.reimbursement_person_id:
                person_name = p.name
                break
    
    # 构建响应，包含发票信息和凭证列表
    result = invoice_to_dict(invoice, len(vouchers), person_name)
    result['vouchers'] = voucher_list
    
    return jsonify(result)


@user_api.route('/invoices/<invoice_number>/pdf', methods=['GET'])
@user_login_required
def get_invoice_pdf(invoice_number):
    """
    获取发票PDF文件
    
    Args:
        invoice_number: 发票号码
    
    Query Parameters:
        preview: 如果为 true，则内联显示（用于预览）
    
    Returns:
        PDF文件
    """
    data_store = get_data_store()
    
    invoice = data_store.get_invoice_by_number(invoice_number)
    if not invoice:
        return jsonify({'success': False, 'message': '发票不存在'}), 404
    
    # 验证发票属于当前用户
    current_user = get_current_user()
    if invoice.uploaded_by != current_user.get('display_name', ''):
        return jsonify({'success': False, 'message': '无权访问此发票'}), 403
    
    # 是否为预览模式
    preview = request.args.get('preview', 'false').lower() == 'true'
    
    # 优先从数据库获取PDF数据
    pdf_data = data_store.get_pdf_data(invoice_number)
    if pdf_data:
        import io
        return send_file(
            io.BytesIO(pdf_data),
            as_attachment=not preview,
            download_name=f'{invoice_number}.pdf',
            mimetype='application/pdf'
        )
    
    # 回退到文件路径
    if invoice.file_path and os.path.exists(invoice.file_path):
        return send_file(
            invoice.file_path,
            as_attachment=not preview,
            download_name=f'{invoice_number}.pdf',
            mimetype='application/pdf'
        )
    
    return jsonify({'success': False, 'message': 'PDF文件不存在'}), 404


@user_api.route('/invoices/<invoice_number>/vouchers', methods=['GET'])
@user_login_required
def get_invoice_vouchers(invoice_number):
    """
    获取发票的所有支出凭证
    
    Args:
        invoice_number: 发票号码
    
    Returns:
        JSON: 凭证列表
    """
    data_store = get_data_store()
    voucher_service = get_voucher_service()
    
    invoice = data_store.get_invoice_by_number(invoice_number)
    if not invoice:
        return jsonify({'success': False, 'message': '发票不存在'}), 404
    
    # 验证发票属于当前用户
    current_user = get_current_user()
    if invoice.uploaded_by != current_user.get('display_name', ''):
        return jsonify({'success': False, 'message': '无权访问此发票'}), 403
    
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


@user_api.route('/vouchers/<int:voucher_id>/image', methods=['GET'])
@user_login_required
def get_voucher_image(voucher_id):
    """
    获取凭证图片
    
    Args:
        voucher_id: 凭证ID
    
    Returns:
        图片文件
    """
    data_store = get_data_store()
    
    # 获取凭证信息
    with data_store._get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT file_path, original_filename, invoice_number FROM expense_vouchers WHERE id = ?",
            (voucher_id,)
        )
        row = cursor.fetchone()
    
    if not row:
        return jsonify({'success': False, 'message': '凭证不存在'}), 404
    
    file_path, original_filename, invoice_number = row
    
    # 验证凭证所属发票属于当前用户
    invoice = data_store.get_invoice_by_number(invoice_number)
    if invoice:
        current_user = get_current_user()
        if invoice.uploaded_by != current_user.get('display_name', ''):
            return jsonify({'success': False, 'message': '无权访问此凭证'}), 403
    
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
    
    # 确定mimetype
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


# ========== 报销人相关路由 ==========

@user_api.route('/persons', methods=['GET'])
@user_login_required
def get_persons():
    """
    获取所有报销人列表
    
    Returns:
        JSON: 报销人列表
    """
    person_service = get_reimbursement_person_service()
    persons = person_service.get_all_persons()
    
    return jsonify({
        'persons': [
            {
                'id': p.id,
                'name': p.name
            }
            for p in persons
        ]
    })


@user_api.route('/persons', methods=['POST'])
@user_login_required
def create_person():
    """
    创建或获取已存在的报销人
    
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
        person = person_service.get_or_create_person(name)
        
        return jsonify({
            'success': True,
            'person': {
                'id': person.id,
                'name': person.name
            }
        })
        
    except Exception as e:
        return jsonify({'success': False, 'message': f'创建失败: {str(e)}'}), 500


# ========== 手动记录相关路由 ==========

@user_api.route('/create-manual', methods=['POST'])
@user_login_required
def create_manual_record():
    """
    创建手动报销记录（无发票）
    
    Form Data or JSON:
        item_name: 费用项目名称（必填）
        amount: 金额（必填）
        invoice_date: 日期（必填，YYYY-MM-DD格式）
        remark: 备注（可选）
        reimbursement_person_id: 报销人ID（可选）
        voucher_files[]: 凭证图片文件（可选，多个）
    
    Returns:
        JSON: 创建结果
    """
    from src.models import ManualRecordIDGenerator
    
    # 支持JSON和表单数据两种方式
    if request.is_json:
        data = request.get_json()
    else:
        data = request.form.to_dict()
    
    # 验证必填字段
    errors = {}
    
    item_name = data.get('item_name', '').strip()
    if not item_name:
        errors['item_name'] = '费用项目名称不能为空'
    
    amount_str = data.get('amount', '').strip()
    if not amount_str:
        errors['amount'] = '金额不能为空'
    else:
        try:
            amount = Decimal(amount_str)
            if amount <= 0:
                errors['amount'] = '金额必须大于0'
        except (ValueError, TypeError):
            errors['amount'] = '金额格式无效'
            amount = None
    
    invoice_date = data.get('invoice_date', '').strip()
    if not invoice_date:
        errors['invoice_date'] = '日期不能为空'
    else:
        # 验证日期格式
        try:
            datetime.strptime(invoice_date, '%Y-%m-%d')
        except ValueError:
            errors['invoice_date'] = '日期格式无效，请使用YYYY-MM-DD格式'
    
    if errors:
        return jsonify({
            'success': False,
            'message': '验证失败',
            'errors': errors
        }), 400
    
    # 获取可选字段
    remark = data.get('remark', '').strip()
    reimbursement_person_id = data.get('reimbursement_person_id')
    if reimbursement_person_id:
        try:
            reimbursement_person_id = int(reimbursement_person_id)
        except (ValueError, TypeError):
            reimbursement_person_id = None
    
    # 生成唯一记录ID
    record_id = ManualRecordIDGenerator.generate()
    
    # 获取当前用户
    current_user = get_current_user()
    uploaded_by = current_user.get('display_name', current_user.get('username', ''))
    
    # 检查重复（除非用户明确选择继续）
    force_create = data.get('force_create', False)
    if not force_create:
        data_store = get_data_store()
        duplicate = data_store.check_manual_duplicate(
            amount=amount,
            invoice_date=invoice_date,
            item_name=item_name,
            uploaded_by=uploaded_by
        )
        
        if duplicate:
            # 获取报销人名称
            person_name = ''
            if duplicate.reimbursement_person_id:
                person_service = get_reimbursement_person_service()
                persons = person_service.get_all_persons()
                for p in persons:
                    if p.id == duplicate.reimbursement_person_id:
                        person_name = p.name
                        break
            
            # 返回警告响应
            return jsonify({
                'success': False,
                'is_duplicate_warning': True,
                'message': '检测到相似的报销记录',
                'similar_record': {
                    'invoice_number': duplicate.invoice_number,
                    'item_name': duplicate.item_name,
                    'amount': str(duplicate.amount),
                    'invoice_date': duplicate.invoice_date,
                    'uploaded_by': duplicate.uploaded_by,
                    'remark': duplicate.remark,
                    'scan_time': duplicate.scan_time.isoformat() if duplicate.scan_time else None,
                    'reimbursement_person_name': person_name
                }
            }), 409
    
    # 生成唯一记录ID
    record_id = ManualRecordIDGenerator.generate()
    
    # 创建Invoice对象（record_type为manual）
    invoice = Invoice(
        invoice_number=record_id,
        invoice_date=invoice_date,
        item_name=item_name,
        amount=amount,
        remark=remark,
        file_path='MANUAL',  # 手动记录使用特殊标记
        scan_time=datetime.now(),
        uploaded_by=uploaded_by,
        reimbursement_person_id=reimbursement_person_id,
        reimbursement_status='未报销',
        record_type='manual'
    )
    
    try:
        # 保存到数据库
        data_store = get_data_store()
        data_store.insert(invoice)
        
        # 处理凭证图片上传（如果有）
        voucher_count = 0
        if not request.is_json and 'voucher_files[]' in request.files:
            voucher_service = get_voucher_service()
            voucher_files = request.files.getlist('voucher_files[]')
            
            for voucher_file in voucher_files:
                if voucher_file.filename:
                    # 验证文件格式
                    if not voucher_service.validate_file_format(voucher_file.filename):
                        continue  # 跳过无效格式
                    
                    # 保存凭证
                    file_data = voucher_file.read()
                    voucher_service.add_voucher(record_id, file_data, voucher_file.filename)
                    voucher_count += 1
        
        # 获取报销人名称
        person_name = ''
        if reimbursement_person_id:
            person_service = get_reimbursement_person_service()
            persons = person_service.get_all_persons()
            for p in persons:
                if p.id == reimbursement_person_id:
                    person_name = p.name
                    break
        
        return jsonify({
            'success': True,
            'message': '手动记录创建成功',
            'record': {
                'invoice_number': record_id,
                'item_name': item_name,
                'amount': str(amount),
                'invoice_date': invoice_date,
                'remark': remark,
                'record_type': 'manual',
                'uploaded_by': uploaded_by,
                'scan_time': invoice.scan_time.isoformat(),
                'reimbursement_person_id': reimbursement_person_id,
                'reimbursement_person_name': person_name,
                'voucher_count': voucher_count
            }
        })
        
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
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'创建失败: {str(e)}'
        }), 500


@user_api.route('/manual/<record_id>', methods=['PUT'])
@user_login_required
def edit_manual_record(record_id):
    """
    编辑手动报销记录
    
    Args:
        record_id: 记录ID（invoice_number）
    
    JSON Body:
        item_name: 费用项目名称（必填）
        amount: 金额（必填）
        invoice_date: 日期（必填，YYYY-MM-DD格式）
        remark: 备注（可选）
        reimbursement_person_id: 报销人ID（可选）
    
    Returns:
        JSON: 更新结果
    """
    data_store = get_data_store()
    
    # 获取记录
    invoice = data_store.get_invoice_by_number(record_id)
    if not invoice:
        return jsonify({
            'success': False,
            'message': '记录不存在',
            'error_code': 'RECORD_NOT_FOUND'
        }), 404
    
    # 验证记录属于当前用户
    current_user = get_current_user()
    if invoice.uploaded_by != current_user.get('display_name', ''):
        return jsonify({
            'success': False,
            'message': '无权编辑此记录'
        }), 403
    
    # 验证记录类型为manual
    if invoice.record_type != 'manual':
        return jsonify({
            'success': False,
            'message': '无权编辑此记录',
            'reason': 'invoice_record_not_editable'
        }), 403
    
    # 获取请求数据
    data = request.get_json()
    if not data:
        return jsonify({
            'success': False,
            'message': '请提供更新数据'
        }), 400
    
    # 验证必填字段
    errors = {}
    
    item_name = data.get('item_name', '').strip()
    if not item_name:
        errors['item_name'] = '费用项目名称不能为空'
    
    amount_str = data.get('amount', '').strip()
    if not amount_str:
        errors['amount'] = '金额不能为空'
    else:
        try:
            amount = Decimal(amount_str)
            if amount <= 0:
                errors['amount'] = '金额必须大于0'
        except (ValueError, TypeError):
            errors['amount'] = '金额格式无效'
            amount = None
    
    invoice_date = data.get('invoice_date', '').strip()
    if not invoice_date:
        errors['invoice_date'] = '日期不能为空'
    else:
        # 验证日期格式
        try:
            datetime.strptime(invoice_date, '%Y-%m-%d')
        except ValueError:
            errors['invoice_date'] = '日期格式无效，请使用YYYY-MM-DD格式'
    
    if errors:
        return jsonify({
            'success': False,
            'message': '验证失败',
            'errors': errors
        }), 400
    
    # 获取可选字段
    remark = data.get('remark', '').strip()
    reimbursement_person_id = data.get('reimbursement_person_id')
    if reimbursement_person_id:
        try:
            reimbursement_person_id = int(reimbursement_person_id)
        except (ValueError, TypeError):
            reimbursement_person_id = None
    
    try:
        # 更新记录
        with data_store._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                UPDATE invoices
                SET item_name = ?,
                    amount = ?,
                    invoice_date = ?,
                    remark = ?,
                    reimbursement_person_id = ?
                WHERE invoice_number = ?
            """, (
                item_name,
                str(amount),
                invoice_date,
                remark,
                reimbursement_person_id,
                record_id
            ))
            conn.commit()
        
        # 获取更新后的记录
        updated_invoice = data_store.get_invoice_by_number(record_id)
        
        # 获取报销人名称
        person_name = ''
        if reimbursement_person_id:
            person_service = get_reimbursement_person_service()
            persons = person_service.get_all_persons()
            for p in persons:
                if p.id == reimbursement_person_id:
                    person_name = p.name
                    break
        
        return jsonify({
            'success': True,
            'message': '记录更新成功',
            'record': {
                'invoice_number': updated_invoice.invoice_number,
                'item_name': updated_invoice.item_name,
                'amount': str(updated_invoice.amount),
                'invoice_date': updated_invoice.invoice_date,
                'remark': updated_invoice.remark,
                'record_type': updated_invoice.record_type,
                'uploaded_by': updated_invoice.uploaded_by,
                'scan_time': updated_invoice.scan_time.isoformat() if updated_invoice.scan_time else None,
                'reimbursement_person_id': updated_invoice.reimbursement_person_id,
                'reimbursement_person_name': person_name
            }
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'更新失败: {str(e)}'
        }), 500
