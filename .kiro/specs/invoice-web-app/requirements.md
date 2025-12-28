# Requirements Document

## Introduction

本项目旨在将现有的桌面版电子发票汇总系统（基于Tkinter）转换为Web端应用。Web应用将整合到独立的`invoice_web`文件夹中，保持简洁美观的界面设计，同时复用现有的核心业务逻辑（PDF解析、数据存储、导出服务等）。

## Glossary

- **Invoice_Web_System**: Web端电子发票汇总系统
- **Invoice**: 电子发票数据实体，包含发票号码、日期、项目名称、金额、备注等字段
- **PDF_Parser**: PDF发票解析器，从PDF文件中提取发票信息
- **SQLite_Data_Store**: SQLite数据库存储层，负责发票数据的持久化
- **Export_Service**: 导出服务，将发票数据导出为Excel文件
- **Flask**: Python轻量级Web框架
- **Bootstrap**: 前端CSS框架，用于构建响应式界面

## Requirements

### Requirement 1

**User Story:** As a user, I want to access the invoice management system through a web browser, so that I can manage invoices without installing desktop software.

#### Acceptance Criteria

1. WHEN a user navigates to the web application URL THEN the Invoice_Web_System SHALL display a clean, modern dashboard interface
2. WHEN the web application loads THEN the Invoice_Web_System SHALL display all existing invoices in a sortable table
3. WHEN the user interface renders THEN the Invoice_Web_System SHALL use a minimalist design with consistent color scheme and adequate whitespace
4. WHEN the page loads on different screen sizes THEN the Invoice_Web_System SHALL adapt the layout responsively

### Requirement 2

**User Story:** As a user, I want to upload PDF invoices through the web interface, so that I can add new invoices to the system.

#### Acceptance Criteria

1. WHEN a user clicks the upload button THEN the Invoice_Web_System SHALL display a file selection dialog accepting PDF files
2. WHEN a user uploads a valid PDF invoice THEN the Invoice_Web_System SHALL parse the PDF and extract invoice information
3. WHEN invoice parsing completes successfully THEN the Invoice_Web_System SHALL add the invoice to the database and refresh the invoice list
4. WHEN a user uploads an invalid or unreadable PDF THEN the Invoice_Web_System SHALL display a clear error message describing the issue
5. WHEN a user uploads multiple PDF files THEN the Invoice_Web_System SHALL process each file and report individual results
6. WHEN a PDF invoice is uploaded THEN the Invoice_Web_System SHALL store the PDF file content in the database
7. WHEN a PDF is stored THEN the Invoice_Web_System SHALL associate the PDF binary data with the corresponding invoice record

### Requirement 3

**User Story:** As a user, I want to see duplicate invoice warnings, so that I can avoid adding the same invoice twice.

#### Acceptance Criteria

1. WHEN a user uploads a PDF with an existing invoice number THEN the Invoice_Web_System SHALL display a duplicate warning modal
2. WHEN displaying a duplicate warning THEN the Invoice_Web_System SHALL show both the new and existing invoice details for comparison
3. WHEN a duplicate is detected THEN the Invoice_Web_System SHALL prevent the duplicate invoice from being added

### Requirement 4

**User Story:** As a user, I want to view invoice details, so that I can see complete information about any invoice.

#### Acceptance Criteria

1. WHEN a user clicks on an invoice row THEN the Invoice_Web_System SHALL display a detail modal with all invoice fields
2. WHEN displaying invoice details THEN the Invoice_Web_System SHALL show invoice number, date, item name, amount, remark, file path, and scan time
3. WHEN the detail modal is open THEN the Invoice_Web_System SHALL provide a close button to dismiss the modal

### Requirement 5

**User Story:** As a user, I want to delete invoices, so that I can remove incorrect or unwanted entries.

#### Acceptance Criteria

1. WHEN a user clicks the delete button for an invoice THEN the Invoice_Web_System SHALL display a confirmation dialog
2. WHEN the user confirms deletion THEN the Invoice_Web_System SHALL remove the invoice from the database and refresh the list
3. WHEN the user cancels deletion THEN the Invoice_Web_System SHALL close the dialog without making changes
4. WHEN deletion completes THEN the Invoice_Web_System SHALL display a success notification

### Requirement 6

**User Story:** As a user, I want to search and filter invoices, so that I can quickly find specific invoices.

#### Acceptance Criteria

1. WHEN a user types in the search box THEN the Invoice_Web_System SHALL filter invoices matching the search term
2. WHEN searching THEN the Invoice_Web_System SHALL match against invoice number, date, item name, amount, and remark fields
3. WHEN the user clears the search box THEN the Invoice_Web_System SHALL display all invoices

### Requirement 7

**User Story:** As a user, I want to see invoice statistics, so that I can understand the total count and amount.

#### Acceptance Criteria

1. WHEN the invoice list displays THEN the Invoice_Web_System SHALL show the total invoice count
2. WHEN the invoice list displays THEN the Invoice_Web_System SHALL show the total amount with proper currency formatting
3. WHEN invoices are added or deleted THEN the Invoice_Web_System SHALL update the statistics immediately

### Requirement 8

**User Story:** As a user, I want to export invoices to Excel, so that I can use the data in other applications.

#### Acceptance Criteria

1. WHEN a user clicks the export button THEN the Invoice_Web_System SHALL generate an Excel file containing all invoices
2. WHEN the Excel file is generated THEN the Invoice_Web_System SHALL trigger a file download in the browser
3. WHEN exporting THEN the Invoice_Web_System SHALL include invoice number, date, item name, amount, remark, file path, and scan time columns
4. WHEN exporting THEN the Invoice_Web_System SHALL include summary statistics at the bottom of the Excel file

### Requirement 9

**User Story:** As a user, I want to sort the invoice table, so that I can organize invoices by different criteria.

#### Acceptance Criteria

1. WHEN a user clicks a column header THEN the Invoice_Web_System SHALL sort the table by that column
2. WHEN a user clicks the same column header again THEN the Invoice_Web_System SHALL reverse the sort order
3. WHEN sorting THEN the Invoice_Web_System SHALL display a visual indicator showing the current sort column and direction

### Requirement 10

**User Story:** As a user, I want to download the original PDF invoice, so that I can view or save the source document.

#### Acceptance Criteria

1. WHEN viewing invoice details THEN the Invoice_Web_System SHALL display a download button for the PDF file
2. WHEN a user clicks the download button THEN the Invoice_Web_System SHALL retrieve the PDF from the database and trigger a file download
3. WHEN downloading THEN the Invoice_Web_System SHALL use the original filename or a descriptive name based on invoice number

### Requirement 11

**User Story:** As a developer, I want the web application organized in a standalone folder, so that the codebase is clean and maintainable.

#### Acceptance Criteria

1. WHEN the project is structured THEN the Invoice_Web_System SHALL place all web-related code in an `invoice_web` folder
2. WHEN organizing code THEN the Invoice_Web_System SHALL reuse existing core modules (models, pdf_parser, sqlite_data_store, export_service) via imports
3. WHEN the web server starts THEN the Invoice_Web_System SHALL serve static files and templates from within the `invoice_web` folder
