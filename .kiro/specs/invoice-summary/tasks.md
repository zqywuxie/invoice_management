# Implementation Plan

- [x] 1. Set up project structure and dependencies





  - Create directory structure: `src/`, `tests/`, `data/`
  - Create `requirements.txt` with dependencies: pdfplumber, openpyxl, hypothesis, pytest
  - Create `__init__.py` files for package structure
  - _Requirements: 1.1-1.5_

- [x] 2. Implement Invoice data model





  - [x] 2.1 Create Invoice dataclass with all fields (invoice_number, invoice_date, item_name, amount, remark, file_path, scan_time)


    - Implement `__eq__` method for comparison
    - Use Decimal for amount field
    - _Requirements: 1.1-1.5_
  - [x] 2.2 Create AddResult, InvoiceSummary, and BatchResult dataclasses

    - Define all fields as specified in design
    - _Requirements: 2.1, 3.1, 5.2_

- [x] 3. Implement DataStore for JSON serialization





  - [x] 3.1 Implement serialize_invoice and deserialize_invoice methods


    - Handle Decimal to string conversion for JSON compatibility
    - Handle datetime serialization
    - _Requirements: 1.6, 1.7_
  - [ ]* 3.2 Write property test for serialization round trip
    - **Property 1: Serialization Round Trip**
    - **Validates: Requirements 1.6, 1.7**
  - [x] 3.3 Implement save and load methods for JSON file storage


    - Create data directory if not exists
    - Handle file I/O errors gracefully
    - _Requirements: 1.6, 1.7_

- [x] 4. Implement DuplicateDetector





  - [x] 4.1 Implement is_duplicate method using invoice_number set


    - Build set from existing invoices on initialization
    - _Requirements: 2.1, 2.2_
  - [x] 4.2 Implement get_original method to retrieve original invoice

    - Return None if not found
    - _Requirements: 2.3_

- [x] 5. Implement InvoiceManager
  - [x] 5.1 Implement add_invoice method with duplicate detection
    - Return AddResult with appropriate status
    - Update internal invoice list and duplicate detector
    - _Requirements: 2.1, 2.2_
  - [ ]* 5.2 Write property test for duplicate detection
    - **Property 2: Duplicate Detection Prevents Addition**
    - **Validates: Requirements 2.1, 2.2**
  - [x] 5.3 Implement get_all_invoices and get_summary methods
    - Return complete invoice list with all fields
    - _Requirements: 3.1_
  - [ ]* 5.4 Write property test for summary completeness
    - **Property 3: Summary Contains All Invoices**
    - **Validates: Requirements 3.1**
  - [x] 5.5 Implement get_total_amount method
    - Sum all invoice amounts using Decimal arithmetic
    - _Requirements: 3.2_
  - [ ]* 5.6 Write property test for total amount calculation
    - **Property 4: Total Amount Equals Sum**
    - **Validates: Requirements 3.2**
  - [x] 5.7 Implement get_invoice_count method

    - Return count of unique invoices
    - _Requirements: 3.3_
  - [ ]* 5.8 Write property test for invoice count accuracy
    - **Property 5: Invoice Count Accuracy**
    - **Validates: Requirements 3.3**


- [x] 6. Checkpoint - Ensure all tests pass




  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implement InvoicePDFParser





  - [x] 7.1 Implement _extract_invoice_number method using regex patterns


    - Look for invoice number pattern in upper right area
    - _Requirements: 1.1_


  - [x] 7.2 Implement _extract_date method
    - Parse date in various Chinese date formats
    - Convert to YYYY-MM-DD format

    - _Requirements: 1.2_
  - [x] 7.3 Implement _extract_item_name method

    - Extract project/item name from invoice body
    - _Requirements: 1.3_
  - [x] 7.4 Implement _extract_amount method


    - Extract and parse amount to Decimal
    - Handle currency symbols and formatting
    - _Requirements: 1.4_
  - [x] 7.5 Implement _extract_remark method


    - Extract remark/note field from invoice
    - _Requirements: 1.5_

  - [x] 7.6 Implement main parse method

    - Use pdfplumber to extract text
    - Call all extraction methods
    - Return Invoice object
    - _Requirements: 1.1-1.5_
  - [ ]* 7.7 Write unit tests for PDF parser with sample invoice
    - Test extraction of each field
    - Test error handling for invalid PDFs
    - _Requirements: 1.1-1.5_

- [-] 8. Implement ExportService



  - [x] 8.1 Implement format_amount method


    - Format Decimal to string with exactly 2 decimal places
    - _Requirements: 4.3_
  - [ ]* 8.2 Write property test for amount formatting
    - **Property 7: Amount Formatting**
    - **Validates: Requirements 4.3**

  - [x] 8.3 Implement export_to_excel method


    - Create workbook with invoice data
    - Add summary statistics row
    - Format columns appropriately
    - _Requirements: 4.1, 4.2_
  - [ ]* 8.4 Write property test for export record count
    - **Property 6: Export Contains All Records**
    - **Validates: Requirements 4.1**


- [-] 9. Implement InvoiceService for batch processing


  - [ ] 9.1 Implement process_single_file method
    - Parse PDF, check duplicate, add to manager
    - Return AddResult
    - _Requirements: 1.1-1.5, 2.1, 2.2_
  - [ ] 9.2 Implement process_batch method
    - Process multiple files sequentially
    - Track success, duplicate, and error counts
    - Continue on individual file errors
    - _Requirements: 5.1, 5.2, 5.3_
  - [ ]* 9.3 Write property test for batch processing counts
    - **Property 8: Batch Processing Counts**

    - **Validates: Requirements 5.2**


- [ ] 10. Implement CLI interface

  - [ ] 10.1 Create main entry point with argument parsing
    - Support single file and batch mode
    - Support export command
    - _Requirements: 1.1-1.5, 4.1, 5.1_
  - [ ] 10.2 Implement scan command
    - Display extracted invoice info
    - Show duplicate warning if applicable
    - _Requirements: 1.1-1.5, 2.1_
  - [ ] 10.3 Implement summary command
    - Display all invoices in table format
    - Show total amount and count
    - _Requirements: 3.1, 3.2, 3.3_
  - [ ] 10.4 Implement export command

    - Export to specified Excel file path

    - Show success message
    - _Requirements: 4.1, 4.2_

- [ ] 11. Final Checkpoint - Ensure all tests pass

  - Ensure all tests pass, ask the user if questions arise.
