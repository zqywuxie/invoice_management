"""
User Portal Routes Blueprint
用户端路由模块 - 提供用户端页面路由
"""

from functools import wraps
from flask import Blueprint, render_template, session, redirect, url_for

# Create Blueprint for user portal routes
user_bp = Blueprint(
    'user',
    __name__,
    url_prefix='/user',
    template_folder='templates/user',
    static_folder='static'
)


def user_login_required(f):
    """
    用户登录验证装饰器
    
    检查用户是否已登录，未登录则重定向到登录页面
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user' not in session:
            return redirect(url_for('user.login'))
        return f(*args, **kwargs)
    return decorated_function


@user_bp.route('/login')
def login():
    """
    登录页面
    
    GET /user/login - 显示登录表单
    """
    # If already logged in, redirect to upload page
    if 'user' in session:
        return redirect(url_for('user.upload'))
    return render_template('user/login.html')


@user_bp.route('/')
@user_login_required
def upload():
    """
    上传页面（主页）
    
    GET /user/ - 显示发票上传界面
    """
    return render_template('user/upload.html')


@user_bp.route('/invoices')
@user_login_required
def invoices():
    """
    发票列表页面
    
    GET /user/invoices - 显示当前用户的发票列表
    """
    return render_template('user/invoices.html')


@user_bp.route('/invoices/<invoice_number>')
@user_login_required
def invoice_detail(invoice_number):
    """
    发票详情页面
    
    GET /user/invoices/<invoice_number> - 显示发票详情
    
    Args:
        invoice_number: 发票号码
    """
    return render_template('user/detail.html', invoice_number=invoice_number)
