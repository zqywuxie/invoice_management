# Implementation Plan

- [x] 1. Set up project structure and Flask application





  - [x] 1.1 Create `invoice_web` folder structure with templates and static directories


    - Create `invoice_web/`, `invoice_web/templates/`, `invoice_web/static/css/`, `invoice_web/static/js/`
    - _Requirements: 11.1, 11.3_
  - [x] 1.2 Create Flask application entry point (`invoice_web/app.py`)


    - Initialize Flask app with template and static folder configuration
    - Import and configure existing core modules (SQLiteDataStore, InvoiceManager, etc.)
    - _Requirements: 11.2_
  - [x] 1.3 Update `requirements.txt` with Flask dependency


    - Add Flask to project dependencies
    - _Requirements: 11.2_
  - [x] 1.4 Extend SQLite database schema to support PDF storage


    - Add `pdf_data` BLOB column to invoices table
    - Update SQLiteDataStore to handle PDF binary data






    - _Requirements: 2.6, 2.7_



- [ ] 2. Implement base HTML templates

  - [ ] 2.1 Create base template (`invoice_web/templates/base.html`)
    - Include Bootstrap 5 CDN links





    - Define common layout structure with navigation

    - _Requirements: 1.1, 1.3_



  - [-] 2.2 Create main page template (`invoice_web/templates/index.html`)

    - Invoice table with sortable columns
    - Upload button, export button, search box
    - Summary statistics panel
    - Modal dialogs for detail view, delete confirmation, duplicate warning
    - _Requirements: 1.1, 1.2, 1.4_


- [ ] 3. Implement custom CSS styles
  - [ ] 3.1 Create custom stylesheet (`invoice_web/static/css/style.css`)
    - Clean, minimalist design with consistent color scheme
    - Responsive adjustments for different screen sizes
    - _Requirements: 1.3, 1.4_

- [ ] 4. Implement API routes for invoice operations

  - [ ] 4.1 Create routes module (`invoice_web/routes.py`)
    - Define Blueprint for API routes
    - _Requirements: 1.2_
  - [ ] 4.2 Implement GET `/api/invoices` endpoint
    - Return all invoices with search parameter support
    - Include total_count and total_amount in response
    - _Requirements: 1.2, 6.1, 6.2, 6.3, 7.1, 7.2_
  - [ ]* 4.3 Write property test for invoice list and search
    - **Property 1: Invoice Persistence Round Trip**
    - **Property 4: Search Completeness**
    - **Property 5: Empty Search Returns All**
    - **Property 6: Statistics Accuracy**
    - **Validates: Requirements 1.2, 6.1, 6.2, 6.3, 7.1, 7.2**
  - [ ] 4.4 Implement GET `/api/invoices/<number>` endpoint
    - Return single invoice details
    - Return 404 if not found
    - _Requirements: 4.1, 4.2_
  - [ ]* 4.5 Write property test for invoice detail
    - **Property 8: Invoice Detail Completeness**
    - **Validates: Requirements 4.2**
  - [ ] 4.6 Implement POST `/api/invoices` endpoint
    - Handle PDF file upload
    - Parse PDF and extract invoice data
    - Check for duplicates and return appropriate response
    - _Requirements: 2.2, 2.3, 2.4, 3.1, 3.2, 3.3_
  - [ ]* 4.7 Write property test for duplicate prevention
    - **Property 2: Duplicate Prevention**
    - **Validates: Requirements 3.1, 3.3**
  - [ ] 4.8 Implement DELETE `/api/invoices/<number>` endpoint
    - Delete invoice by invoice number




    - Return success/failure response







    - _Requirements: 5.2, 5.4_
  - [ ]* 4.9 Write property test for delete operation
    - **Property 3: Delete Removes Invoice**
    - **Validates: Requirements 5.2**
  - [ ] 4.10 Implement GET `/api/invoices/export` endpoint
    - Generate Excel file using existing ExportService
    - Return file as download

    - _Requirements: 8.1, 8.2, 8.3, 8.4_
  - [ ]* 4.11 Write property test for export completeness
    - **Property 9: Export Completeness**

    - **Validates: Requirements 8.3**
  - [ ] 4.12 Implement GET `/api/invoices/<number>/pdf` endpoint
    - Retrieve PDF binary data from database
    - Return PDF file as download with appropriate filename

    - _Requirements: 10.1, 10.2, 10.3_
  - [ ]* 4.13 Write property test for PDF storage round trip
    - **Property 10: PDF Storage Round Trip**
    - **Validates: Requirements 2.6, 2.7, 10.2**


- [x] 5. Checkpoint - Ensure all backend tests pass


  - Ensure all tests pass, ask the user if questions arise.



- [x] 6. Implement frontend JavaScript



  - [x] 6.1 Create main JavaScript file (`invoice_web/static/js/app.js`)





    - Initialize page and load invoice data



    - _Requirements: 1.2_

  - [ ] 6.2 Implement invoice table rendering and sorting
    - Render invoice data in table
    - Handle column header clicks for sorting
    - Display sort direction indicators
    - _Requirements: 2.1, 9.1, 9.2, 9.3_
  - [ ]* 6.3 Write property test for sort ordering
    - **Property 7: Sort Ordering**
    - **Validates: Requirements 9.1, 9.2**
  - [ ] 6.4 Implement search functionality
    - Handle search input changes
    - Filter invoices via API call
    - _Requirements: 6.1, 6.2, 6.3_
  - [ ] 6.5 Implement file upload functionality
    - Handle file selection and upload
    - Display upload progress and results
    - Handle multiple file uploads
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_
  - [ ] 6.6 Implement modal dialogs
    - Invoice detail modal with PDF download button
    - Delete confirmation modal
    - Duplicate warning modal with comparison view
    - _Requirements: 3.2, 4.1, 4.3, 5.1, 5.3, 10.1_
  - [ ] 6.7 Implement statistics update
    - Update total count and amount after operations
    - _Requirements: 7.1, 7.2, 7.3_
  - [ ] 6.8 Implement export functionality
    - Handle export button click
    - Trigger file download
    - _Requirements: 8.1, 8.2_
  - [ ] 6.9 Implement toast notifications
    - Show success/error messages
    - Auto-dismiss after timeout
    - _Requirements: 5.4_

- [ ] 7. Create application entry point

  - [ ] 7.1 Create main entry script (`invoice_web/run.py`)
    - Configure and start Flask development server
    - _Requirements: 10.3_
  - [ ] 7.2 Update project README or create startup instructions
    - Document how to start the web application
    - _Requirements: 10.1_


- [ ] 8. Final Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.
