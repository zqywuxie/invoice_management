# 电子发票汇总程序 (Invoice Summary System)

## 简介

这是一个基于Python的电子发票汇总工具，可以从PDF格式的电子发票中自动提取关键信息并进行汇总统计。

## 功能特性

- 📄 **PDF发票解析** - 自动提取发票号码、开票日期、项目名称、金额、备注
- 🔍 **重复检测** - 自动检测重复发票，避免重复录入
- 📊 **汇总统计** - 查看所有发票的汇总信息和总金额
- 📁 **数据持久化** - 发票数据自动保存到JSON文件
- 📤 **Excel导出** - 支持导出发票数据到Excel文件

## 安装

### 1. 安装依赖

```bash
pip install -r requirements.txt
```

依赖包括：
- `pdfplumber` - PDF文本提取
- `openpyxl` - Excel文件生成
- `pytest` - 测试框架
- `hypothesis` - 属性测试

## 使用方法

### 方式一：Web应用（推荐）

Web版提供简洁美观的浏览器界面，支持发票上传、查看、搜索、删除和导出功能。

#### 启动Web服务器

```bash
# 默认启动 (http://127.0.0.1:5000)
python invoice_web/run.py

# 指定端口
python invoice_web/run.py --port 8080

# 允许外部访问
python invoice_web/run.py --host 0.0.0.0

# 开启调试模式（开发时使用）
python invoice_web/run.py --debug
```

启动后，在浏览器中访问 http://127.0.0.1:5000 即可使用。

#### Web应用功能

- 📤 **上传发票** - 点击上传按钮选择PDF发票文件
- 📋 **查看列表** - 所有发票以表格形式展示，支持排序
- 🔍 **搜索发票** - 按发票号码、日期、项目名称等搜索
- 📊 **统计汇总** - 实时显示发票数量和总金额
- 📥 **导出Excel** - 一键导出所有发票到Excel文件
- 📄 **下载PDF** - 下载原始PDF发票文件
- 🗑️ **删除发票** - 删除不需要的发票记录

### 方式二：Python代码调用

```python
from src.pdf_parser import InvoicePDFParser
from src.invoice_manager import InvoiceManager
from src.export_service import ExportService

# 1. 解析PDF发票
parser = InvoicePDFParser()
invoice = parser.parse("发票文件.pdf")

print(f"发票号码: {invoice.invoice_number}")
print(f"开票日期: {invoice.invoice_date}")
print(f"项目名称: {invoice.item_name}")
print(f"金额: {invoice.amount}")
print(f"备注: {invoice.remark}")

# 2. 添加到发票管理器
manager = InvoiceManager()
result = manager.add_invoice(invoice)

if result.success:
    print("发票添加成功！")
else:
    print(f"添加失败: {result.message}")
    if result.is_duplicate:
        print(f"原始发票: {result.original_invoice}")

# 3. 查看汇总信息
summary = manager.get_summary()
print(f"发票数量: {summary.invoice_count}")
print(f"总金额: {summary.total_amount}")

# 4. 导出到Excel
export_service = ExportService()
export_service.export_to_excel(summary.invoices, "发票汇总.xlsx")
print("已导出到 发票汇总.xlsx")
```

### 方式二：批量处理多个发票

```python
from src.pdf_parser import InvoicePDFParser
from src.invoice_manager import InvoiceManager
from src.export_service import ExportService
import os

# 初始化
parser = InvoicePDFParser()
manager = InvoiceManager()

# 批量处理目录下的所有PDF文件
pdf_dir = "发票目录"
success_count = 0
duplicate_count = 0
error_count = 0

for filename in os.listdir(pdf_dir):
    if filename.endswith(".pdf"):
        file_path = os.path.join(pdf_dir, filename)
        try:
            invoice = parser.parse(file_path)
            result = manager.add_invoice(invoice)
            
            if result.success:
                success_count += 1
                print(f"✓ {filename} - 添加成功")
            elif result.is_duplicate:
                duplicate_count += 1
                print(f"⚠ {filename} - 重复发票")
        except Exception as e:
            error_count += 1
            print(f"✗ {filename} - 解析失败: {e}")

# 显示处理结果
print(f"\n处理完成:")
print(f"  成功: {success_count}")
print(f"  重复: {duplicate_count}")
print(f"  失败: {error_count}")

# 导出汇总
summary = manager.get_summary()
ExportService().export_to_excel(summary.invoices, "发票汇总.xlsx")
```

### 方式三：快速示例脚本

创建一个 `scan_invoice.py` 文件：

```python
#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""快速扫描发票示例"""

import sys
from src.pdf_parser import InvoicePDFParser
from src.invoice_manager import InvoiceManager
from src.export_service import ExportService

def main():
    if len(sys.argv) < 2:
        print("用法: python scan_invoice.py <发票PDF文件>")
        return
    
    pdf_file = sys.argv[1]
    
    # 解析发票
    parser = InvoicePDFParser()
    try:
        invoice = parser.parse(pdf_file)
    except Exception as e:
        print(f"解析失败: {e}")
        return
    
    # 显示提取的信息
    print("=" * 50)
    print("发票信息:")
    print("=" * 50)
    print(f"发票号码: {invoice.invoice_number}")
    print(f"开票日期: {invoice.invoice_date}")
    print(f"项目名称: {invoice.item_name}")
    print(f"金额: ¥{invoice.amount}")
    print(f"备注: {invoice.remark}")
    print("=" * 50)
    
    # 添加到系统
    manager = InvoiceManager()
    result = manager.add_invoice(invoice)
    
    if result.success:
        print(f"\n✓ 发票已添加到系统")
        summary = manager.get_summary()
        print(f"当前共有 {summary.invoice_count} 张发票，总金额: ¥{summary.total_amount}")
    else:
        print(f"\n⚠ {result.message}")

if __name__ == "__main__":
    main()
```

运行：
```bash
python scan_invoice.py 郑钦云-邮费1.pdf
```

## 数据存储

- 发票数据自动保存在 `data/invoices.json` 文件中
- 每次添加发票后自动持久化
- 程序重启后自动加载已保存的数据

## 项目结构

```
├── invoice_web/            # Web应用模块
│   ├── app.py              # Flask应用主类
│   ├── routes.py           # API路由定义
│   ├── run.py              # 启动脚本
│   ├── templates/          # HTML模板
│   │   ├── base.html       # 基础模板
│   │   └── index.html      # 主页面
│   └── static/             # 静态资源
│       ├── css/style.css   # 自定义样式
│       └── js/app.js       # 前端JavaScript
├── src/
│   ├── models.py           # 数据模型 (Invoice, AddResult等)
│   ├── pdf_parser.py       # PDF解析器
│   ├── invoice_manager.py  # 发票管理器
│   ├── data_store.py       # 数据存储接口
│   ├── sqlite_data_store.py # SQLite数据存储实现
│   ├── duplicate_detector.py # 重复检测器
│   └── export_service.py   # Excel导出服务
├── data/
│   └── invoices.db         # SQLite数据库
├── tests/                  # 测试文件
├── requirements.txt        # 依赖列表
└── README.md              # 本文档
```

## 支持的发票格式

程序支持解析标准中国电子发票PDF，可提取以下信息：
- 发票号码（位于发票右上角）
- 开票日期（支持 YYYY年MM月DD日 格式）
- 项目名称（如 *快递服务*收派服务费）
- 价税合计金额
- 备注信息

## 注意事项

1. 确保PDF文件是可提取文本的电子发票（非扫描图片）
2. 发票号码用于重复检测，相同号码的发票只能添加一次
3. 金额使用Decimal类型确保精确计算
