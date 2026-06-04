# Public Review Links for QR Codes

**Last Updated:** 2026-06-04


## Overview
Customers can now leave reviews without needing a review code or sign-in. Perfect for QR codes on thank you cards!

## Base URL
```
https://yourdomain.com/#/public-review
```

## Query Parameters

### `product` (optional)
Specifies the product type customers are reviewing. Defaults to "stainedglass".

**Allowed values:**
- `stainedglass` - For stained glass products (default)
- `woodwork` - For woodwork products
- `other` - For other products

## Example URLs

### Standard Stained Glass Review Link
```
https://yourdomain.com/#/public-review
```
or explicitly:
```
https://yourdomain.com/#/public-review?product=stainedglass
```

### Woodwork Review Link
```
https://yourdomain.com/#/public-review?product=woodwork
```

### Other Products Review Link
```
https://yourdomain.com/#/public-review?product=other
```

## How to Create QR Codes

1. **Using a QR Code Generator:**
   - Go to [qr-code-generator.com](https://www.qr-code-generator.com/) or similar service
   - Paste your review URL in the input field
   - Download or print the generated QR code
   - Add to your thank you cards

2. **Recommended Settings:**
   - Error Correction Level: Medium (M) or High (H) - provides better scannability
   - Size: Print at least 1" x 1" for reliable scanning
   - Color: Black on white works best

## What Customers See

When customers scan the QR code or visit the URL, they'll see a clean review form where they can:
- Enter their name
- Rate your product (1-5 stars)
- Write a review title (optional)
- Write their review comment
- Select their purchase date
- Specify where they purchased
- Optionally upload a photo

All reviews go into your admin panel pending approval before appearing on your site.

## Customization Ideas

### Thank You Card Suggestions:
- "Help us improve! Scan to leave your review"
- "Share your feedback with us - QR code inside"
- "We'd love to hear from you! [QR code]"

### Tips:
- Include the URL text below the QR code as a backup
- Test your QR codes with multiple phones before printing
- Consider adding a small incentive text like "Your feedback helps us serve you better!"

## For Development/Testing

Local testing URL:
```
http://localhost:5173/#/public-review?product=stainedglass
```

## Backend Endpoint

The public review endpoint is:
```
POST /reviews/submit-public
```

This endpoint accepts FormData with the following fields:
- `name` - Customer name (required)
- `rating` - Rating 1-5 (required)
- `title` - Review title (optional)
- `body` - Review comment (required)
- `purchased_at` - Purchase date (required)
- `purchase_source` - Where purchased (required)
- `purchase_source_other` - Custom purchase source if "other" selected
- `product_type` - Type of product (required)
- `photo` - Review photo (optional)

No authentication is required for this endpoint.
