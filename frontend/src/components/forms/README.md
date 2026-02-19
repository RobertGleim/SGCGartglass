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

### 5. ManualProductForm (DEPRECATED)
- **Component**: `frontend/src/components/forms/ManualProductForm.jsx`
- **CSS**: `frontend/src/styles/forms/ManualProductForm.css`
- **Used in**: `frontend/src/pages/admin/AdminDashboard.jsx` (legacy)
- **Status**: ⚠️ **Deprecated** - Use StainedGlassForm or WoodworkForm instead
- **Purpose**: Original unified product form (replaced by product-specific forms)

### 6. StainedGlassForm ✨
- **Component**: `frontend/src/components/forms/StainedGlassForm.jsx`
- **CSS**: `frontend/src/styles/forms/stainedglass_form.css`
- **Used in**: `frontend/src/pages/admin/AdminDashboard.jsx`
- **Purpose**: Add/edit stained glass products with:
  - Product name, description
  - Image/video uploads with watermark support
  - Multi-select categories and materials
  - Dimensions (width, height, depth)
  - Price and quantity
  - Featured product toggle
- **Theme**: Blue color scheme (#2196F3, #1976D2, #e3f2fd)
- **CSS Scope**: All classes prefixed with `.stainedglass-`

### 7. WoodworkForm ✨
- **Component**: `frontend/src/components/forms/WoodworkForm.jsx`
- **CSS**: `frontend/src/styles/forms/woodwork_form.css`
- **Used in**: `frontend/src/pages/admin/AdminDashboard.jsx`
- **Purpose**: Add/edit woodwork products with:
  - Product name, description
  - Image/video uploads with watermark support
  - Multi-select categories and materials
  - Dimensions (width, height, depth)
  - Price and quantity
  - Featured product toggle
- **Theme**: Brown/wood color scheme (#8B4513, #A0522D, #FFF8DC, #DEB887)
- **CSS Scope**: All classes prefixed with `.woodwork-`

## 🎨 Product-Specific Forms

**When to use StainedGlassForm vs WoodworkForm:**

- **StainedGlassForm**: Use for all stained glass products
  - Blue-themed UI for visual differentiation
  - Optimized styling for glass product categories
  - Independent customization from woodwork products

- **WoodworkForm**: Use for all woodwork products
  - Brown/wood-themed UI for visual differentiation
  - Optimized styling for woodwork product categories
  - Independent customization from stained glass products

**Benefits of Separated Forms:**
- ✅ **Independent Styling**: Customize each product type's form without affecting the other
- ✅ **Visual Differentiation**: Color themes help identify product types at a glance
- ✅ **No CSS Conflicts**: Class name prefixes ensure complete style isolation
- ✅ **Scalable**: Easy to add product-specific features to one form without affecting others

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
✅ **Mobile-First**: All forms use responsive design optimized for mobile devices

## 📱 Mobile-First Responsive Design

All forms implement mobile-first responsive design with industry-standard breakpoints:

- **Base (320px)**: Small phones - foundation styles
- **375px**: Modern smartphones - slight adjustments
- **480px**: Large phones - improved spacing
- **768px**: Tablets and desktop - full desktop layout

### Responsive Features:
- Flexible grid layouts that adapt to screen size
- Touch-friendly button and input sizes on mobile
- Progressive enhancement from mobile to desktop
- Consistent spacing and padding across breakpoints

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
