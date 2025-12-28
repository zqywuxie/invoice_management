# Requirements Document

## Introduction

本文档定义了电子发票汇总程序的需求规格。该程序通过扫描电子发票PDF文件，提取发票号码、开票日期、项目名称、金额和备注等关键信息，并进行汇总统计，同时具备重复发票检测功能。

## Glossary

- **Invoice_Summary_System**: 电子发票汇总系统，负责扫描、提取、汇总发票信息的软件程序
- **Invoice_Number**: 发票号码，位于发票右上角的唯一标识符
- **Invoice_Date**: 开票日期，发票开具的日期
- **Item_Name**: 项目名称，发票中的商品或服务名称
- **Amount**: 金额，发票中的费用金额
- **Remark**: 备注，发票中的附加说明信息
- **Duplicate_Invoice**: 重复发票，具有相同发票号码的发票记录

## Requirements

### Requirement 1

**User Story:** As a 财务人员, I want to 扫描PDF格式的电子发票并提取关键信息, so that 我可以快速获取发票数据而无需手动输入。

#### Acceptance Criteria

1. WHEN a user uploads a PDF invoice file THEN the Invoice_Summary_System SHALL extract the Invoice_Number from the upper right corner of the invoice
2. WHEN a user uploads a PDF invoice file THEN the Invoice_Summary_System SHALL extract the Invoice_Date from the invoice
3. WHEN a user uploads a PDF invoice file THEN the Invoice_Summary_System SHALL extract the Item_Name from the invoice
4. WHEN a user uploads a PDF invoice file THEN the Invoice_Summary_System SHALL extract the Amount from the invoice
5. WHEN a user uploads a PDF invoice file THEN the Invoice_Summary_System SHALL extract the Remark from the invoice
6. WHEN the Invoice_Summary_System parses invoice data THEN the Invoice_Summary_System SHALL serialize the extracted data to JSON format for storage
7. WHEN the Invoice_Summary_System loads stored invoice data THEN the Invoice_Summary_System SHALL deserialize the JSON data back to invoice objects

### Requirement 2

**User Story:** As a 财务人员, I want to 检测重复扫描的发票, so that 我可以避免重复录入相同的发票。

#### Acceptance Criteria

1. WHEN a user scans an invoice with an Invoice_Number that already exists in the system THEN the Invoice_Summary_System SHALL display a warning message indicating a Duplicate_Invoice
2. WHEN a Duplicate_Invoice is detected THEN the Invoice_Summary_System SHALL prevent the duplicate entry from being added to the summary
3. WHEN a Duplicate_Invoice is detected THEN the Invoice_Summary_System SHALL display the original invoice information for comparison

### Requirement 3

**User Story:** As a 财务人员, I want to 查看所有已扫描发票的汇总信息, so that 我可以快速了解发票总体情况。

#### Acceptance Criteria

1. WHEN a user requests a summary view THEN the Invoice_Summary_System SHALL display a list of all scanned invoices with Invoice_Number, Invoice_Date, Item_Name, Amount, and Remark
2. WHEN a user requests a summary view THEN the Invoice_Summary_System SHALL calculate and display the total Amount of all invoices
3. WHEN a user requests a summary view THEN the Invoice_Summary_System SHALL display the total count of scanned invoices

### Requirement 4

**User Story:** As a 财务人员, I want to 导出汇总数据, so that 我可以在其他系统中使用这些数据。

#### Acceptance Criteria

1. WHEN a user requests data export THEN the Invoice_Summary_System SHALL generate an Excel file containing all invoice records
2. WHEN a user requests data export THEN the Invoice_Summary_System SHALL include summary statistics in the exported file
3. WHEN the Invoice_Summary_System exports data THEN the Invoice_Summary_System SHALL format the Amount values with two decimal places

### Requirement 5

**User Story:** As a 财务人员, I want to 批量扫描多个发票文件, so that 我可以一次性处理多张发票提高效率。

#### Acceptance Criteria

1. WHEN a user selects multiple PDF files THEN the Invoice_Summary_System SHALL process each file sequentially
2. WHEN batch processing completes THEN the Invoice_Summary_System SHALL display a summary of processed invoices including success count and duplicate count
3. IF a file fails to process during batch scanning THEN the Invoice_Summary_System SHALL log the error and continue processing remaining files
