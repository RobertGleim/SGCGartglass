# Forms Directory Structure

All forms have been organized into a centralized location for easy access and modification.

## Location

- **Form Components**: `frontend/src/components/forms/`
- **Form Styles**: `frontend/src/styles/forms/`

## Available Forms

### 1. AdminLoginForm
- **Component**: `frontend/src/components/forms/AdminLoginForm.jsx`
- **CSS**: `frontend/src/styles/forms/AdminLoginForm.css`
- **Used in**: `frontend/src/pages/admin/AdminLogin.jsx`
- **Purpose**: Admin authentication with email/password and show/hide password toggle

### 2. CustomerLoginForm
- **Component**: `frontend/src/components/forms/CustomerLoginForm.jsx`
- **CSS**: `frontend/src/styles/forms/CustomerLoginForm.css`
- **Used in**: `frontend/src/pages/customer/CustomerLogin.jsx`
- **Purpose**: Customer authentication with email/password

### 3. CustomerSignupForm
- **Component**: `frontend/src/components/forms/CustomerSignupForm.jsx`
- **CSS**: `frontend/src/styles/forms/CustomerSignupForm.css`
- **Used in**: `frontend/src/pages/customer/CustomerSignup.jsx`
- **Purpose**: New customer account creation with first name, last name, email, phone, and password

### 4. AddEtsyListingForm
- **Component**: `frontend/src/components/forms/AddEtsyListingForm.jsx`
- **CSS**: `frontend/src/styles/forms/AddEtsyListingForm.css`
- **Used in**: `frontend/src/pages/admin/AdminDashboard.jsx`
- **Purpose**: Add Etsy listings by URL or ID

### 5. ManualProductForm
- **Component**: `frontend/src/components/forms/ManualProductForm.jsx`
- **CSS**: `frontend/src/styles/forms/ManualProductForm.css`
- **Used in**: `frontend/src/pages/admin/AdminDashboard.jsx` (currently embedded, can be extracted)
- **Purpose**: Add/edit manual products with:
  - Product name, description
  - Image/video uploads with watermark support
  - Multi-select categories and materials
  - Dimensions (width, height, depth)
  - Price and quantity
  - Featured product toggle

## How to Modify Forms

### To modify a form's appearance:
1. Navigate to `frontend/src/styles/forms/`
2. Edit the corresponding CSS file (e.g., `AdminLoginForm.css`)
3. Save and rebuild the frontend

### To modify a form's functionality:
1. Navigate to `frontend/src/components/forms/`
2. Edit the corresponding JSX file (e.g., `AdminLoginForm.jsx`)
3. Save and rebuild the frontend

## Benefits of This Structure

✅ **Centralized Location**: All forms in one place  
✅ **Easy to Find**: Clear naming convention  
✅ **Reusable**: Forms can be imported anywhere in the app  
✅ **Maintainable**: Each form has its own CSS file  
✅ **Scalable**: Easy to add new forms following the same pattern

## Adding a New Form

1. Create component file in `frontend/src/components/forms/YourFormName.jsx`
2. Create CSS file in `frontend/src/styles/forms/YourFormName.css`
3. Import the component where needed: `import YourFormName from '../../components/forms/YourFormName'`
4. Use it in your page: `<YourFormName onSubmit={handleSubmit} />`

## Form Props Pattern

All forms follow a consistent prop pattern:
- Authentication forms receive: `onLogin` or `onSignup`
- Data entry forms receive: `onSubmit` or `onAddItem`
- Edit forms receive: `editingItem`, `item`, `onSubmit`, `onClose`
