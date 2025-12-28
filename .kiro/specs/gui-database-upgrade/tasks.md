# Implementation Plan

- [x] 1. Implement SQLiteDataStore





  - [x] 1.1 Create SQLiteDataStore class with database initialization


    - Create `src/sqlite_data_store.py`
    - Implement `__init__` method with database path configuration
    - Implement `_init_database` method to create invoices table with schema
    - Add indexes for invoice_number and invoice_date
    - _Requirements: 3.1, 3.2_
  - [ ]* 1.2 Write property test for database serialization round trip
    - **Property 1: Database Serialization Round Trip**
    - **Validates: Requirements 3.5, 3.6**
  - [x] 1.3 Implement serialize_invoice and deserialize_invoice methods

    - Handle Decimal to string conversion
    - Handle datetime serialization
    - _Requirements: 3.5, 3.6_

  - [x] 1.4 Implement insert method
    - Insert single invoice record to database
    - Handle unique constraint violation
    - _Requirements: 3.3_
  - [ ]* 1.5 Write property test for insert persistence
    - **Property 3: Insert Persists to Database**

    - **Validates: Requirements 3.3**
  - [x] 1.6 Implement delete method
    - Delete invoice by invoice_number
    - Return success/failure status
    - _Requirements: 7.2_
  - [ ]* 1.7 Write property test for delete removal
    - **Property 4: Delete Removes from Database**

    - **Validates: Requirements 7.2**
  - [x] 1.8 Implement load_all and search methods
    - Load all invoices from database
    - Search invoices by keyword across all text fields
    - _Requirements: 3.4, 8.1_
  - [ ]* 1.9 Write property test for search filter accuracy
    - **Property 6: Search Filter Accuracy**
    - **Validates: Requirements 8.1**


- [x] 2. Extend InvoiceManager for delete and search


  - [x] 2.1 Update InvoiceManager to use SQLiteDataStore


    - Modify constructor to accept SQLiteDataStore
    - Update add_invoice to use database insert
    - _Requirements: 3.3_

  - [x] 2.2 Implement delete_invoice method

    - Remove from internal list and duplicate detector
    - Delete from database
    - _Requirements: 7.2_


  - [x] 2.3 Implement search_invoices method

    - Delegate to SQLiteDataStore search
    - Return filtered invoice list
    - _Requirements: 8.1_

- [x] 3. Checkpoint - Ensure database layer tests pass





  - Ensure all tests pass, ask the user if questions arise.


- [x] 4. Implement GUI Components




  - [x] 4.1 Create SummaryPanel component


    - Create `src/gui/summary_panel.py`
    - Display total invoice count label
    - Display total amount label with currency formatting
    - Implement update method
    - _Requirements: 6.1, 6.2_
  - [ ]* 4.2 Write property test for summary accuracy
    - **Property 5: Summary Reflects Current Data**
    - **Validates: Requirements 6.1, 6.2, 6.3, 8.3**

  - [x] 4.3 Create InvoiceTable component

    - Create `src/gui/invoice_table.py`
    - Use tkinter Treeview with columns for all invoice fields
    - Implement load_data method to populate table
    - Implement sort_by_column method for column header clicks
    - Implement get_selected_invoice method
    - Add scrollbar support
    - _Requirements: 2.1, 2.2, 2.5_
  - [ ]* 4.4 Write property test for table display completeness
    - **Property 2: Table Displays All Invoices**
    - **Validates: Requirements 2.1**


  - [x] 4.5 Create dialog modules

    - Create `src/gui/dialogs.py`
    - Implement InvoiceDetailDialog for showing invoice details
    - Implement DuplicateWarningDialog for duplicate warnings
    - Implement ConfirmDeleteDialog for delete confirmation
    - _Requirements: 2.3, 4.1, 4.2, 4.3, 7.1, 7.4_



- [x] 5. Implement MainWindow



  - [x] 5.1 Create MainWindow class structure


    - Create `src/gui/main_window.py`
    - Initialize tkinter root window with title and size
    - Create frame layout for components
    - _Requirements: 1.1_

  - [x] 5.2 Implement menu bar
    - Add File menu with Add Invoice, Export, Exit options
    - Add Help menu with About option
    - _Requirements: 1.1_

  - [x] 5.3 Implement toolbar
    - Add "添加发票" button with file dialog trigger
    - Add "导出Excel" button
    - Add "删除" button (disabled by default)
    - Add search entry box

    - _Requirements: 1.2, 5.1, 7.1, 8.1_
  - [x] 5.4 Integrate InvoiceTable and SummaryPanel
    - Add InvoiceTable to main frame
    - Add SummaryPanel below table
    - Wire up selection events

    - _Requirements: 1.1, 1.5_
  - [x] 5.5 Implement status bar
    - Create status bar at bottom of window
    - Implement show_status method for messages
    - _Requirements: 5.3_

- [x] 6. Implement GUI Event Handlers

  - [x] 6.1 Implement add invoice handler
    - Open file dialog for PDF selection (single and multiple)
    - Process selected files through InvoiceService
    - Show duplicate warning dialog if needed
    - Refresh table and summary after adding
    - Show status message
    - _Requirements: 1.2, 1.3, 1.4, 4.1, 4.2, 4.3_

  - [x] 6.2 Implement delete invoice handler
    - Get selected invoice from table
    - Show confirmation dialog
    - Delete invoice if confirmed
    - Refresh table and summary
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [x] 6.3 Implement export handler
    - Open save file dialog
    - Export to Excel using ExportService
    - Show success/error status
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [x] 6.4 Implement search handler
    - Bind search entry to filter function
    - Filter table on text change
    - Update summary for filtered results
    - Clear filter when search box is empty
    - _Requirements: 8.1, 8.2, 8.3_

  - [x] 6.5 Implement table interaction handlers

    - Double-click to show detail dialog
    - Right-click for context menu
    - Selection change to enable/disable buttons
    - _Requirements: 2.3, 2.4, 1.5_

- [x] 7. Create Application Entry Point





  - [x] 7.1 Create main application module


    - Create `src/gui/app.py`
    - Initialize all services (SQLiteDataStore, InvoiceManager, etc.)
    - Create and run MainWindow
    - _Requirements: 1.1, 3.1_

  - [x] 7.2 Update project entry point

    - Create `main.py` in project root
    - Launch GUI application
    - _Requirements: 1.1_



- [x] 8. Data Migration (Optional)




  - [x] 8.1 Implement JSON to SQLite migration

    - Check for existing JSON data file
    - Prompt user for migration if found
    - Migrate data to SQLite database
    - _Requirements: 3.1, 3.2_



- [x] 9. Final Checkpoint - Ensure all tests pass



  - Ensure all tests pass, ask the user if questions arise.
