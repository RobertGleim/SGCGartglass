# Product Form Customization Guide

## Overview

The product forms for **Stained Glass** and **Woodwork** products have been separated into two independent styling systems. You can now customize each form's appearance without affecting the other.

## How It Works

### 1. **Two Separate Buttons**
In the Admin Dashboard, there are two buttons to add products:
- **Add Stained Glass Product** - Opens the blue-themed form
- **Add Wood Work Product** - Opens the brown-themed form

### 2. **Two Separate CSS Files**
Each product type has its own CSS file:
- **Stained Glass**: `frontend/src/styles/forms/stainedglass_form.css`
- **Woodwork**: `frontend/src/styles/forms/woodwork_form.css`

### 3. **Independent Customization**
Changes to one CSS file will ONLY affect that product type's form.

## Current Themes

### Stained Glass Form (Blue Theme)
- **Primary Color**: `#2196F3` (Blue)
- **Hover Color**: `#1976D2` (Darker Blue)
- **Header Background**: Blue gradient
- **Watermark Section**: Light blue (`#f0f7ff`)
- **Category Tags**: Light blue with blue border
- **Material Tags**: Light purple
- **Focus Color**: Blue

### Woodwork Form (Brown Theme)
- **Primary Color**: `#8B4513` (Saddle Brown)
- **Hover Color**: `#A0522D` (Sienna)
- **Header Background**: Brown gradient
- **Watermark Section**: Cornsilk (`#FFF8DC`)
- **Category Tags**: Cornsilk with tan border
- **Material Tags**: Burlywood
- **Focus Color**: Brown

## How to Customize

### Example: Change Stained Glass Form Button Color

**File**: `frontend/src/styles/forms/stainedglass_form.css`

**Find this section (near the bottom)**:
```css
.product-form-stainedGlass .upload-button {
  background-color: #2196F3;  /* Change this color */
  color: white;
  /* ... */
}

.product-form-stainedGlass .upload-button:hover {
  background-color: #1976D2;  /* Change this hover color */
}
```

**Change to** (example - green):
```css
.product-form-stainedGlass .upload-button {
  background-color: #4CAF50;  /* Green */
  color: white;
  /* ... */
}

.product-form-stainedGlass .upload-button:hover {
  background-color: #388E3C;  /* Darker green */
}
```

### Example: Change Woodwork Form Header

**File**: `frontend/src/styles/forms/woodwork_form.css`

**Find this section**:
```css
.product-form-woodwork .modal-header {
  background: linear-gradient(135deg, #8B4513 0%, #A0522D 100%);
  /* ... */
}
```

**Change background to solid color**:
```css
.product-form-woodwork .modal-header {
  background: #654321;  /* Dark brown solid color */
  /* ... */
}
```

## CSS Customization Targets

You can customize these elements independently for each form:

### Form Components
- `.upload-button` - Image upload button
- `.watermark-section` - Watermark settings area
- `.category-tag` - Category pills/tags
- `.material-tag` - Material pills/tags
- `.modal-header` - Form header
- `.button.primary` - Primary action buttons
- `.multi-select-add-btn` - Add category/material buttons
- Input focus states (`input:focus`, `textarea:focus`, `select:focus`)

### Color Properties to Modify
- `background-color` - Background color
- `color` - Text color
- `border-color` - Border color
- `box-shadow` - Shadow effects

## After Making Changes

1. **Save the CSS file**
2. **Rebuild the frontend**:
   ```bash
   cd frontend
   npm run build
   ```
3. **Refresh the browser** to see your changes

## Technical Details

- **Wrapper Class**: `.product-form-stainedGlass` or `.product-form-woodwork`
- **Scope**: All CSS rules are scoped to prevent conflicts
- **Location**: Admin Dashboard (`frontend/src/pages/admin/AdminDashboard.jsx`)
- **Mobile-First**: Both forms use responsive breakpoints (320px, 375px, 480px, 768px)

## File References

### Components
- **Admin Dashboard**: `frontend/src/pages/admin/AdminDashboard.jsx`
- **Forms README**: `frontend/src/components/forms/README.md`

### Styles
- **Stained Glass CSS**: `frontend/src/styles/forms/stainedglass_form.css`
- **Woodwork CSS**: `frontend/src/styles/forms/woodwork_form.css`
- **Base Dashboard CSS**: `frontend/src/styles/AdminDashboard.css`

## Benefits

✅ **Independent Customization** - Style each form without affecting the other  
✅ **Visual Differentiation** - Color themes help identify product types  
✅ **No CSS Conflicts** - Scoped class names ensure isolation  
✅ **Easy Maintenance** - All styles for one form in one file  
✅ **Mobile-First** - Responsive design across all breakpoints  

## Need Help?

If you need to add more customizations or change behavior (not just styling), refer to:
- `frontend/src/pages/admin/AdminDashboard.jsx` - Form logic and structure
- `frontend/src/components/forms/README.md` - Forms documentation

