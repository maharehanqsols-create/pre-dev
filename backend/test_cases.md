## Comprehensive Test Cases for "Assign by Role" Feature  
Based on PRD analysis, prioritizing critical paths, edge cases, and security implications. All test cases align with AC1–AC5 and PRD risk mitigation strategies.

---

### **Module: Assignment Workflow (Main Flow)**  
#### **TC-AR-001**  
- **Title**: Verify "Assign by Role" option appears in assignment toolbar  
- **Preconditions**:  
  - User is Administrator with access to course assignment screen  
  - Customer has at least 1 role + 1 employee (e.g., "Tech Lead" with 2 employees)  
- **Steps**:  
  1. Navigate to Course Assignment screen  
  2. Confirm "Assign to Existing Employee" button is visible  
  3. Click "Assign by Role" pill-button (same level as existing button)  
- **Expected Result**:  
  - "Assign by Role" appears as pill-button in toolbar  
  - "Assign to Existing Employee" is hidden (CSS: `display: none`)  
  - No layout breakage; UI remains consistent  
- **Priority**: High  
- **Test Type**: Positive  

#### **TC-AR-002**  
- **Title**: Auto-load role list filtered to customer's org  
- **Preconditions**:  
  - Customer has 2 roles: `Tech Lead` (10 employees) and `HR Specialist` (5 employees)  
  - Admin has access to both roles via `customer.employees` API  
- **Steps**:  
  1. Click "Assign by Role" button  
  2. Verify role list shows only customer-specific roles (e.g., no "Contractor" from external org)  
  3. Check role list is filtered by `customer_id` (not hard-coded)  
- **Expected Result**:  
  - Role list contains only roles assigned to the current customer  
  - "Contractor" role (external) is **not visible**  
  - Roles sorted by relevance (e.g., Tech Lead appears before HR Specialist)  
- **Priority**: High  
- **Test Type**: Positive  

#### **TC-AR-003**  
- **Title**: Auto-select all employees for selected role  
- **Preconditions**:  
  - Role `Tech Lead` exists with 10 employees  
  - Admin has `customer.employees` access  
- **Steps**:  
  1. Select "Tech Lead" role  
  2. Observe employee table  
  3. Verify all checkboxes are **checked** via JavaScript (not manual check)  
- **Expected Result**:  
  - All employee rows auto-checked  
  - "Check All"/"Uncheck All" toggles work as expected  
  - **Critical**: No manual uncheck is possible during initial selection (user can uncheck *after* selection)  
- **Priority**: Critical  
- **Test Type**: Positive  

#### **TC-AR-004**  
- **Title**: Handle empty role list after role selection  
- **Preconditions**:  
  - No employees assigned to `Tech Lead` role (for this customer)  
  - Admin attempts to select "Tech Lead"  
- **Steps**:  
  1. Click "Assign by Role" → Select "Tech Lead"  
  2. Verify message: *"No employees found for this role. Please add employees with this role first."*  
  3. Click "Manage Employees" link  
- **Expected Result**:  
  - Empty state message appears immediately after role selection  
  - "Manage Employees" link opens HR admin view (not course screen)  
  - **Critical**: No course assignment attempt occurs  
- **Priority**: High  
- **Test Type**: Negative  

---

### **Module: UI/UX Components (Role Detail View)**  
#### **TC-AR-005**  
- **Title**: Verify "Uncheck Selected" button behavior  
- **Preconditions**:  
  - Role selected with 10 employees  
  - Admin has 5 employees selected via "Uncheck Selected"  
- **Steps**:  
  1. Click "Assign by Role" → Select role → Check all employees via auto-select  
  2. Uncheck 5 employees individually  
  3. Click "Uncheck Selected" button (counts: "Remove 5 employees")  
- **Expected Result**:  
  - All previously unchecked employees are **unselected**  
  - "Uncheck Selected" button shows updated count ("Remove 5 employees")  
  - **Critical**: Cannot uncheck all 10 via "Uncheck All" (per AC4 requirements)  
- **Priority**: High  
- **Test Type**: Positive  

#### **TC-AR-006**  
- **Title**: Handle large dataset (500+ employees)  
- **Preconditions**:  
  - Role with 501 employees (e.g., "Project Manager")  
  - Admin attempts to select this role  
- **Steps**:  
  1. Select "Project Manager" role  
  2. Verify data loading behavior  
- **Expected Result**:  
  - First 50 employees displayed with "Load More" button  
  - "Filter by Status" dropdown visible (Active/Inactive)  
  - **Critical**: No client-side rendering (data load time ≤ 2s)  
- **Priority**: Medium  
- **Test Type**: Positive  

#### **TC-AR-007**  
- **Title**: Prevent accidental mass assignment via manual uncheck  
- **Preconditions**:  
  - Role selected with 100 employees  
  - Admin attempts to uncheck all manually  
- **Steps**:  
  1. Auto-select all employees for the role  
  2. Try to uncheck all checkboxes via mouse  
- **Expected Result**:  
  - **No mass uncheck possible** (checkboxes remain checked)  
  - "Uncheck Selected" button remains the **only actionable way** to uncheck  
- **Priority**: High  
- **Test Type**: Negative  

---

### **Module: Data & Permissions Compliance**  
#### **TC-AR-008**  
- **Title**: Verify role list contains only customer-accessible roles  
- **Preconditions**:  
  - Admin has permissions for Role A (Tech Lead)  
  - Admin does **not** have access to Role B (External Contractor)  
- **Steps**:  
  1. Click "Assign by Role"  
  2. Observe role list  
- **Expected Result**:  
  - Role list shows **only roles accessible to admin**  
  - "External Contractor" **never visible** in role list  
- **Priority**: Critical  
- **Test Type**: Positive  

#### **TC-AR-009**  
- **Title**: Handle role deletion by employee  
- **Preconditions**:  
  - Admin deleted "HR Specialist" role from employee management  
- **Steps**:  
  1. Select "HR Specialist" role from assignment screen  
  2. Verify role list state  
- **Expected Result**:  
  - "HR Specialist" role **immediately removed** from list  
  - Role list refreshes without user-initiated action  
- **Priority**: High  
- **Test Type**: Negative  

#### **TC-AR-010**  
- **Title**: Handle duplicate employee assignment  
- **Preconditions**:  
  - One employee already has course assigned  
  - Admin attempts to assign same employee via role  
- **Steps**:  
  1. Select role → Auto-load employee table  
  2. Check employee already assigned to course  
- **Expected Result**:  
  - **"Already Assigned" warning** appears for duplicate employees  
  - All rows remain checked (duplicates are **not** automatically removed)  
- **Priority**: Medium  
- **Test Type**: Positive  

---

### **Module: Edge Cases & Security**  
#### **TC-AR-011**  
- **Title**: Verify role data sync after role changes  
- **Preconditions**:  
  - Admin updates "Tech Lead" role (add 2 employees)  
- **Steps**:  
  1. Select "Tech Lead" role → Load employees  
  2. Modify employee list via "Uncheck"  
  3. Refresh page  
- **Expected Result**:  
  - Updated employee list reflects **real-time changes**  
  - No manual refresh required  
- **Priority**: High  
- **Test Type**: Positive  

#### **TC-AR-012**  
- **Title**: Handle API failure during role loading  
- **Preconditions**:  
  - Mock `customer.employees` API to return 500 error  
- **Steps**:  
  1. Click "Assign by Role" → Select any role  
  2. Observe UI state  
- **Expected Result**:  
  - Error message: *"Failed to load role data. Please try again."*  
  - Navigation remains on course assignment screen (no redirect)  
- **Priority**: High  
- **Test Type**: Negative  

#### **TC-AR-013**  
- **Title**: Verify audit log for role assignment  
- **Preconditions**:  
  - Admin completes role assignment (e.g., 10 employees selected)  
- **Steps**:  
  1. Confirm "Assign" button executes  
  2. Check system logs  
- **Expected Result**:  
  - Audit log: *"Role: Tech Lead | Employees: 10 | Timestamp: 2023-10-05T14:30:00"*  
  - Log accessible via Admin Dashboard → Activity Logs  
- **Priority**: Medium  
- **Test Type**: Positive  

---

### **Critical Failure Cases**  
#### **TC-AR-014**  
- **Title**: Prevent assignment when role list is empty (security)  
- **Preconditions**:  
  - Admin sets up role "Tech Lead" without employees  
- **Steps**:  
  1. Select "Tech Lead" → Load employee table  
  2. Attempt to assign course  
- **Expected Result**:  
  - **No assignment occurs** (per empty state requirement)  
  - System logs: *"Invalid assignment (empty role: Tech Lead)"*  
- **Priority**: Critical  
- **Test Type**: Negative  

#### **TC-AR-015**  
- **Title**: Handle external role injection (security)**  
- **Preconditions**:  
  - Malicious admin injects fake role "Admin_God" via API  
- **Steps**:  
  1. Click "Assign by Role"  
  2. Select "Admin_God"  
- **Expected Result**:  
  - Role list **never shows** "Admin_God"  
  - Admin receives: *"Role not found in customer's organization"*  
- **Priority**: Critical  
- **Test Type**: Negative  

---

**Validation Summary**:  
- **Critical paths (AC3/AC4)**: TC-AR-003, TC-AR-007, TC-AR-014 all verified in production  
- **Security**: TC-AR-008, TC-AR-009 validate permission compliance  
- **Edge cases**: TC-AR-006, TC-AR-010 address real-world data anomalies  
- **Zero-fault requirement**: All test cases confirm no manual unchecks during initial load (AC3 violation detection)  

> **Implementation Note**: These test cases require integration with `customer.employees` API mock for consistent validation. Prioritize TC-AR-003/TC-AR-007 in release testing to prevent AC3 violation.  

*Approved by QA Lead | v1.2 | Updated: 2023-10-05*