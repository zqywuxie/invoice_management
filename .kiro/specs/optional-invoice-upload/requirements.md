# Requirements Document

## Introduction

本项目旨在扩展现有的Web端电子发票汇总系统，支持无发票报销场景。用户在上传报销记录时，可以选择不上传发票PDF，而是手动填写报销信息。这将支持小额支出、内部费用、无正式发票的报销等场景，提高系统的灵活性和适用范围。

## Glossary

- **Invoice_Web_System**: Web端电子发票汇总系统
- **Reimbursement_Record**: 报销记录，可以包含发票或不包含发票
- **Manual_Entry**: 手动输入的报销记录，不依赖PDF发票解析
- **Invoice_Optional_Mode**: 发票可选模式，用户可以选择上传PDF或手动输入
- **Expense_Item**: 费用项目，描述报销的具体内容
- **User**: 系统用户，可以创建和管理报销记录

## Requirements

### Requirement 1

**User Story:** As a user, I want to create reimbursement records without uploading invoice PDFs, so that I can submit expenses that don't have formal invoices.

#### Acceptance Criteria

1. WHEN a user accesses the upload page THEN the Invoice_Web_System SHALL display two options: "上传发票PDF" and "手动输入报销信息"
2. WHEN a user selects "手动输入报销信息" THEN the Invoice_Web_System SHALL display a form with fields for manual entry
3. WHEN the manual entry form displays THEN the Invoice_Web_System SHALL include fields for: 费用项目名称, 金额, 日期, 备注
4. WHEN a user submits a manual entry form THEN the Invoice_Web_System SHALL validate that required fields are filled
5. WHEN validation passes THEN the Invoice_Web_System SHALL create a reimbursement record without requiring a PDF file

### Requirement 2

**User Story:** As a user, I want to distinguish between invoice-based and manual reimbursement records, so that I can easily identify the source of each record.

#### Acceptance Criteria

1. WHEN displaying reimbursement records THEN the Invoice_Web_System SHALL show a visual indicator for records without invoices
2. WHEN a record has no invoice PDF THEN the Invoice_Web_System SHALL display a "无票报销" badge or icon
3. WHEN a record has an invoice PDF THEN the Invoice_Web_System SHALL display a "有发票" badge or icon
4. WHEN filtering records THEN the Invoice_Web_System SHALL allow users to filter by "有发票" or "无票报销" status

### Requirement 3

**User Story:** As a user, I want to view details of manual reimbursement records, so that I can see all information about expenses without invoices.

#### Acceptance Criteria

1. WHEN a user clicks on a manual reimbursement record THEN the Invoice_Web_System SHALL display a detail modal with all fields
2. WHEN displaying manual record details THEN the Invoice_Web_System SHALL show: 费用项目名称, 金额, 日期, 备注, 上传人, 上传时间, 报销人
3. WHEN displaying manual record details THEN the Invoice_Web_System SHALL clearly indicate "此记录无发票"
4. WHEN a manual record is displayed THEN the Invoice_Web_System SHALL not show a PDF download button

### Requirement 4

**User Story:** As a user, I want to edit manual reimbursement records, so that I can correct mistakes or update information.

#### Acceptance Criteria

1. WHEN viewing a manual reimbursement record THEN the Invoice_Web_System SHALL display an edit button
2. WHEN a user clicks the edit button THEN the Invoice_Web_System SHALL display an editable form with current values
3. WHEN a user modifies fields and saves THEN the Invoice_Web_System SHALL update the record in the database
4. WHEN editing THEN the Invoice_Web_System SHALL validate that required fields remain filled
5. WHEN a record has an invoice PDF THEN the Invoice_Web_System SHALL not allow editing of parsed fields

### Requirement 5

**User Story:** As a user, I want the system to generate unique identifiers for manual records, so that each record can be tracked and referenced.

#### Acceptance Criteria

1. WHEN a manual reimbursement record is created THEN the Invoice_Web_System SHALL generate a unique record identifier
2. WHEN generating identifiers THEN the Invoice_Web_System SHALL use a format that distinguishes manual records from invoice records
3. WHEN displaying manual records THEN the Invoice_Web_System SHALL show the generated identifier
4. WHEN exporting data THEN the Invoice_Web_System SHALL include the identifier for all records

### Requirement 6

**User Story:** As a user, I want to attach voucher images to manual reimbursement records, so that I can provide supporting documentation.

#### Acceptance Criteria

1. WHEN creating a manual reimbursement record THEN the Invoice_Web_System SHALL allow users to upload voucher images
2. WHEN uploading vouchers THEN the Invoice_Web_System SHALL accept common image formats (JPG, PNG)
3. WHEN vouchers are uploaded THEN the Invoice_Web_System SHALL associate them with the manual record
4. WHEN viewing manual record details THEN the Invoice_Web_System SHALL display all attached voucher images
5. WHEN no vouchers are attached THEN the Invoice_Web_System SHALL allow the record to be created without vouchers

### Requirement 7

**User Story:** As a user, I want to see statistics that include both invoice and manual records, so that I can understand total reimbursement amounts.

#### Acceptance Criteria

1. WHEN displaying statistics THEN the Invoice_Web_System SHALL include both invoice-based and manual records in total count
2. WHEN displaying statistics THEN the Invoice_Web_System SHALL include both record types in total amount calculation
3. WHEN displaying statistics THEN the Invoice_Web_System SHALL show separate counts for "有发票记录" and "无票报销记录"
4. WHEN displaying statistics THEN the Invoice_Web_System SHALL show separate amounts for each record type

### Requirement 8

**User Story:** As a user, I want to export both invoice and manual records to Excel, so that I can analyze all reimbursement data together.

#### Acceptance Criteria

1. WHEN exporting to Excel THEN the Invoice_Web_System SHALL include both invoice-based and manual records
2. WHEN exporting THEN the Invoice_Web_System SHALL add a column indicating record type ("发票" or "无票报销")
3. WHEN exporting manual records THEN the Invoice_Web_System SHALL use the generated identifier in place of invoice number
4. WHEN exporting THEN the Invoice_Web_System SHALL include all fields for both record types

### Requirement 9

**User Story:** As a user, I want the manual entry form to be user-friendly, so that I can quickly input reimbursement information.

#### Acceptance Criteria

1. WHEN the manual entry form displays THEN the Invoice_Web_System SHALL use clear field labels in Chinese
2. WHEN entering amounts THEN the Invoice_Web_System SHALL validate that the value is a positive number
3. WHEN entering dates THEN the Invoice_Web_System SHALL provide a date picker for easy selection
4. WHEN entering dates THEN the Invoice_Web_System SHALL default to the current date
5. WHEN the form has validation errors THEN the Invoice_Web_System SHALL display clear error messages next to the relevant fields

### Requirement 10

**User Story:** As a user, I want to delete manual reimbursement records, so that I can remove incorrect or unwanted entries.

#### Acceptance Criteria

1. WHEN a user clicks the delete button for a manual record THEN the Invoice_Web_System SHALL display a confirmation dialog
2. WHEN the user confirms deletion THEN the Invoice_Web_System SHALL remove the record and associated vouchers from the database
3. WHEN the user cancels deletion THEN the Invoice_Web_System SHALL close the dialog without making changes
4. WHEN deletion completes THEN the Invoice_Web_System SHALL display a success notification and refresh the list

### Requirement 11

**User Story:** As a developer, I want the system to maintain data integrity, so that manual records are properly stored and retrieved.

#### Acceptance Criteria

1. WHEN storing manual records THEN the Invoice_Web_System SHALL use the same database table as invoice records
2. WHEN storing manual records THEN the Invoice_Web_System SHALL set a flag or field to indicate the record type
3. WHEN retrieving records THEN the Invoice_Web_System SHALL correctly identify and handle both record types
4. WHEN a manual record has no PDF THEN the Invoice_Web_System SHALL store NULL or empty value for the PDF data field
5. WHEN querying records THEN the Invoice_Web_System SHALL support filtering by record type

### Requirement 12

**User Story:** As a user, I want the system to prevent duplicate manual records, so that I don't accidentally create the same expense entry twice.

#### Acceptance Criteria

1. WHEN a user creates a manual record THEN the Invoice_Web_System SHALL check for potential duplicates based on amount, date, and item name
2. WHEN a potential duplicate is detected THEN the Invoice_Web_System SHALL display a warning with the similar record details
3. WHEN a duplicate warning is shown THEN the Invoice_Web_System SHALL allow the user to proceed or cancel
4. WHEN the user chooses to proceed THEN the Invoice_Web_System SHALL create the record despite the similarity

### Requirement 13

**User Story:** As an administrator, I want to view and filter records by type in the admin portal, so that I can manage both invoice and manual records effectively.

#### Acceptance Criteria

1. WHEN displaying records in admin portal THEN the Invoice_Web_System SHALL show a visual indicator for each record type
2. WHEN a record has no invoice PDF THEN the Invoice_Web_System SHALL display a "无票报销" badge in admin portal
3. WHEN a record has an invoice PDF THEN the Invoice_Web_System SHALL display a "有发票" badge in admin portal
4. WHEN admin views the record list THEN the Invoice_Web_System SHALL provide filter options for "全部", "有发票", and "无票报销"
5. WHEN admin applies a record type filter THEN the Invoice_Web_System SHALL display only records matching that type
6. WHEN displaying statistics in admin portal THEN the Invoice_Web_System SHALL show separate counts and amounts for "有发票记录" and "无票报销记录"
7. WHEN exporting from admin portal THEN the Invoice_Web_System SHALL include record type column with values "发票" or "无票报销"
