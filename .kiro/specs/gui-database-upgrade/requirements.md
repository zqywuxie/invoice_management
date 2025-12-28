# Requirements Document

## Introduction

本文档定义了电子发票汇总程序的GUI界面和数据库升级需求。该升级将现有的命令行程序转换为具有图形用户界面的桌面应用程序，并将JSON文件存储替换为SQLite轻量级数据库，以提供更好的用户体验和数据管理能力。

## Glossary

- **Invoice_GUI_System**: 电子发票汇总图形界面系统，提供可视化操作界面的桌面应用程序
- **SQLite_Database**: SQLite数据库，轻量级嵌入式关系型数据库，用于存储发票数据
- **Main_Window**: 主窗口，应用程序的主要操作界面
- **Invoice_Table**: 发票表格，显示所有发票记录的可视化表格组件
- **File_Dialog**: 文件对话框，用于选择PDF文件的系统对话框
- **Status_Bar**: 状态栏，显示操作结果和系统状态的界面组件
- **Summary_Panel**: 汇总面板，显示发票统计信息的界面区域

## Requirements

### Requirement 1

**User Story:** As a 财务人员, I want to 通过图形界面操作发票汇总软件, so that 我可以更直观便捷地管理发票数据。

#### Acceptance Criteria

1. WHEN the user launches the application THEN the Invoice_GUI_System SHALL display a Main_Window with menu bar, toolbar, Invoice_Table, and Summary_Panel
2. WHEN the user clicks the "添加发票" button THEN the Invoice_GUI_System SHALL open a File_Dialog for selecting PDF files
3. WHEN the user selects PDF files through File_Dialog THEN the Invoice_GUI_System SHALL process the files and display results in Invoice_Table
4. WHEN an invoice is successfully added THEN the Invoice_GUI_System SHALL update the Summary_Panel with new totals
5. WHEN the user selects an invoice in Invoice_Table THEN the Invoice_GUI_System SHALL highlight the selected row and enable related action buttons

### Requirement 2

**User Story:** As a 财务人员, I want to 在表格中查看和管理所有发票, so that 我可以快速浏览和操作发票数据。

#### Acceptance Criteria

1. WHEN invoices are loaded THEN the Invoice_GUI_System SHALL display all invoices in Invoice_Table with columns for Invoice_Number, Invoice_Date, Item_Name, Amount, and Remark
2. WHEN the user clicks a column header THEN the Invoice_GUI_System SHALL sort the Invoice_Table by that column
3. WHEN the user double-clicks an invoice row THEN the Invoice_GUI_System SHALL display a detail dialog showing all invoice information
4. WHEN the user right-clicks an invoice row THEN the Invoice_GUI_System SHALL display a context menu with delete and view options
5. WHEN the Invoice_Table contains data THEN the Invoice_GUI_System SHALL enable scrolling for tables exceeding the visible area

### Requirement 3

**User Story:** As a 财务人员, I want to 使用SQLite数据库存储发票数据, so that 数据存储更可靠且支持更复杂的查询。

#### Acceptance Criteria

1. WHEN the application starts THEN the Invoice_GUI_System SHALL connect to a SQLite_Database file in the application data directory
2. WHEN the SQLite_Database does not exist THEN the Invoice_GUI_System SHALL create a new database with the required invoice table schema
3. WHEN an invoice is added THEN the Invoice_GUI_System SHALL insert the record into SQLite_Database immediately
4. WHEN the application queries invoices THEN the Invoice_GUI_System SHALL retrieve data from SQLite_Database
5. WHEN the Invoice_GUI_System stores invoice data THEN the Invoice_GUI_System SHALL serialize the data to database format
6. WHEN the Invoice_GUI_System loads invoice data THEN the Invoice_GUI_System SHALL deserialize the database records back to invoice objects

### Requirement 4

**User Story:** As a 财务人员, I want to 在界面上看到重复发票警告, so that 我可以立即知道是否扫描了重复的发票。

#### Acceptance Criteria

1. WHEN a duplicate invoice is detected THEN the Invoice_GUI_System SHALL display a warning dialog with the duplicate invoice information
2. WHEN a duplicate warning dialog is shown THEN the Invoice_GUI_System SHALL display both the new and original invoice details for comparison
3. WHEN the user acknowledges the duplicate warning THEN the Invoice_GUI_System SHALL close the dialog and return focus to Main_Window

### Requirement 5

**User Story:** As a 财务人员, I want to 通过界面导出发票数据, so that 我可以方便地生成Excel报表。

#### Acceptance Criteria

1. WHEN the user clicks the "导出Excel" button THEN the Invoice_GUI_System SHALL open a save File_Dialog for specifying the export location
2. WHEN the user confirms the export location THEN the Invoice_GUI_System SHALL generate an Excel file with all invoice records
3. WHEN export completes successfully THEN the Invoice_GUI_System SHALL display a success message in Status_Bar
4. IF export fails THEN the Invoice_GUI_System SHALL display an error dialog with the failure reason

### Requirement 6

**User Story:** As a 财务人员, I want to 在界面上查看汇总统计信息, so that 我可以随时了解发票总体情况。

#### Acceptance Criteria

1. WHEN invoices are displayed THEN the Invoice_GUI_System SHALL show total invoice count in Summary_Panel
2. WHEN invoices are displayed THEN the Invoice_GUI_System SHALL show total amount in Summary_Panel with currency formatting
3. WHEN invoice data changes THEN the Invoice_GUI_System SHALL automatically refresh Summary_Panel statistics

### Requirement 7

**User Story:** As a 财务人员, I want to 删除错误录入的发票, so that 我可以修正数据错误。

#### Acceptance Criteria

1. WHEN the user selects an invoice and clicks delete THEN the Invoice_GUI_System SHALL display a confirmation dialog
2. WHEN the user confirms deletion THEN the Invoice_GUI_System SHALL remove the invoice from SQLite_Database
3. WHEN deletion completes THEN the Invoice_GUI_System SHALL refresh Invoice_Table and Summary_Panel
4. WHEN the user cancels deletion THEN the Invoice_GUI_System SHALL close the dialog without changes

### Requirement 8

**User Story:** As a 财务人员, I want to 搜索和筛选发票, so that 我可以快速找到特定的发票记录。

#### Acceptance Criteria

1. WHEN the user enters text in the search box THEN the Invoice_GUI_System SHALL filter Invoice_Table to show matching invoices
2. WHEN the user clears the search box THEN the Invoice_GUI_System SHALL display all invoices in Invoice_Table
3. WHEN filtering is active THEN the Invoice_GUI_System SHALL update Summary_Panel to reflect filtered results

