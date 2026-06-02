import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { jsPDF } from "jspdf";
// import AddEtsyListingForm from "../../components/forms/AddEtsyListingForm";
import {
  createAdminTemplate,
  deleteAdminDigitalCheckoutSession,
  deleteAdminReview,
  deleteCustomer,
  fetchAdminReviews,
  fetchAdminReviewInviteCodes,
  createAdminReview,
  getAdminGalleryPhotos,
  getTemplate,
  fetchCustomers,
  getCustomerDetails,
  publishManualProductToFacebook,
  downloadAdminManualProductPattern,
  getTemplates,
  sendTemplateToCustomerWorkOrder,
  uploadAdminTemplateImage,
  uploadProductImage,
  updateAdminReview,
  createAdminReviewInviteCode,
  createAdminDiscountCode,
  deleteAdminReviewInviteCode,
  fetchAdminHomepageInsights,
  fetchAdminDiscountCodes,
  fetchAdminDigitalCheckoutSessions,
  fetchManualProduct,
  recoverAdminCheckoutSession,
  resendAdminCheckoutDownloadEmail,
  submitGalleryPhoto,
  updateAdminGalleryPhoto,
  updateAdminTemplate,
  updateCustomer,
} from "../../services/api.js";
import TemplateManagement from "./TemplateManagement";
import GlassTypeManagement from "./GlassTypeManagement";
import WorkOrderDashboard from "./WorkOrderDashboard";
import GalleryManagement from "./GalleryManagement";
import Pagination from "../../components/Pagination";
import { getProductDimensionsLabel } from "../../utils/productDimensions";
import "./styles/AdminDashboard.css";
import "./styles/forms/stainedglass_form.css";
import "./styles/forms/woodwork_form.css";

const toSearchableText = (value) => {
  if (Array.isArray(value)) {
    return value
      .map((entry) => String(entry ?? ""))
      .join(" ")
      .toLowerCase();
  }
  if (value === null || value === undefined) {
    return "";
  }
  return String(value).toLowerCase();
};

const toDisplayList = (value) => {
  if (Array.isArray(value)) {
    return value
      .map((entry) => String(entry ?? ""))
      .filter(Boolean)
      .join(", ");
  }
  if (value === null || value === undefined) {
    return "";
  }
  return String(value);
};

const formatListingPriceLabel = (product) => {
  const amount = Number(product?.price || 0);
  const formattedAmount = Number.isFinite(amount) ? amount.toFixed(2) : "0.00";
  return `${product?.is_digital_download ? "Digital Price" : "Price"}: $${formattedAmount}`;
};

const normalizeCategory = (value) => String(value || "").trim().toLowerCase();

const isDirectMessageTemplate = (template) =>
  normalizeCategory(template?.category) === "direct message";

const canUseTemplateForCustomer = (template, customerId) => {
  if (!isDirectMessageTemplate(template)) return true;
  return Number(template?.assigned_customer_id || 0) === Number(customerId || 0);
};

const formatInsightCount = (value) => Number(value || 0).toLocaleString();

const trendDirectionSymbol = (direction) => {
  if (direction === "up") return "▲";
  if (direction === "down") return "▼";
  return "•";
};

const CUSTOMER_LIST_TABS = [
  { key: "signed-up", label: "Sign Up Customers" },
  { key: "review-customer", label: "Review Customers" },
  { key: "admin-testimonial", label: "Admin Testimonials" },
];

const MANUAL_PRODUCT_LIST_TABS = [
  { key: "all", label: "All Products" },
  { key: "manual", label: "Manual Products" },
  { key: "featured", label: "★ Featured Products" },
  { key: "home-carousel", label: "🏠 Home Carousel Products" },
];

const deriveCustomerCategory = (customer) => {
  const apiCategory = String(customer?.customer_category || "").trim().toLowerCase();
  if (apiCategory) return apiCategory;

  const email = String(customer?.email || "").trim().toLowerCase();
  if (email.startsWith("admin-testimonial-") && email.endsWith("@sgcg.local")) {
    return "admin-testimonial";
  }
  if (email.startsWith("guest-review-") && email.endsWith("@sgcg.local")) {
    return "review-customer";
  }
  return "signed-up";
};

const getApiOrigin = () => {
  const configuredBase = String(import.meta.env.VITE_API_BASE_URL || "/api").trim();
  if (/^https?:\/\//i.test(configuredBase)) {
    return configuredBase.replace(/\/api\/?$/, "");
  }

  const hostname = String(window.location?.hostname || "").toLowerCase();
  if (hostname === "sgcgart.com" || hostname === "www.sgcgart.com") {
    return "https://sgcgartglass.onrender.com";
  }

  return window.location.origin;
};

const resolveMediaUrl = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^javascript:/i.test(raw)) return "";
  if (raw.startsWith("data:") || raw.startsWith("blob:")) return raw;
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;

  // Support serialized payloads from older records (e.g. JSON arrays/objects).
  if (
    (raw.startsWith("[") && raw.endsWith("]")) ||
    (raw.startsWith("{") && raw.endsWith("}"))
  ) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return resolveMediaUrl(parsed[0]?.image_url || parsed[0]?.url || parsed[0]?.src || parsed[0]);
      }
      if (parsed && typeof parsed === "object") {
        return resolveMediaUrl(parsed.image_url || parsed.url || parsed.src);
      }
    } catch {
      // Keep using the raw value below if JSON parsing fails.
    }
  }

  if (raw.startsWith("/")) return `${getApiOrigin()}${raw}`;
  return `${getApiOrigin()}/${raw.replace(/^\.?\//, "")}`;
};

const parseDateInput = (dateString) => {
  if (!dateString || typeof dateString !== "string") return "";
  
  const trimmed = dateString.trim();
  if (!trimmed) return "";
  
  // Just a year: YYYY
  if (/^\d{4}$/.test(trimmed)) {
    return `${trimmed}-01-01`;
  }

  // MM/YYYY or M/YYYY
  const monthYearSlash = trimmed.match(/^(\d{1,2})\/(\d{4})$/);
  if (monthYearSlash) {
    const month = String(monthYearSlash[1]).padStart(2, "0");
    const year = monthYearSlash[2];
    return `${year}-${month}-01`;
  }

  // YYYY-MM (no day)
  if (/^\d{4}-\d{2}$/.test(trimmed)) {
    return `${trimmed}-01`;
  }

  // Already in ISO format (YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  
  // MM/DD/YYYY or M/D/YYYY
  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const month = String(slashMatch[1]).padStart(2, "0");
    const day = String(slashMatch[2]).padStart(2, "0");
    const year = slashMatch[3];
    return `${year}-${month}-${day}`;
  }
  
  // DD-MM-YYYY or D-M-YYYY
  const dashMatch = trimmed.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dashMatch) {
    const day = String(dashMatch[1]).padStart(2, "0");
    const month = String(dashMatch[2]).padStart(2, "0");
    const year = dashMatch[3];
    return `${year}-${month}-${day}`;
  }
  
  // Try to parse as natural date
  try {
    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) {
      const year = parsed.getFullYear();
      const month = String(parsed.getMonth() + 1).padStart(2, "0");
      const day = String(parsed.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    }
  } catch {
    // If parsing fails, return empty string
  }
  
  return "";
};

const getClipboardImageFile = (event) => {
  const items = event?.clipboardData?.items;
  if (!items) return null;
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (item.kind === "file" && item.type.startsWith("image/")) {
      const file = item.getAsFile();
      if (file) return file;
    }
  }
  return null;
};

const downloadBlobFile = (blob, fileName) => {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
};

const sanitizeDownloadBaseName = (value, fallback = "download") => {
  const blocked = new Set(["<", ">", ":", '"', "/", "\\", "|", "?", "*"]);
  const normalized = Array.from(String(value || "").trim())
    .map((char) => {
      const code = char.charCodeAt(0);
      if (blocked.has(char) || code <= 31) return "-";
      return char;
    })
    .join("")
    .replace(/\s+/g, " ");
  return normalized || fallback;
};

const extensionFromUrl = (value) => {
  try {
    const target = new URL(String(value || ""), window.location.origin);
    const cleanPath = target.pathname || "";
    const match = cleanPath.match(/(\.[a-z0-9]+)$/i);
    return match ? match[1].toLowerCase() : "";
  } catch {
    return "";
  }
};

const sortFavoriteValues = (values) =>
  [...values]
    .filter((value) => String(value || "").trim().length > 0)
    .sort((left, right) =>
      String(left || "").localeCompare(String(right || ""), undefined, {
        sensitivity: "base",
        numeric: true,
      }),
    );

const PRODUCT_UPLOAD_IMAGE_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".jpe",
  ".png",
  ".gif",
  ".webp",
  ".svg",
  ".bmp",
  ".heic",
  ".heif",
  ".avif",
]);

const PRODUCT_UPLOAD_VIDEO_EXTENSIONS = new Set([
  ".mp4",
  ".m4v",
  ".mov",
  ".webm",
  ".avi",
  ".mkv",
  ".mpeg",
  ".mpg",
  ".ogv",
  ".wmv",
]);

const extensionFromFileName = (fileName) => {
  const normalized = String(fileName || "").trim().toLowerCase();
  const lastDot = normalized.lastIndexOf(".");
  return lastDot >= 0 ? normalized.slice(lastDot) : "";
};

const isVideoFile = (file) => {
  const normalizedType = String(file?.type || "").toLowerCase();
  if (normalizedType.startsWith("video/")) return true;
  return PRODUCT_UPLOAD_VIDEO_EXTENSIONS.has(extensionFromFileName(file?.name));
};

const isImageFile = (file) => {
  const normalizedType = String(file?.type || "").toLowerCase();
  if (normalizedType.startsWith("image/")) return true;
  return PRODUCT_UPLOAD_IMAGE_EXTENSIONS.has(extensionFromFileName(file?.name));
};

const isSupportedProductUploadFile = (file) => isImageFile(file) || isVideoFile(file);

const extensionFromMimeType = (mimeType) => {
  const normalized = String(mimeType || "").toLowerCase();
  if (normalized.includes("svg")) return ".svg";
  if (normalized.includes("png")) return ".png";
  if (normalized.includes("webp")) return ".webp";
  if (normalized.includes("gif")) return ".gif";
  if (normalized.includes("jpeg") || normalized.includes("jpg")) return ".jpg";
  if (normalized.includes("pdf")) return ".pdf";
  if (normalized.startsWith("video/")) return ".mp4";
  return "";
};

const mimeTypeFromExtension = (extension, fallbackMediaType = "") => {
  const normalizedExtension = String(extension || "").toLowerCase();
  if (normalizedExtension === ".png") return "image/png";
  if (normalizedExtension === ".webp") return "image/webp";
  if (normalizedExtension === ".gif") return "image/gif";
  if (normalizedExtension === ".svg") return "image/svg+xml";
  if (normalizedExtension === ".jpg" || normalizedExtension === ".jpeg" || normalizedExtension === ".jpe") return "image/jpeg";
  if (normalizedExtension === ".mp4") return "video/mp4";
  if (normalizedExtension === ".mov") return "video/quicktime";
  if (normalizedExtension === ".webm") return "video/webm";

  const normalizedMediaType = String(fallbackMediaType || "").trim().toLowerCase();
  if (normalizedMediaType.startsWith("image/") || normalizedMediaType.startsWith("video/")) {
    return normalizedMediaType;
  }

  if (normalizedMediaType === "video") return "video/mp4";
  return "image/jpeg";
};

const hexStringToBytes = (value) => {
  const hexStr = String(value || "").trim();
  if (!hexStr) return null;
  if (hexStr.length % 2 !== 0) return null;
  const bytes = new Uint8Array(hexStr.length / 2);
  for (let i = 0; i < hexStr.length; i += 2) {
    bytes[i / 2] = parseInt(hexStr.substr(i, 2), 16);
  }
  return bytes;
};

const normalizeBase64String = (value) => {
  const cleaned = String(value || "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  if (!cleaned || /[^A-Za-z0-9+/=]/.test(cleaned)) return "";

  const paddedLength = Math.ceil(cleaned.length / 4) * 4;
  return cleaned.padEnd(paddedLength, "=");
};

const imageDataToBytes = (value) => {
  const rawValue = String(value || "").trim();
  if (!rawValue) return null;

  if (/^[0-9a-f]+$/i.test(rawValue) && rawValue.length % 2 === 0) {
    return hexStringToBytes(rawValue);
  }

  const base64 = normalizeBase64String(rawValue);
  if (!base64) return null;

  try {
    const binary = window.atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  } catch {
    return null;
  }
};

const bytesToBase64 = (bytes) => {
  if (!bytes || bytes.length === 0) return "";
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return window.btoa(binary);
};

const imageDataToDataUrl = (imageObj) => {
  if (!imageObj?.image_data || typeof imageObj.image_data !== "string") {
    return "";
  }

  if (imageObj.image_data.startsWith("data:")) {
    return imageObj.image_data.replace(/\s+/g, "");
  }

  try {
    const bytes = imageDataToBytes(imageObj.image_data);
    if (!bytes || bytes.length === 0) return "";
    const mediaType = mimeTypeFromExtension(
      extensionFromUrl(imageObj.image_url || ""),
      imageObj.media_type,
    );
    const base64 = bytesToBase64(bytes);
    return base64 ? `data:${mediaType};base64,${base64}` : "";
  } catch (error) {
    console.warn("Failed to convert image_data into data URL:", error);
    return "";
  }
};

const createGalleryUploadFileFromImage = async (imageObj, fallbackBaseName = "gallery-image") => {
  if (!imageObj || typeof imageObj !== "object") return null;

  const sourceUrl = resolveMediaUrl(imageObj.image_url || "");
  const extension = extensionFromUrl(sourceUrl) || extensionFromMimeType(imageObj.media_type) || ".jpg";
  const mimeType = mimeTypeFromExtension(extension, imageObj.media_type);
  const safeBaseName = sanitizeDownloadBaseName(fallbackBaseName, "gallery-image");

  if (imageObj.image_data && typeof imageObj.image_data === "string") {
    try {
      const bytes = imageDataToBytes(imageObj.image_data);
      if (bytes && bytes.length > 0) {
        return new File([bytes], `${safeBaseName}${extension}`, { type: mimeType });
      }
    } catch (error) {
      console.warn("Failed to convert existing product image_data into an upload file:", error);
    }
  }

  if (!sourceUrl) return null;

  try {
    const response = await fetch(sourceUrl);
    if (!response.ok) {
      throw new Error(`Failed to read existing image (${response.status})`);
    }
    const blob = await response.blob();
    const blobExtension = extensionFromMimeType(blob.type) || extension;
    const blobMimeType = blob.type || mimeType;
    return new File([blob], `${safeBaseName}${blobExtension}`, { type: blobMimeType });
  } catch (error) {
    console.warn("Failed to fetch existing product image for gallery upload:", error);
    return null;
  }
};

/**
 * Convert an image object (with optional image_data hex field) to a displayable URL.
 * Prefers image_data blob URL over image_url if image_data is available.
 */
const resolveImageObjectToUrl = (imageObj) => {
  if (!imageObj || typeof imageObj !== "object") {
    return resolveMediaUrl(String(imageObj || ""));
  }

  const dataUrl = imageDataToDataUrl(imageObj);
  if (dataUrl) return dataUrl;

  // Fallback to image_url
  return resolveMediaUrl(imageObj.image_url || "");
};

const getProductThumbnailCandidates = (images) => {
  const seen = new Set();
  return ensureArray(images)
    .filter((entry) => entry?.media_type !== "video")
    .map((entry) => resolveImageObjectToUrl(entry))
    .filter((entry) => {
      const value = String(entry || "").trim();
      if (!value || seen.has(value)) return false;
      seen.add(value);
      return true;
    });
};

const isPatternProductRecord = (product) =>
  ensureArray(product?.category)
    .map((entry) => String(entry || "").toLowerCase().replace(/[^a-z0-9]/g, ""))
    .some((entry) => entry === "pattern" || entry === "patterns");

const imageNeedsLinkedTemplateFallback = (imageObj) => {
  if (!imageObj || typeof imageObj !== "object") return true;
  if (imageObj.image_data) return false;
  const imageUrl = String(imageObj.image_url || "").trim();
  if (!imageUrl) return true;
  return imageUrl.startsWith("/uploads/templates/") || imageUrl.startsWith("uploads/templates/");
};

const getProductDisplayThumbnailCandidates = (product, linkedTemplatePreviewUrl = "") => {
  const baseCandidates = getProductThumbnailCandidates(product?.images);
  if (!linkedTemplatePreviewUrl || !isPatternProductRecord(product)) {
    return baseCandidates;
  }

  const firstImage = ensureArray(product?.images)[0] || null;
  if (firstImage && !imageNeedsLinkedTemplateFallback(firstImage)) {
    return baseCandidates;
  }

  const seen = new Set();
  return [linkedTemplatePreviewUrl, ...baseCandidates].filter((entry) => {
    const value = String(entry || "").trim();
    if (!value || seen.has(value)) return false;
    seen.add(value);
    return true;
  });
};

const normalizeStoredProductImage = (entry) => {
  const imageUrl = String(entry?.image_url || entry?.url || "").trim();
  if (!imageUrl) return null;
  return {
    image_url: imageUrl,
    media_type: String(entry?.media_type || entry?.type || "image").toLowerCase() === "video" ? "video" : "image",
    ...(entry?.image_data ? { image_data: entry.image_data } : {}),
  };
};

const mergeUniqueProductImages = (entries) => {
  const seen = new Set();
  return (entries || []).reduce((acc, entry) => {
    const normalized = normalizeStoredProductImage(entry);
    if (!normalized) return acc;

    const key = `${normalized.media_type}:${normalized.image_url}`;
    if (seen.has(key)) return acc;
    seen.add(key);
    acc.push(normalized);
    return acc;
  }, []);
};

const FACEBOOK_POSTED_STORAGE_KEY = "adminFbPostedManualProducts";
const STAR_SCALE = [1, 2, 3, 4, 5];
const buildReviewSnapshot = (review) => ({
  rating: Number(review?.rating || 0),
  title: String(review?.title || ""),
  body: String(review?.body || ""),
  admin_comment: String(review?.admin_comment || ""),
  status: String(review?.status || "pending"),
});
const MAX_MANUAL_UPLOAD_PHOTOS = 10;
const MAX_MANUAL_UPLOAD_VIDEOS = 1;
const MAX_MANUAL_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_MANUAL_VIDEO_BYTES = 80 * 1024 * 1024;
const MAX_MANUAL_TOTAL_BYTES = 120 * 1024 * 1024;
const MAX_TEMPLATE_UPLOAD_BYTES = 50 * 1024 * 1024;
const MAX_GALLERY_UPLOAD_BYTES = 20 * 1024 * 1024;
const TEMPLATE_DIFFICULTY_OPTIONS = ["Beginner", "Intermediate", "Advanced"];
const MANUAL_PRODUCTS_PER_PAGE = 10;
const SECTION_PAGE_SIZE = 10;
const MAX_HOME_FEATURED_PRODUCTS = 20;
const ADMIN_ACTIVITY_POPUP_DELAY_MS = 450;
const PRODUCT_TYPE_CONFIG = [
  { key: "stainedGlassPanels", label: "Stained Glass Panels", theme: "stainedGlass" },
  { key: "fusedArt", label: "Fused Art", theme: "stainedGlass" },
  { key: "laserAndSandblasting", label: "Laser and Sandblasting", theme: "stainedGlass" },
  { key: "woodArt", label: "Wood Art", theme: "woodwork" },
];
const STYLE_FILTER_OPTIONS = [
  "Transom",
  "Contemporary",
  "Modern",
  "Victorian",
  "Geometric",
  "Animals / Landscape",
];
const SHAPE_FILTER_OPTIONS = ["Rectangular", "Square", "Oval", "Circle", "Other"];
const COLOR_FILTER_OPTIONS = ["Blue", "Green", "Red", "Amber", "Clear", "Multicolor"];

const normalizeCategoryTagValue = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const categoryTagExists = (categories = [], target) => {
  const normalizedTarget = normalizeCategoryTagValue(target);
  if (!normalizedTarget) return false;
  return categories.some((entry) => normalizeCategoryTagValue(entry) === normalizedTarget);
};

const PRODUCT_TYPE_LABEL_BY_KEY = PRODUCT_TYPE_CONFIG.reduce(
  (acc, entry) => ({ ...acc, [entry.key]: entry.label }),
  {},
);
const CATEGORY_TYPE_ALIASES = {
  stainedglasspanels: "stainedGlassPanels",
  stainedglass: "stainedGlassPanels",
  glass: "stainedGlassPanels",
  fusedart: "fusedArt",
  laserandsandblasting: "laserAndSandblasting",
  laser: "laserAndSandblasting",
  sandblast: "laserAndSandblasting",
  sandblasting: "laserAndSandblasting",
  woodart: "woodArt",
  woodwork: "woodArt",
  woodworking: "woodArt",
  wood: "woodArt",
  pattern: "patterns",
  patterns: "patterns",
};

const RELATED_LINK_MANUAL_OVERRIDE_FIELDS = [
  "template_id",
  "pattern_product_id",
  "linked_product_id",
  "gallery_photo_id",
];

const createDefaultRelatedLinkManualOverrides = () => ({
  template_id: false,
  pattern_product_id: false,
  linked_product_id: false,
  gallery_photo_id: false,
});

const normalizeRelatedLinkManualOverrides = (value) => {
  const incoming = value && typeof value === "object" ? value : {};
  return RELATED_LINK_MANUAL_OVERRIDE_FIELDS.reduce((acc, field) => ({
    ...acc,
    [field]: Boolean(incoming[field]),
  }), createDefaultRelatedLinkManualOverrides());
};

const createDefaultRelatedLinks = () => ({
  template_id: "",
  template_name: "",
  pattern_product_id: "",
  pattern_product_name: "",
  linked_product_id: "",
  linked_product_name: "",
  gallery_photo_id: "",
  gallery_panel_name: "",
  gallery_template_id: "",
  manual_overrides: createDefaultRelatedLinkManualOverrides(),
});

const normalizeRelatedLinksState = (value) => {
  const incoming = value && typeof value === "object" ? value : {};
  return {
    ...createDefaultRelatedLinks(),
    ...incoming,
    manual_overrides: normalizeRelatedLinkManualOverrides(incoming.manual_overrides),
  };
};

const normalizeLinkSearchName = (value) => String(value || "")
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

const buildUniqueNameCandidates = (values) => {
  const seen = new Set();
  return values.filter((entry) => {
    const normalized = normalizeLinkSearchName(entry);
    if (!normalized || seen.has(normalized)) {
      return false;
    }
    seen.add(normalized);
    return true;
  });
};

const findOptionByMatchingName = ({ options, candidateNames, getName, excludeIds = [] }) => {
  const normalizedCandidates = new Set(
    candidateNames.map((entry) => normalizeLinkSearchName(entry)).filter(Boolean),
  );
  if (normalizedCandidates.size === 0) return null;

  const excluded = new Set(excludeIds.map((entry) => String(entry || "").trim()).filter(Boolean));
  return options.find((entry) => {
    const entryId = String(entry?.id || "").trim();
    if (entryId && excluded.has(entryId)) return false;
    const entryName = normalizeLinkSearchName(getName(entry));
    return Boolean(entryName) && normalizedCandidates.has(entryName);
  }) || null;
};

const applyRelatedLinkSelection = (relatedLinks, fieldName, selection, options = {}) => {
  const nextLinks = normalizeRelatedLinksState(relatedLinks);
  const nextOverrides = {
    ...normalizeRelatedLinkManualOverrides(nextLinks.manual_overrides),
  };
  if (options.markManual) {
    nextOverrides[fieldName] = true;
  }

  switch (fieldName) {
    case "template_id":
      nextLinks.template_id = String(selection?.id || "").trim();
      nextLinks.template_name = String(selection?.name || "").trim();
      break;
    case "pattern_product_id":
      nextLinks.pattern_product_id = String(selection?.id || "").trim();
      nextLinks.pattern_product_name = String(selection?.name || "").trim();
      break;
    case "linked_product_id":
      nextLinks.linked_product_id = String(selection?.id || "").trim();
      nextLinks.linked_product_name = String(selection?.name || "").trim();
      break;
    case "gallery_photo_id":
      nextLinks.gallery_photo_id = String(selection?.id || "").trim();
      nextLinks.gallery_panel_name = String(selection?.name || "").trim();
      nextLinks.gallery_template_id = String(selection?.template_id || "").trim();
      break;
    default:
      break;
  }

  nextLinks.manual_overrides = nextOverrides;
  return nextLinks;
};

const PHYSICAL_DEFAULT_QUANTITY = "1";
const DIGITAL_DEFAULT_QUANTITY = "9999";

const getDefaultQuantityByDigitalFlag = (isDigitalDownload) =>
  isDigitalDownload ? DIGITAL_DEFAULT_QUANTITY : PHYSICAL_DEFAULT_QUANTITY;

const normalizeQuantityInput = (value, isDigitalDownload) => {
  const parsed = parseInt(String(value ?? "").trim(), 10);
  if (Number.isFinite(parsed) && parsed >= 0) {
    return parsed;
  }
  return parseInt(getDefaultQuantityByDigitalFlag(isDigitalDownload), 10);
};

const syncQuantityWithDownloadMode = (currentQuantity, isDigitalDownload) => {
  const normalized = String(currentQuantity ?? "").trim();
  if (!normalized) {
    return getDefaultQuantityByDigitalFlag(isDigitalDownload);
  }
  if (isDigitalDownload && normalized === PHYSICAL_DEFAULT_QUANTITY) {
    return DIGITAL_DEFAULT_QUANTITY;
  }
  if (!isDigitalDownload && normalized === DIGITAL_DEFAULT_QUANTITY) {
    return PHYSICAL_DEFAULT_QUANTITY;
  }
  return normalized;
};

const resolveAutoQuantityForMode = (
  currentQuantity,
  isDigitalDownload,
  quantityManuallyEdited,
) => {
  const normalized = String(currentQuantity ?? "").trim();
  if (!normalized) {
    return getDefaultQuantityByDigitalFlag(isDigitalDownload);
  }
  if (quantityManuallyEdited) {
    return normalized;
  }
  return syncQuantityWithDownloadMode(normalized, isDigitalDownload);
};

const parseManualDimensionValue = (label, value) => {
  const rawValue = String(value ?? "").trim();
  if (!rawValue) {
    return { value: null, error: null };
  }

  const normalizedValue = rawValue
    .replace(/[“”″]/g, '"')
    .replace(/\s+/g, " ")
    .replace(/^([+]?\d+)-(\d+\s*\/\s*\d+)$/, "$1 $2")
    .replace(/\s*(?:inches?|inch|in\.?|["])?\s*$/i, "")
    .trim();

  if (!normalizedValue) {
    return {
      value: null,
      error: `${label} must be a number like 25.25 or a fraction like 48 3/8.`,
    };
  }

  const decimalMatch = normalizedValue.match(/^[+]?(?:\d+(?:\.\d+)?|\.\d+)$/);
  if (decimalMatch) {
    const parsedValue = Number(normalizedValue);
    if (Number.isFinite(parsedValue) && parsedValue >= 0) {
      return { value: parsedValue, error: null };
    }
  }

  const mixedFractionMatch = normalizedValue.match(/^([+]?\d+)\s+(\d+)\s*\/\s*(\d+)$/);
  if (mixedFractionMatch) {
    const whole = Number(mixedFractionMatch[1]);
    const numerator = Number(mixedFractionMatch[2]);
    const denominator = Number(mixedFractionMatch[3]);
    if (denominator > 0) {
      return { value: whole + (numerator / denominator), error: null };
    }
  }

  const fractionMatch = normalizedValue.match(/^([+]?\d+)\s*\/\s*(\d+)$/);
  if (fractionMatch) {
    const numerator = Number(fractionMatch[1]);
    const denominator = Number(fractionMatch[2]);
    if (denominator > 0) {
      return { value: numerator / denominator, error: null };
    }
  }

  return {
    value: null,
    error: `${label} must be a number like 25.25 or a fraction like 48 3/8.`,
  };
};

const normalizeManualProductDimensions = (product) => {
  const fields = [
    ["width", "Width"],
    ["height", "Height"],
    ["depth", "Depth"],
  ];

  const normalized = {};
  for (const [fieldName, label] of fields) {
    const result = parseManualDimensionValue(label, product?.[fieldName]);
    if (result.error) {
      return { normalized: null, error: result.error };
    }
    normalized[fieldName] = result.value;
  }

  return { normalized, error: null };
};

const createEmptyManualProduct = () => ({
  name: "",
  images: [],
  description: "",
  category: [],
  materials: [],
  width: "",
  height: "",
  depth: "",
  price: "",
  discount_percent: "",
  quantity: PHYSICAL_DEFAULT_QUANTITY,
  is_featured: false,
  is_home_featured: false,
  is_digital_download: false,
  related_links: createDefaultRelatedLinks(),
});

const createEmptyUnifiedTemplate = () => ({
  name: "",
  category: "",
  difficulty: TEMPLATE_DIFFICULTY_OPTIONS[0],
  dimensions: "",
  is_digital_download: false,
  price_amount: "",
  upload_file: null,
  existing_upload_preview: null,
  related_links: createDefaultRelatedLinks(),
});

const createEmptyRelatedTemplateUpload = () => ({
  file: null,
  name: "",
  category: "Patterns",
});

const createEmptyRelatedGalleryUpload = () => ({
  file: null,
  panel_name: "",
  description: "",
  category: "",
  template_id: "",
});

const getNameFromFile = (file) => String(file?.name || "").replace(/\.[^.]+$/, "").trim();

const readStoredJson = (key, fallback) => {
  try {
    const rawValue = localStorage.getItem(key);
    if (!rawValue) return fallback;
    return JSON.parse(rawValue);
  } catch {
    return fallback;
  }
};

const ensureArray = (value) => (Array.isArray(value) ? value : []);

const normalizeManualProductRecord = (value) => {
  if (!value || typeof value !== "object") {
    return null;
  }

  return {
    ...value,
    images: ensureArray(value.images).filter(Boolean),
    category: Array.isArray(value.category)
      ? value.category.filter(Boolean)
      : value.category
        ? [value.category]
        : [],
    materials: Array.isArray(value.materials)
      ? value.materials.filter(Boolean)
      : value.materials
        ? [value.materials]
        : [],
    related_links: normalizeRelatedLinksState(value.related_links),
    is_active: value.is_active !== 0 && value.is_active !== false,
    is_home_featured: value.is_home_featured === 1 || value.is_home_featured === true,
  };
};

const sortManualProductsNewestFirst = (products) => {
  const parseDateValue = (value) => {
    if (!value) return 0;
    const parsed = Date.parse(String(value));
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const getRecencyValue = (product) => {
    const byDate = Math.max(
      parseDateValue(product?.created_at),
      parseDateValue(product?.createdAt),
      parseDateValue(product?.uploaded_at),
      parseDateValue(product?.upload_date),
      parseDateValue(product?.updated_at),
      parseDateValue(product?.updatedAt),
    );
    if (byDate > 0) return byDate;
    return Number(product?.id || 0);
  };

  return [...products].sort((left, right) => {
    const recencyDiff = getRecencyValue(right) - getRecencyValue(left);
    if (recencyDiff !== 0) {
      return recencyDiff;
    }

    return Number(right?.id || 0) - Number(left?.id || 0);
  });
};

let pdfjsLibLoader;
const getPdfjsLib = async () => {
  if (!pdfjsLibLoader) {
    pdfjsLibLoader = import("pdfjs-dist").then((module) => module.default || module);
  }
  return pdfjsLibLoader;
};

const pdfToPngFile = async (file) => {
  const pdfjsLib = await getPdfjsLib();
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
  const arrayBuffer = await file.arrayBuffer();

  let pdf;
  try {
    pdf = await pdfjsLib.getDocument({ data: arrayBuffer, disableWorker: true }).promise;
  } catch (error) {
    console.warn("[AdminDashboard] PDF worker setup failed, retrying without worker...", error);
    pdfjsLib.GlobalWorkerOptions.workerSrc = "";
    pdf = await pdfjsLib.getDocument({ data: arrayBuffer, disableWorker: true }).promise;
  }

  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 4 });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const context = canvas.getContext("2d");
  await page.render({ canvasContext: context, viewport }).promise;

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((result) => {
      if (result) {
        resolve(result);
      } else {
        reject(new Error("Failed to render PDF preview image."));
      }
    }, "image/png");
  });

  const fileName = String(file?.name || "template.pdf").replace(/\.[^.]+$/, "");
  return new File([blob], `${fileName}.png`, { type: "image/png" });
};

export default function AdminDashboard({
  manualProducts = [],
  onRefreshCatalog,
  onAddManualProduct,
  onUpdateManualProduct,
  onDeleteManualProduct,
  onLogout,
}) {
  const createEmptyTypeBuckets = () =>
    PRODUCT_TYPE_CONFIG.reduce(
      (acc, entry) => ({ ...acc, [entry.key]: [] }),
      {},
    );

  const normalizedManualProducts = useMemo(
    () => ensureArray(manualProducts).map(normalizeManualProductRecord).filter(Boolean),
    [manualProducts],
  );

  const [activeTab, setActiveTab] = useState("products");
  const [customers, setCustomers] = useState([]);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [customerForm, setCustomerForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    admin_notes: "",
    address: {
      label: "Primary",
      line1: "",
      line2: "",
      city: "",
      state: "",
      postal_code: "",
      country: "",
    },
  });
  const [customerStatus, setCustomerStatus] = useState("");
  const [customerListTab, setCustomerListTab] = useState("signed-up");
  const [customerSearch, setCustomerSearch] = useState("");
  const [isSavingCustomer, setIsSavingCustomer] = useState(false);
  const [isDeletingCustomer, setIsDeletingCustomer] = useState(false);
  const [sendTemplateForm, setSendTemplateForm] = useState({
    template_id: "",
    message: "",
    project_name: "",
    uploaded_file: null,
    new_template_name: "",
    new_template_category: "",
  });
  const [sendTemplateStatus, setSendTemplateStatus] = useState("");
  const [isSendingTemplate, setIsSendingTemplate] = useState(false);
  const [adminTemplateOptions, setAdminTemplateOptions] = useState([]);
  const [productTemplateOptions, setProductTemplateOptions] = useState([]);
  const [productGalleryOptions, setProductGalleryOptions] = useState([]);
  const [adminReviews, setAdminReviews] = useState([]);
  const [adminReviewSnapshots, setAdminReviewSnapshots] = useState({});
  const [adminReviewPhotoFiles, setAdminReviewPhotoFiles] = useState({});
  const [adminReviewPhotoDeletes, setAdminReviewPhotoDeletes] = useState({});
  const [expandedAdminReviewId, setExpandedAdminReviewId] = useState(null);
  const [adminReviewStatusFilter, setAdminReviewStatusFilter] = useState("all");
  const [adminReviewStatus, setAdminReviewStatus] = useState("");
  const [reviewInviteCodes, setReviewInviteCodes] = useState([]);
  const [reviewInviteStatus, setReviewInviteStatus] = useState("");
  const [lastGeneratedReviewCode, setLastGeneratedReviewCode] = useState("");
  const [digitalCheckoutSessions, setDigitalCheckoutSessions] = useState([]);
  const [digitalSessionEmailSearch, setDigitalSessionEmailSearch] = useState("");
  const [digitalSessionsPage, setDigitalSessionsPage] = useState(1);
  const [isLoadingDigitalSessions, setIsLoadingDigitalSessions] = useState(false);
  const [checkoutRecoveryStatus, setCheckoutRecoveryStatus] = useState("");
  const [activeRecoverySessionId, setActiveRecoverySessionId] = useState("");
  const [activeResendSessionId, setActiveResendSessionId] = useState("");
  const [activeDeleteRecoverySessionId, setActiveDeleteRecoverySessionId] = useState("");
  const [isSavingReview, setIsSavingReview] = useState(false);
  const [isDeletingReview, setIsDeletingReview] = useState(false);
  const [isGeneratingReviewCode, setIsGeneratingReviewCode] = useState(false);
  const [isDeletingReviewCode, setIsDeletingReviewCode] = useState(false);
  const [isRegeneratingReviewCode, setIsRegeneratingReviewCode] = useState(false);
  const [isOpeningCustomerModal, setIsOpeningCustomerModal] = useState(false);
  const [isOpeningProductEdit, setIsOpeningProductEdit] = useState(false);
  const [activeProductDeleteId, setActiveProductDeleteId] = useState("");
  const [activeProductToggleId, setActiveProductToggleId] = useState("");
  const [activeProductFeaturedId, setActiveProductFeaturedId] = useState("");
  const [activeProductHomeFeaturedId, setActiveProductHomeFeaturedId] = useState("");
  const [activeFacebookShareId, setActiveFacebookShareId] = useState("");
  const [customerInsight, setCustomerInsight] = useState({
    total_clicks: 0,
    clicks_today: 0,
    monthly_clicks: 0,
    daily_delta: 0,
    monthly_delta: 0,
    daily_trend: "flat",
    monthly_trend: "flat",
  });
  const [isLoadingCustomerInsight, setIsLoadingCustomerInsight] = useState(false);
  const [discountCodes, setDiscountCodes] = useState([]);
  const [discountCodeStatus, setDiscountCodeStatus] = useState("");
  const [isSavingDiscountCode, setIsSavingDiscountCode] = useState(false);
  const [discountCodeForm, setDiscountCodeForm] = useState({
    name: "",
    code: "",
    discount_percent: "10",
    limit_type: "uses",
    max_uses: "100",
    valid_days: "7",
  });
  const [reviewInviteForm, setReviewInviteForm] = useState({
    platform: "etsy",
    product_name: "",
    customer_email: "",
    note: "",
  });
  const [unlimitedReviewCodeName, setUnlimitedReviewCodeName] = useState("");
  const [adminReviewCreateStatus, setAdminReviewCreateStatus] = useState("");
  const [isCreatingAdminReview, setIsCreatingAdminReview] = useState(false);
  const [adminReviewCreateForm, setAdminReviewCreateForm] = useState({
    name: "",
    rating: 5,
    title: "",
    body: "",
    purchased_at: "",
    purchase_source: "etsy",
    purchase_source_other: "",
    status: "approved",
    photo: null,
  });

  const loadCustomerInsight = useCallback(async () => {
    setIsLoadingCustomerInsight(true);
    try {
      const res = await fetchAdminHomepageInsights();
      if (res && typeof res === "object") {
        setCustomerInsight((prev) => ({ ...prev, ...res }));
      }
    } catch {
      setCustomerInsight((prev) => ({ ...prev }));
    } finally {
      setIsLoadingCustomerInsight(false);
    }
  }, []);

  const loadDiscountCodes = useCallback(async () => {
    try {
      const rows = await fetchAdminDiscountCodes({ limit: 150 });
      setDiscountCodes(Array.isArray(rows) ? rows : []);
    } catch {
      setDiscountCodes([]);
    }
  }, []);

  const handleCreateDiscountCode = async (event) => {
    event.preventDefault();
    setDiscountCodeStatus("");
    setIsSavingDiscountCode(true);

    try {
      const payload = {
        name: String(discountCodeForm.name || "").trim(),
        code: String(discountCodeForm.code || "").trim().toUpperCase(),
        discount_percent: Number(discountCodeForm.discount_percent || 0),
        limit_type: discountCodeForm.limit_type,
        ...(discountCodeForm.limit_type === "uses"
          ? { max_uses: Number(discountCodeForm.max_uses || 0) }
          : { valid_days: Number(discountCodeForm.valid_days || 0) }),
      };

      const created = await createAdminDiscountCode(payload);
      setDiscountCodeStatus(`Created discount code ${created?.code || payload.code}.`);
      setDiscountCodeForm((prev) => ({ ...prev, code: "", name: "" }));
      await loadDiscountCodes();
    } catch (error) {
      setDiscountCodeStatus(
        error?.response?.data?.detail
        || error?.response?.data?.error
        || error?.message
        || "Failed to create discount code.",
      );
    } finally {
      setIsSavingDiscountCode(false);
    }
  };

  useEffect(() => {
    // Refresh once when admin dashboard mounts (sign-in or full page refresh).
    loadCustomerInsight();
    loadDiscountCodes();
  }, [loadCustomerInsight, loadDiscountCodes]);

  useEffect(() => {
    if (activeTab === "customers") {
      fetchCustomers()
        .then((res) => setCustomers(res))
        .catch(() => setCustomers([]));
      loadCustomerInsight();
      loadDiscountCodes();
    }
  }, [activeTab, loadCustomerInsight, loadDiscountCodes]);

  const loadAdminReviews = useCallback(async () => {
    try {
      const res = await fetchAdminReviews({
        limit: 300,
        ...(adminReviewStatusFilter !== "all" ? { status: adminReviewStatusFilter } : {}),
      });
      const rows = Array.isArray(res) ? res : [];
      setAdminReviews(rows);
      setAdminReviewPhotoFiles({});
      setAdminReviewPhotoDeletes({});
      setAdminReviewSnapshots(
        rows.reduce((acc, entry) => {
          const key = String(entry?.id || "");
          if (!key) return acc;
          acc[key] = buildReviewSnapshot(entry);
          return acc;
        }, {}),
      );
    } catch {
      setAdminReviews([]);
      setAdminReviewPhotoFiles({});
      setAdminReviewPhotoDeletes({});
      setAdminReviewSnapshots({});
    }
  }, [adminReviewStatusFilter]);

  useEffect(() => {
    if (activeTab !== "reviews") return;

    loadAdminReviews();
  }, [activeTab, loadAdminReviews]);

  useEffect(() => {
    if (activeTab !== "reviews") return;

    fetchAdminReviewInviteCodes({ limit: 100 })
      .then((res) => setReviewInviteCodes(Array.isArray(res) ? res : []))
      .catch(() => setReviewInviteCodes([]));
  }, [activeTab]);

  const loadDigitalCheckoutSessions = async () => {
    setIsLoadingDigitalSessions(true);
    try {
      const response = await fetchAdminDigitalCheckoutSessions({ limit: 250 });
      const items = Array.isArray(response?.items)
        ? response.items
        : Array.isArray(response)
          ? response
          : [];
      setDigitalCheckoutSessions(items);
    } catch {
      setDigitalCheckoutSessions([]);
    } finally {
      setIsLoadingDigitalSessions(false);
    }
  };

  useEffect(() => {
    if (activeTab !== "products") return;
    loadDigitalCheckoutSessions();
  }, [activeTab]);

  const handleAdminReviewFieldChange = (reviewId, field, value) => {
    setAdminReviews((prev) => prev.map((entry) => (
      entry.id === reviewId
        ? { ...entry, [field]: value }
        : entry
    )));
  };

  const handleAdminReviewPhotoChange = (reviewId, file) => {
    setAdminReviewPhotoFiles((prev) => {
      const next = { ...prev };
      if (file) {
        next[String(reviewId)] = file;
      } else {
        delete next[String(reviewId)];
      }
      return next;
    });
    setAdminReviewPhotoDeletes((prev) => {
      const next = { ...prev };
      delete next[String(reviewId)];
      return next;
    });
  };

  const handleAdminReviewPhotoDelete = (reviewId) => {
    const reviewKey = String(reviewId);
    setAdminReviewPhotoFiles((prev) => {
      const next = { ...prev };
      delete next[reviewKey];
      return next;
    });
    setAdminReviewPhotoDeletes((prev) => ({
      ...prev,
      [reviewKey]: true,
    }));
  };

  const handleAdminReviewPhotoRestore = (reviewId) => {
    setAdminReviewPhotoDeletes((prev) => {
      const next = { ...prev };
      delete next[String(reviewId)];
      return next;
    });
  };

  const handleSaveAdminReview = async (review) => {
    setAdminReviewStatus("");
    setIsSavingReview(true);
    setExpandedAdminReviewId(null);
    try {
      const reviewKey = String(review.id);
      const pendingPhoto = adminReviewPhotoFiles[reviewKey] || null;
      const pendingPhotoDelete = Boolean(adminReviewPhotoDeletes[reviewKey]);
      if (pendingPhoto) {
        const formData = new FormData();
        formData.append("rating", String(Number(review.rating) || 0));
        formData.append("title", review.title || "");
        formData.append("body", review.body || "");
        formData.append("admin_comment", review.admin_comment || "");
        formData.append("status", review.status || "pending");
        formData.append("photo", pendingPhoto);
        await updateAdminReview(review.id, formData);
      } else {
        await updateAdminReview(review.id, {
          rating: Number(review.rating),
          title: review.title || "",
          body: review.body || "",
          admin_comment: review.admin_comment || "",
          status: review.status || "pending",
          ...(pendingPhotoDelete ? { review_image_url: null } : {}),
        });
      }
      setAdminReviewPhotoFiles((prev) => {
        const next = { ...prev };
        delete next[reviewKey];
        return next;
      });
      setAdminReviewPhotoDeletes((prev) => {
        const next = { ...prev };
        delete next[reviewKey];
        return next;
      });
      await loadAdminReviews();
      setAdminReviewStatus("Review updated.");
    } catch (error) {
      setAdminReviewStatus(error?.response?.data?.error || error?.message || "Failed to update review.");
    } finally {
      setIsSavingReview(false);
    }
  };

  const handleCreateAdminReview = async (event) => {
    event.preventDefault();
    setAdminReviewCreateStatus("");

    const reviewerName = String(adminReviewCreateForm.name || "").trim();
    const body = String(adminReviewCreateForm.body || "").trim();
    const purchasedAt = String(adminReviewCreateForm.purchased_at || "").trim();
    const purchaseSource = String(adminReviewCreateForm.purchase_source || "").trim().toLowerCase();
    const purchaseSourceOther = String(adminReviewCreateForm.purchase_source_other || "").trim();
    const status = String(adminReviewCreateForm.status || "approved").trim().toLowerCase();

    if (!reviewerName || !body || !purchasedAt || !purchaseSource) {
      setAdminReviewCreateStatus("Name, Purchased At, Purchase Source, and comment are required.");
      return;
    }
    if (purchaseSource === "other" && !purchaseSourceOther) {
      setAdminReviewCreateStatus("Please enter where the review came from.");
      return;
    }

    const payload = new FormData();
    payload.append("name", reviewerName);
    payload.append("rating", String(Number(adminReviewCreateForm.rating) || 5));
    payload.append("title", String(adminReviewCreateForm.title || "").trim());
    payload.append("body", body);
    payload.append("purchased_at", purchasedAt);
    payload.append("purchase_source", purchaseSource);
    payload.append("purchase_source_other", purchaseSourceOther);
    payload.append("status", status);
    if (adminReviewCreateForm.photo) {
      payload.append("photo", adminReviewCreateForm.photo);
    }

    setIsCreatingAdminReview(true);
    try {
      await createAdminReview(payload);
      setAdminReviewCreateForm({
        name: "",
        rating: 5,
        title: "",
        body: "",
        purchased_at: "",
        purchase_source: "etsy",
        purchase_source_other: "",
        status: "approved",
        photo: null,
      });
      setExpandedAdminReviewId(null);
      await loadAdminReviews();
      setAdminReviewCreateStatus("Review added.");
    } catch (error) {
      setAdminReviewCreateStatus(error?.response?.data?.error || error?.message || "Failed to add review.");
    } finally {
      setIsCreatingAdminReview(false);
    }
  };

  const handleCreateAdminReviewPhotoPaste = (event) => {
    const pastedImage = getClipboardImageFile(event);
    if (!pastedImage) return;
    event.preventDefault();
    setAdminReviewCreateForm((prev) => ({ ...prev, photo: pastedImage }));
  };

  const handleDeleteAdminReview = async (reviewId) => {
    setAdminReviewStatus("");
    setIsDeletingReview(true);
    try {
      await deleteAdminReview(reviewId);
      setAdminReviews((prev) => prev.filter((entry) => entry.id !== reviewId));
      setAdminReviewPhotoFiles((prev) => {
        const next = { ...prev };
        delete next[String(reviewId)];
        return next;
      });
      setAdminReviewPhotoDeletes((prev) => {
        const next = { ...prev };
        delete next[String(reviewId)];
        return next;
      });
      setAdminReviewSnapshots((prev) => {
        const next = { ...prev };
        delete next[String(reviewId)];
        return next;
      });
      setExpandedAdminReviewId((prev) => (String(prev) === String(reviewId) ? null : prev));
      setAdminReviewStatus("Review deleted.");
    } catch (error) {
      setAdminReviewStatus(error?.response?.data?.error || error?.message || "Failed to delete review.");
    } finally {
      setIsDeletingReview(false);
    }
  };

  const handleGenerateReviewCode = async (event) => {
    event.preventDefault();
    setReviewInviteStatus("");
    setIsGeneratingReviewCode(true);
    try {
      const payload = {
        platform: String(reviewInviteForm.platform || "").trim().toLowerCase(),
        product_name: String(reviewInviteForm.product_name || "").trim(),
        customer_email: String(reviewInviteForm.customer_email || "").trim().toLowerCase(),
        note: reviewInviteForm.note || "",
      };

      if (!payload.platform) {
        setReviewInviteStatus("Platform is required.");
        return;
      }

      const response = await createAdminReviewInviteCode(payload);
      const createdCode = String(response?.code || "");
      const createdInvite = response?.invite;

      if (createdInvite) {
        setReviewInviteCodes((prev) => [createdInvite, ...prev].slice(0, 100));
      }

      const emailSent = Boolean(response?.email_sent);
      const customerEmail = String(response?.customer_email || payload.customer_email || "").trim();

      if (createdCode) {
        setLastGeneratedReviewCode(createdCode);
        try {
          await navigator.clipboard.writeText(createdCode);
          if (customerEmail) {
            setReviewInviteStatus(
              emailSent
                ? `Review code ${createdCode} generated, copied, and emailed to ${customerEmail}.`
                : `Review code ${createdCode} generated and copied, but email to ${customerEmail} could not be sent.`,
            );
          } else {
            setReviewInviteStatus(`Review code ${createdCode} generated and copied.`);
          }
        } catch {
          if (customerEmail) {
            setReviewInviteStatus(
              emailSent
                ? `Review code generated: ${createdCode}. Email sent to ${customerEmail}.`
                : `Review code generated: ${createdCode}. Email to ${customerEmail} could not be sent.`,
            );
          } else {
            setReviewInviteStatus(`Review code generated: ${createdCode}`);
          }
        }
      } else {
        setReviewInviteStatus("Review code generated.");
      }
    } catch (error) {
      setReviewInviteStatus(error?.response?.data?.error || error?.message || "Failed to generate review code.");
    } finally {
      setIsGeneratingReviewCode(false);
    }
  };

  const handleGenerateUnlimitedReviewCode = async (event) => {
    event.preventDefault();
    setReviewInviteStatus("");
    setIsGeneratingReviewCode(true);

    const codeName = String(unlimitedReviewCodeName || "").trim().toUpperCase();
    if (!codeName) {
      setReviewInviteStatus("Please enter a code name.");
      setIsGeneratingReviewCode(false);
      return;
    }

    try {
      const response = await createAdminReviewInviteCode({
        platform: "other",
        product_name: codeName,
        code: codeName,
        unlimited: true,
        note: "Unlimited use code",
      });

      const createdCode = String(response?.code || codeName);
      const createdInvite = response?.invite;
      if (createdInvite) {
        setReviewInviteCodes((prev) => [createdInvite, ...prev].slice(0, 100));
      }
      setLastGeneratedReviewCode(createdCode);
      setUnlimitedReviewCodeName("");

      try {
        await navigator.clipboard.writeText(createdCode);
        setReviewInviteStatus(`Unlimited review code ${createdCode} created and copied.`);
      } catch {
        setReviewInviteStatus(`Unlimited review code ${createdCode} created.`);
      }
    } catch (error) {
      setReviewInviteStatus(error?.response?.data?.error || error?.message || "Failed to create unlimited review code.");
    } finally {
      setIsGeneratingReviewCode(false);
    }
  };

  const handleCopyReviewCode = async (code) => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setReviewInviteStatus(`Copied code: ${code}`);
    } catch {
      setReviewInviteStatus(`Copy failed. Code: ${code}`);
    }
  };

  const handleDeleteReviewCode = async (inviteId) => {
    if (!inviteId) return;
    setReviewInviteStatus("");
    setIsDeletingReviewCode(true);
    try {
      await deleteAdminReviewInviteCode(inviteId);
      setReviewInviteCodes((prev) => prev.filter((entry) => entry.id !== inviteId));
      setReviewInviteStatus("Review code deleted.");
    } catch (error) {
      setReviewInviteStatus(error?.response?.data?.error || error?.message || "Failed to delete review code.");
    } finally {
      setIsDeletingReviewCode(false);
    }
  };

  const regenerateReviewCode = async (invite, options = {}) => {
    if (!invite) return;
    setReviewInviteStatus("");
    setIsRegeneratingReviewCode(true);

    const shouldCopy = Boolean(options.copy);
    const shouldRequireEmail = Boolean(options.requireEmail);

    const platform = String(invite.platform || invite.product_id || "other").trim().toLowerCase() || "other";
    const productName = String(invite.product_name || "").trim();
    const customerEmail = String(invite.customer_email || "").trim().toLowerCase();
    const note = String(invite.note || "").trim();

    if (shouldRequireEmail && !customerEmail) {
      setReviewInviteStatus("This code has no customer email saved. Add one when generating a code first.");
      return;
    }

    try {
      const response = await createAdminReviewInviteCode({
        platform,
        product_name: productName,
        customer_email: customerEmail,
        note,
      });

      const replacementCode = String(response?.code || "");
      const replacementInvite = response?.invite || null;

      if (!replacementCode || !replacementInvite) {
        setReviewInviteStatus("Replacement code was created but could not be returned.");
        return;
      }

      // Retire the previous code so there is only one active code for this invite context.
      if (invite.id) {
        try {
          await deleteAdminReviewInviteCode(invite.id);
        } catch {
          // Keep going even if old-code cleanup fails.
        }
      }

      setReviewInviteCodes((prev) => [replacementInvite, ...prev.filter((entry) => entry.id !== invite.id)].slice(0, 100));
      setLastGeneratedReviewCode(replacementCode);

      if (shouldCopy) {
        try {
          await navigator.clipboard.writeText(replacementCode);
        } catch {
          // Clipboard can fail in some browser privacy modes.
        }
      }

      const emailSent = Boolean(response?.email_sent);
      if (shouldRequireEmail) {
        if (emailSent) {
          setReviewInviteStatus(`Replacement code ${replacementCode} generated and resent to ${customerEmail}.`);
        } else {
          setReviewInviteStatus(`Replacement code ${replacementCode} generated, but email to ${customerEmail} could not be sent.`);
        }
      } else if (shouldCopy) {
        setReviewInviteStatus(`Replacement code ${replacementCode} generated and copied.`);
      } else {
        setReviewInviteStatus(`Replacement code ${replacementCode} generated.`);
      }
    } catch (error) {
      setReviewInviteStatus(error?.response?.data?.error || error?.message || "Failed to regenerate and resend review code.");
    } finally {
      setIsRegeneratingReviewCode(false);
    }
  };

  const handleRecopyReviewCode = async (invite) => {
    await regenerateReviewCode(invite, { copy: true, requireEmail: false });
  };

  const handleResendReviewCode = async (invite) => {
    await regenerateReviewCode(invite, { copy: false, requireEmail: true });
  };
  const [status, setStatus] = useState("");
  const [isRefreshingCatalog, setIsRefreshingCatalog] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [manualProductSearch, setManualProductSearch] = useState("");
  const [deactivatedProductSearch, setDeactivatedProductSearch] = useState("");
  const [manualProductsListTab, setManualProductsListTab] = useState("all");
  const [manualProductTypeFilter, setManualProductTypeFilter] = useState("all");
  const [openProductActionMenuId, setOpenProductActionMenuId] = useState("");
  const [patternToTemplateSelection, setPatternToTemplateSelection] = useState("");
  const [isConvertingPatternToTemplate, setIsConvertingPatternToTemplate] = useState(false);
  const [patternToTemplateStatus, setPatternToTemplateStatus] = useState("");
  const [manualProductsPage, setManualProductsPage] = useState(1);
  const [deactivatedProductsPage, setDeactivatedProductsPage] = useState(1);
  const [linkedTemplatePreviewUrls, setLinkedTemplatePreviewUrls] = useState({});
  const pdfThumbnailCacheRef = useRef(new Map());
  const productActionMenuRef = useRef(null);
  const [customersPage, setCustomersPage] = useState(1);
  const [reviewCodesPage, setReviewCodesPage] = useState(1);
  const [reviewsPage, setReviewsPage] = useState(1);
  const [facebookPostedProductIds, setFacebookPostedProductIds] = useState(() => {
    try {
      const stored = localStorage.getItem(FACEBOOK_POSTED_STORAGE_KEY);
      if (!stored) return {};
      const parsed = JSON.parse(stored);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  });
  const [showManualProductModal, setShowManualProductModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [productType, setProductType] = useState("stainedGlassPanels");
  const [favoriteCategoriesByType, setFavoriteCategoriesByType] = useState(
    () => {
      const parsed = readStoredJson("favoriteCategoriesByType", null);
      if (parsed) {
        const emptyBuckets = createEmptyTypeBuckets();
        return {
          ...emptyBuckets,
          stainedGlassPanels: Array.isArray(parsed?.stainedGlassPanels)
            ? sortFavoriteValues(parsed.stainedGlassPanels)
            : Array.isArray(parsed?.stainedGlass)
              ? sortFavoriteValues(parsed.stainedGlass)
              : [],
          fusedArt: Array.isArray(parsed?.fusedArt)
            ? sortFavoriteValues(parsed.fusedArt)
            : [],
          laserAndSandblasting: Array.isArray(parsed?.laserAndSandblasting)
            ? sortFavoriteValues(parsed.laserAndSandblasting)
            : [],
          woodArt: Array.isArray(parsed?.woodArt)
            ? sortFavoriteValues(parsed.woodArt)
            : Array.isArray(parsed?.woodwork)
              ? sortFavoriteValues(parsed.woodwork)
              : [],
          patterns: Array.isArray(parsed?.patterns)
            ? sortFavoriteValues(parsed.patterns)
            : [],
        };
      }

      const legacyCategories = readStoredJson("favoriteCategories", []);
      return {
        ...createEmptyTypeBuckets(),
        stainedGlassPanels: Array.isArray(legacyCategories)
          ? sortFavoriteValues(legacyCategories)
          : [],
      };
    },
  );
  const [favoriteMaterialsByType, setFavoriteMaterialsByType] = useState(() => {
    const parsed = readStoredJson("favoriteMaterialsByType", null);
    if (parsed) {
      return {
        ...createEmptyTypeBuckets(),
        stainedGlassPanels: Array.isArray(parsed?.stainedGlassPanels)
          ? sortFavoriteValues(parsed.stainedGlassPanels)
          : Array.isArray(parsed?.stainedGlass)
            ? sortFavoriteValues(parsed.stainedGlass)
            : [],
        fusedArt: Array.isArray(parsed?.fusedArt)
          ? sortFavoriteValues(parsed.fusedArt)
          : [],
        laserAndSandblasting: Array.isArray(parsed?.laserAndSandblasting)
          ? sortFavoriteValues(parsed.laserAndSandblasting)
          : [],
        woodArt: Array.isArray(parsed?.woodArt)
          ? sortFavoriteValues(parsed.woodArt)
          : Array.isArray(parsed?.woodwork)
            ? sortFavoriteValues(parsed.woodwork)
            : [],
        patterns: Array.isArray(parsed?.patterns)
          ? sortFavoriteValues(parsed.patterns)
          : [],
      };
    }

    const legacyMaterials = readStoredJson("favoriteMaterials", []);
    return {
      ...createEmptyTypeBuckets(),
      stainedGlassPanels: Array.isArray(legacyMaterials)
        ? sortFavoriteValues(legacyMaterials)
        : [],
    };
  });
  const [manualProduct, setManualProduct] = useState(createEmptyManualProduct());
  const [unifiedTemplate, setUnifiedTemplate] = useState(createEmptyUnifiedTemplate());
  const [relatedTemplateUpload, setRelatedTemplateUpload] = useState(createEmptyRelatedTemplateUpload());
  const [relatedGalleryUpload, setRelatedGalleryUpload] = useState(createEmptyRelatedGalleryUpload());
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [showMaterialDropdown, setShowMaterialDropdown] = useState(false);
  const categoryDropdownRef = useRef(null);
  const materialDropdownRef = useRef(null);
  const openingCustomerIdRef = useRef(null);
  const [categoryInput, setCategoryInput] = useState("");
  const [materialInput, setMaterialInput] = useState("");
  const [imagePreviews, setImagePreviews] = useState([]);
  const [manualProductStatusTone, setManualProductStatusTone] = useState("neutral");
  const [enableWatermark, setEnableWatermark] = useState(true);
  const [watermarkText, setWatermarkText] = useState("SGCG ART GLASS");
  const [addImagesToGallery, setAddImagesToGallery] = useState(false);
  const [templateRefPhotos, setTemplateRefPhotos] = useState([]);
  const [templateNameManuallyEdited, setTemplateNameManuallyEdited] = useState(false);
  const [patternOnlyDescription, setPatternOnlyDescription] = useState("");
  const [productModePhysical, setProductModePhysical] = useState(true);
  const [productModePattern, setProductModePattern] = useState(false);
  const [productModeTemplate, setProductModeTemplate] = useState(false);
  const [quantityManuallyEdited, setQuantityManuallyEdited] = useState(false);
  const [manualProductSaveQueue, setManualProductSaveQueue] = useState([]);
  const [activeManualProductSaveJobId, setActiveManualProductSaveJobId] = useState("");
  const [isSavingManualProduct, setIsSavingManualProduct] = useState(false);

  const activeFavoriteCategories = favoriteCategoriesByType[productType] || [];
  const activeFavoriteMaterials = favoriteMaterialsByType[productType] || [];

  const clearManualProductStatus = () => {
    setStatus("");
    setManualProductStatusTone("neutral");
  };

  const setManualProductErrorStatus = (message) => {
    setStatus(message);
    setManualProductStatusTone("error");
  };

  const setManualProductInfoStatus = (message) => {
    setStatus(message);
    setManualProductStatusTone("neutral");
  };

  const addFavoriteCategoryForActiveType = (value) => {
    setFavoriteCategoriesByType((prev) => {
      const currentValues = prev[productType] || [];
      if (currentValues.includes(value)) {
        return prev;
      }

      return {
        ...prev,
        [productType]: sortFavoriteValues([...currentValues, value]),
      };
    });
  };

  const addFavoriteMaterialForActiveType = (value) => {
    setFavoriteMaterialsByType((prev) => {
      const currentValues = prev[productType] || [];
      if (currentValues.includes(value)) {
        return prev;
      }

      return {
        ...prev,
        [productType]: sortFavoriteValues([...currentValues, value]),
      };
    });
  };

  const removeFavoriteCategoryForActiveType = (value) => {
    setFavoriteCategoriesByType((prev) => ({
      ...prev,
      [productType]: (prev[productType] || []).filter(
        (entry) => entry !== value,
      ),
    }));
  };

  const removeFavoriteMaterialForActiveType = (value) => {
    setFavoriteMaterialsByType((prev) => ({
      ...prev,
      [productType]: (prev[productType] || []).filter(
        (entry) => entry !== value,
      ),
    }));
  };

  const inferProductType = useCallback((product) => {
    const categories = Array.isArray(product?.category)
      ? product.category
      : product?.category
        ? [product.category]
        : [];

    const explicitType = categories
      .map((entry) =>
        CATEGORY_TYPE_ALIASES[
          String(entry || "")
            .toLowerCase()
            .replace(/[^a-z0-9]/g, "")
        ],
      )
      .find(Boolean);

    if (explicitType) {
      return explicitType;
    }

    const combined = [
      toSearchableText(product?.category),
      toSearchableText(product?.materials),
      toSearchableText(product?.name),
      toSearchableText(product?.description),
    ].join(" ");

    if (/pattern|template|svg|line\s*art|trace/.test(combined)) {
      return "patterns";
    }
    if (/laser|sandblast|sand\s*blast|engrave|etch/.test(combined)) {
      return "laserAndSandblasting";
    }
    if (/fused|kiln|slump|melt/.test(combined)) {
      return "fusedArt";
    }
    if (/wood|woodwork|timber|carv|oak|walnut|maple|cedar/.test(combined)) {
      return "woodArt";
    }

    return "stainedGlassPanels";
  }, []);

  const inferManualProductTab = useCallback((product) => {
    if (product?.is_digital_download) {
      return "patterns";
    }
    return inferProductType(product);
  }, [inferProductType]);

  const patternProductOptions = useMemo(() => {
    const inferred = normalizedManualProducts
      .filter((entry) => inferManualProductTab(entry) === "patterns")
      .map((entry) => ({
        id: entry.id,
        name: (entry.name || `Pattern #${entry.id}`).trim(),
        image_url: String(entry.images?.find((i) => i?.media_type !== "video")?.image_url || entry.images?.[0]?.image_url || "").trim(),
      }))
      .filter((entry) => entry.id);

    const source = inferred.length > 0
      ? inferred
      : normalizedManualProducts
        .map((entry) => ({
          id: entry.id,
          name: (entry.name || `Product #${entry.id}`).trim(),
          image_url: String(entry.images?.find((i) => i?.media_type !== "video")?.image_url || entry.images?.[0]?.image_url || "").trim(),
        }))
        .filter((entry) => entry.id);

    const seen = new Set();
    return source.filter((entry) => {
      const key = String(entry.id);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [normalizedManualProducts, inferManualProductTab]);

  const linkedProductOptions = useMemo(() => {
    const seen = new Set();
    return normalizedManualProducts
      .filter((entry) => {
        if (!entry?.id) return false;
        if (editingProduct && String(entry.id) === String(editingProduct.id)) return false;
        if (entry.is_digital_download) return false;
        if (inferManualProductTab(entry) === "patterns") return false;
        return true;
      })
      .map((entry) => ({
        id: entry.id,
        name: String(entry.name || `Product #${entry.id}`).trim(),
        image_url: String(entry.images?.find((i) => i?.media_type !== "video")?.image_url || entry.images?.[0]?.image_url || "").trim(),
      }))
      .filter((entry) => {
        const key = String(entry.id);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }, [normalizedManualProducts, editingProduct, inferManualProductTab]);

  const filteredManualProducts = useMemo(() => {
    const isFeaturedProduct = (product) => product?.is_featured === 1 || product?.is_featured === true;
    const isHomeCarouselProduct = (product) =>
      product?.is_home_featured === 1 || product?.is_home_featured === true;

    const matchesManualProductsListTab = (product) => {
      if (manualProductsListTab === "featured") return isFeaturedProduct(product);
      if (manualProductsListTab === "home-carousel") return isHomeCarouselProduct(product);
      if (manualProductsListTab === "manual") {
        return !isFeaturedProduct(product) && !isHomeCarouselProduct(product);
      }
      return true;
    };

    const activeManualProducts = normalizedManualProducts.filter((product) => product.is_active);
    const searchLower = manualProductSearch.toLowerCase();
    const matchedProducts = activeManualProducts.filter((product) => {
      const name = toSearchableText(product.name);
      const description = toSearchableText(product.description);
      const category = toSearchableText(product.category);
      const materials = toSearchableText(product.materials);

      const matchesType =
        manualProductTypeFilter === "all"
        || inferManualProductTab(product) === manualProductTypeFilter;

      return (
        matchesManualProductsListTab(product)
        &&
        matchesType
        && (
          name.includes(searchLower)
          || description.includes(searchLower)
          || category.includes(searchLower)
          || materials.includes(searchLower)
        )
      );
    });
    return sortManualProductsNewestFirst(matchedProducts);
  }, [
    normalizedManualProducts,
    manualProductSearch,
    manualProductsListTab,
    manualProductTypeFilter,
    inferManualProductTab,
  ]);

  const filteredDeactivatedProducts = useMemo(() => {
    const deactivatedManualProducts = normalizedManualProducts.filter((product) => !product.is_active);
    const searchLower = deactivatedProductSearch.toLowerCase();
    const matchedProducts = deactivatedManualProducts.filter((product) => {
      const name = toSearchableText(product.name);
      const description = toSearchableText(product.description);
      const category = toSearchableText(product.category);
      const materials = toSearchableText(product.materials);

      const matchesType =
        manualProductTypeFilter === "all"
        || inferManualProductTab(product) === manualProductTypeFilter;

      return (
        matchesType
        && (
          name.includes(searchLower)
          || description.includes(searchLower)
          || category.includes(searchLower)
          || materials.includes(searchLower)
        )
      );
    });
    return sortManualProductsNewestFirst(matchedProducts);
  }, [normalizedManualProducts, deactivatedProductSearch, manualProductTypeFilter, inferManualProductTab]);

  const activeManualProducts = useMemo(
    () => normalizedManualProducts.filter((product) => product.is_active),
    [normalizedManualProducts],
  );

  const manualProductListTabCounts = useMemo(() => {
    const isFeaturedProduct = (product) => product?.is_featured === 1 || product?.is_featured === true;
    const isHomeCarouselProduct = (product) =>
      product?.is_home_featured === 1 || product?.is_home_featured === true;

    const counts = {
      all: activeManualProducts.length,
      manual: 0,
      featured: 0,
      "home-carousel": 0,
    };

    activeManualProducts.forEach((product) => {
      if (isFeaturedProduct(product)) counts.featured += 1;
      if (isHomeCarouselProduct(product)) counts["home-carousel"] += 1;
      if (!isFeaturedProduct(product) && !isHomeCarouselProduct(product)) counts.manual += 1;
    });

    return counts;
  }, [activeManualProducts]);

  const activeManualProductsCount = activeManualProducts.length;
  const activeManualProductsTabLabel =
    MANUAL_PRODUCT_LIST_TABS.find((entry) => entry.key === manualProductsListTab)?.label || "All Products";

  const filteredPatternProducts = useMemo(
    () => filteredManualProducts.filter((product) => inferManualProductTab(product) === "patterns"),
    [filteredManualProducts, inferManualProductTab],
  );

  const homeFeaturedProductsCount = useMemo(
    () => manualProductListTabCounts["home-carousel"] || 0,
    [manualProductListTabCounts],
  );

  const totalManualProductPages = Math.max(
    1,
    Math.ceil(filteredManualProducts.length / MANUAL_PRODUCTS_PER_PAGE),
  );

  const currentManualProductsPage = Math.min(manualProductsPage, totalManualProductPages);

  const pagedManualProducts = useMemo(() => {
    const startIndex = (currentManualProductsPage - 1) * MANUAL_PRODUCTS_PER_PAGE;
    return filteredManualProducts.slice(startIndex, startIndex + MANUAL_PRODUCTS_PER_PAGE);
  }, [filteredManualProducts, currentManualProductsPage]);

  const totalDeactivatedProductPages = Math.max(
    1,
    Math.ceil(filteredDeactivatedProducts.length / MANUAL_PRODUCTS_PER_PAGE),
  );

  const currentDeactivatedProductsPage = Math.min(deactivatedProductsPage, totalDeactivatedProductPages);

  const pagedDeactivatedProducts = useMemo(() => {
    const startIndex = (currentDeactivatedProductsPage - 1) * MANUAL_PRODUCTS_PER_PAGE;
    return filteredDeactivatedProducts.slice(startIndex, startIndex + MANUAL_PRODUCTS_PER_PAGE);
  }, [filteredDeactivatedProducts, currentDeactivatedProductsPage]);

  useEffect(() => {
    let isActive = true;
    const visibleProducts = [...pagedManualProducts, ...pagedDeactivatedProducts];
    const missingTemplateIds = Array.from(
      new Set(
        visibleProducts
          .filter((product) => isPatternProductRecord(product))
          .map((product) => String(product?.related_links?.template_id || "").trim())
          .filter((templateId) => templateId && !linkedTemplatePreviewUrls[templateId]),
      ),
    );

    if (missingTemplateIds.length === 0) {
      return () => {
        isActive = false;
      };
    }

    Promise.all(
      missingTemplateIds.map(async (templateId) => {
        try {
          const payload = await getTemplate(templateId);
          const resolvedUrl = resolveMediaUrl(payload?.thumbnail_url || payload?.image_url || "");
          return [templateId, resolvedUrl || ""];
        } catch {
          return [templateId, ""];
        }
      }),
    ).then((entries) => {
      if (!isActive) return;
      setLinkedTemplatePreviewUrls((prev) => {
        const next = { ...prev };
        entries.forEach(([templateId, resolvedUrl]) => {
          if (!(templateId in next) || (!next[templateId] && resolvedUrl)) {
            next[templateId] = resolvedUrl;
          }
        });
        return next;
      });
    });

    return () => {
      isActive = false;
    };
  }, [pagedManualProducts, pagedDeactivatedProducts, linkedTemplatePreviewUrls]);

  const customerCountsByCategory = useMemo(() => {
    return ensureArray(customers).reduce((acc, customer) => {
      const category = deriveCustomerCategory(customer);
      acc[category] = (acc[category] || 0) + 1;
      return acc;
    }, {
      "signed-up": 0,
      "review-customer": 0,
      "admin-testimonial": 0,
    });
  }, [customers]);

  const filteredCustomers = useMemo(() => {
    const searchNeedle = String(customerSearch || "").trim().toLowerCase();

    return ensureArray(customers).filter((customer) => {
      if (deriveCustomerCategory(customer) !== customerListTab) {
        return false;
      }

      if (!searchNeedle) {
        return true;
      }

      const haystack = [
        customer?.first_name,
        customer?.last_name,
        customer?.email,
        customer?.phone,
        customer?.admin_notes,
      ]
        .map((value) => String(value || "").toLowerCase())
        .join(" ");

      return haystack.includes(searchNeedle);
    });
  }, [customers, customerListTab, customerSearch]);

  const pagedCustomers = useMemo(() => {
    const startIndex = (customersPage - 1) * SECTION_PAGE_SIZE;
    return filteredCustomers.slice(startIndex, startIndex + SECTION_PAGE_SIZE);
  }, [filteredCustomers, customersPage]);

  const totalCustomersPages = Math.max(1, Math.ceil(filteredCustomers.length / SECTION_PAGE_SIZE));

  const filteredDigitalCheckoutSessions = useMemo(() => {
    const needle = String(digitalSessionEmailSearch || "").trim().toLowerCase();
    if (!needle) return digitalCheckoutSessions;
    return digitalCheckoutSessions.filter((entry) =>
      String(entry?.customer_email || "").toLowerCase().includes(needle),
    );
  }, [digitalCheckoutSessions, digitalSessionEmailSearch]);

  const pagedDigitalCheckoutSessions = useMemo(() => {
    const startIndex = (digitalSessionsPage - 1) * SECTION_PAGE_SIZE;
    return filteredDigitalCheckoutSessions.slice(startIndex, startIndex + SECTION_PAGE_SIZE);
  }, [filteredDigitalCheckoutSessions, digitalSessionsPage]);

  const totalDigitalSessionsPages = Math.max(1, Math.ceil(filteredDigitalCheckoutSessions.length / SECTION_PAGE_SIZE));

  const pagedReviewInviteCodes = useMemo(() => {
    const startIndex = (reviewCodesPage - 1) * SECTION_PAGE_SIZE;
    return reviewInviteCodes.slice(startIndex, startIndex + SECTION_PAGE_SIZE);
  }, [reviewInviteCodes, reviewCodesPage]);

  const totalReviewCodesPages = Math.max(1, Math.ceil(reviewInviteCodes.length / SECTION_PAGE_SIZE));

  const pagedAdminReviews = useMemo(() => {
    const startIndex = (reviewsPage - 1) * SECTION_PAGE_SIZE;
    return adminReviews.slice(startIndex, startIndex + SECTION_PAGE_SIZE);
  }, [adminReviews, reviewsPage]);

  const totalReviewsPages = Math.max(1, Math.ceil(adminReviews.length / SECTION_PAGE_SIZE));

  const loadManualProductLinkOptions = async () => {
    try {
      const [templatesResponse, galleryResponse] = await Promise.all([
        getTemplates(),
        getAdminGalleryPhotos(),
      ]);

      const rawTemplateItems = Array.isArray(templatesResponse?.items)
        ? templatesResponse.items
        : Array.isArray(templatesResponse)
          ? templatesResponse
          : [];
      const seenTemplateIds = new Set();
      const templateItems = rawTemplateItems
        .filter((entry) => entry?.id)
        .map((entry) => ({
          id: entry.id,
          name: String(entry.name || `Template #${entry.id}`).trim(),
          thumbnail_url: String(entry.thumbnail_url || entry.image_url || "").trim(),
        }))
        .filter((entry) => {
          const key = String(entry.id);
          if (seenTemplateIds.has(key)) return false;
          seenTemplateIds.add(key);
          return true;
        });
      setProductTemplateOptions(templateItems);

      const rawGalleryItems = Array.isArray(galleryResponse?.items)
        ? galleryResponse.items
        : Array.isArray(galleryResponse)
          ? galleryResponse
          : [];
      const seenGalleryIds = new Set();
      const galleryItems = rawGalleryItems
        .filter((entry) => entry?.id)
        .map((entry) => ({
          id: entry.id,
          panel_name: String(entry.panel_name || `Photo #${entry.id}`).trim(),
          template_id: entry.template_id || null,
          image_url: String(entry.image_url || "").trim(),
        }))
        .filter((entry) => {
          const key = String(entry.id);
          if (seenGalleryIds.has(key)) return false;
          seenGalleryIds.add(key);
          return true;
        });
      setProductGalleryOptions(galleryItems);
    } catch (error) {
      console.error("Failed to load product link options:", error);
      setProductTemplateOptions([]);
      setProductGalleryOptions([]);
    }
  };

  useEffect(() => {
    if (!showManualProductModal) return;
    loadManualProductLinkOptions();
  }, [showManualProductModal]);

  // Auto-fill template name from product name until user manually edits template name.
  useEffect(() => {
    if (!showManualProductModal || editingProduct) return;
    if (templateNameManuallyEdited) return;
    setUnifiedTemplate((prev) => ({
      ...prev,
      name: manualProduct.name,
    }));
  }, [
    manualProduct.name,
    showManualProductModal,
    editingProduct,
    templateNameManuallyEdited,
  ]);

  // Auto-fill template category from selected product type when blank
  useEffect(() => {
    if (!showManualProductModal || editingProduct) return;
    const typeLabel = PRODUCT_TYPE_CONFIG.find((e) => e.key === productType)?.label || "";
    setUnifiedTemplate((prev) => ({
      ...prev,
      category: prev.category || typeLabel,
    }));
  }, [productType, showManualProductModal, editingProduct]);

  const normalizeTypeFromCategory = (value) => {
    const normalized = String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
    return CATEGORY_TYPE_ALIASES[normalized] || null;
  };

  const removeTypeCategories = (categories = []) => {
    return categories.filter((entry) => !normalizeTypeFromCategory(entry));
  };

  const toggleManualProductCategoryOption = (value, isSelected) => {
    setManualProduct((prev) => {
      if (isSelected) {
        if (categoryTagExists(prev.category, value)) {
          return prev;
        }
        return {
          ...prev,
          category: [...prev.category, value],
        };
      }

      return {
        ...prev,
        category: prev.category.filter(
          (entry) => normalizeCategoryTagValue(entry) !== normalizeCategoryTagValue(value),
        ),
      };
    });
  };

  const isManualProductCategoryOptionSelected = (value) =>
    categoryTagExists(manualProduct.category, value);

  const setPrimaryTypeCategory = (type) => {
    const label = PRODUCT_TYPE_LABEL_BY_KEY[type] || PRODUCT_TYPE_LABEL_BY_KEY.stainedGlassPanels;
    setManualProduct((prev) => {
      const nextIsDigitalDownload = type === "patterns";
      return {
        ...prev,
        category: [label, ...removeTypeCategories(prev.category)],
        is_digital_download: nextIsDigitalDownload,
        quantity: resolveAutoQuantityForMode(
          prev.quantity,
          nextIsDigitalDownload,
          quantityManuallyEdited,
        ),
      };
    });
  };

  const setDigitalDownloadState = (nextIsDigitalDownload) => {
    setManualProduct((prev) => {
      const nextQuantity = nextIsDigitalDownload
        ? DIGITAL_DEFAULT_QUANTITY
        : syncQuantityWithDownloadMode(prev.quantity, false);
      if (
        Boolean(prev.is_digital_download) === Boolean(nextIsDigitalDownload)
        && String(prev.quantity ?? "") === String(nextQuantity)
      ) {
        return prev;
      }
      return {
        ...prev,
        is_digital_download: Boolean(nextIsDigitalDownload),
        quantity: nextQuantity,
      };
    });
  };

  const applyProductModeSelection = (nextModes) => {
    setProductModePhysical(Boolean(nextModes.physical));
    setProductModePattern(Boolean(nextModes.pattern));
    setProductModeTemplate(Boolean(nextModes.template));
    const mainProductIsDigital = !nextModes.physical && (nextModes.pattern || nextModes.template);
    setDigitalDownloadState(mainProductIsDigital);
  };

  const visibleCategoryTags = removeTypeCategories(manualProduct.category);
  const selectedTypeCategory =
    manualProduct.category
      .map((entry) => normalizeTypeFromCategory(entry))
      .find(Boolean) || productType;
  const templateOptionCount = productTemplateOptions.length;
  const patternOptionCount = patternProductOptions.length;
  const linkedProductOptionCount = linkedProductOptions.length;
  const galleryOptionCount = productGalleryOptions.length;
  const isProductSectionEnabled = editingProduct
    ? true
    : productModePhysical || (productModePattern && selectedTypeCategory === "patterns");
  const isTemplateSectionEnabled = productModePattern || productModeTemplate;
  const isPatternOrTemplate = productModePattern || productModeTemplate;
  const shouldShowProductMediaSection = !(editingProduct && isPatternOrTemplate && !productModePhysical);

  const closeFavoriteDropdowns = () => {
    setShowCategoryDropdown(false);
    setShowMaterialDropdown(false);
  };

  const closeProductActionMenu = () => {
    setOpenProductActionMenuId("");
  };

  useEffect(() => {
    if (activeManualProductSaveJobId || manualProductSaveQueue.length === 0) {
      return;
    }

    const nextJob = manualProductSaveQueue[0];
    if (!nextJob || typeof nextJob.run !== "function") {
      setManualProductSaveQueue((prev) => prev.slice(1));
      return;
    }

    setActiveManualProductSaveJobId(nextJob.id);
    Promise.resolve()
      .then(() => nextJob.run())
      .catch((error) => {
        console.error("[AdminDashboard] Background manual-product save failed:", error);
      })
      .finally(() => {
        setManualProductSaveQueue((prev) => prev.filter((job) => job.id !== nextJob.id));
        setActiveManualProductSaveJobId("");
      });
  }, [activeManualProductSaveJobId, manualProductSaveQueue]);

  // Close dropdowns when interacting outside
  useEffect(() => {
    const handlePointerDownOutside = (event) => {
      if (
        categoryDropdownRef.current &&
        !categoryDropdownRef.current.contains(event.target)
      ) {
        setShowCategoryDropdown(false);
      }
      if (
        materialDropdownRef.current &&
        !materialDropdownRef.current.contains(event.target)
      ) {
        setShowMaterialDropdown(false);
      }

      if (
        productActionMenuRef.current &&
        !productActionMenuRef.current.contains(event.target)
      ) {
        closeProductActionMenu();
      }
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        closeFavoriteDropdowns();
        closeProductActionMenu();
      }
    };

    document.addEventListener("pointerdown", handlePointerDownOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDownOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  // Save favorites to localStorage
  useEffect(() => {
    localStorage.setItem(
      "favoriteCategoriesByType",
      JSON.stringify(favoriteCategoriesByType),
    );
  }, [favoriteCategoriesByType]);

  useEffect(() => {
    localStorage.setItem(
      "favoriteMaterialsByType",
      JSON.stringify(favoriteMaterialsByType),
    );
  }, [favoriteMaterialsByType]);

  useEffect(() => {
    localStorage.removeItem("favoriteCategories");
    localStorage.removeItem("favoriteMaterials");
  }, []);

  const applyWatermark = (file, watermarkText, shouldApply) => {
    return new Promise((resolve) => {
      const img = new Image();
      const reader = new FileReader();

      reader.onload = (e) => {
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");

          canvas.width = img.width;
          canvas.height = img.height;

          // Draw the original image
          ctx.drawImage(img, 0, 0);

          // Apply watermark if enabled
          if (shouldApply && watermarkText) {
            // Calculate font size based on image size
            const fontSize = Math.max(40, Math.min(img.width, img.height) / 12);
            ctx.font = `bold ${fontSize}px Arial`;

            // Light grey, see-through color
            ctx.fillStyle = "rgba(57, 54, 243, 0.5)";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";

            // Rotate and position for diagonal watermark (bottom-left to top-right)
            ctx.save();
            ctx.translate(canvas.width / 2, canvas.height / 2);
            ctx.rotate(-Math.PI / 8);
            ctx.fillText(watermarkText, 0, 0);
            ctx.restore();
          }

          // Convert canvas to blob
          canvas.toBlob((blob) => {
            resolve(new File([blob], file.name, { type: file.type }));
          }, file.type);
        };
        img.src = e.target.result;
      };

      reader.readAsDataURL(file);
    });
  };

  const handleAddImages = async (files) => {
    const incomingFiles = Array.from(files || []).filter(Boolean);
    if (!incomingFiles.length) return;

    const existingPhotoCount = imagePreviews.filter((preview) => preview.type !== "video").length;
    const existingVideoCount = imagePreviews.filter((preview) => preview.type === "video").length;
    const incomingPhotoCount = incomingFiles.filter((file) => isImageFile(file) && !isVideoFile(file)).length;
    const incomingVideoCount = incomingFiles.filter((file) => isVideoFile(file)).length;

    if (existingPhotoCount + incomingPhotoCount > MAX_MANUAL_UPLOAD_PHOTOS) {
      setManualProductErrorStatus(`Upload is too large. Please reduce the number of photos to ${MAX_MANUAL_UPLOAD_PHOTOS} or fewer.`);
      return;
    }

    if (existingVideoCount + incomingVideoCount > MAX_MANUAL_UPLOAD_VIDEOS) {
      setManualProductErrorStatus(`Only ${MAX_MANUAL_UPLOAD_VIDEOS} video is allowed per listing.`);
      return;
    }

    const invalidType = incomingFiles.find(
      (file) => !isSupportedProductUploadFile(file),
    );
    if (invalidType) {
      setManualProductErrorStatus(`Unsupported file type: ${invalidType.name}`);
      return;
    }

    const tooLargeImage = incomingFiles.find(
      (file) => isImageFile(file) && !isVideoFile(file) && file.size > MAX_MANUAL_IMAGE_BYTES,
    );
    if (tooLargeImage) {
      setManualProductErrorStatus(`${tooLargeImage.name} is too large to upload. Please use a smaller image file.`);
      return;
    }

    const tooLargeVideo = incomingFiles.find(
      (file) => isVideoFile(file) && file.size > MAX_MANUAL_VIDEO_BYTES,
    );
    if (tooLargeVideo) {
      setManualProductErrorStatus(`${tooLargeVideo.name} is too large to upload. Please trim or compress the video.`);
      return;
    }

    const incomingTotalBytes = incomingFiles.reduce((sum, file) => sum + (file?.size || 0), 0);
    if (incomingTotalBytes > MAX_MANUAL_TOTAL_BYTES) {
      setManualProductErrorStatus("This upload is too large. Please reduce the number of photos/videos or file sizes.");
      return;
    }

    const newPreviews = [];

    for (const file of incomingFiles) {
      // Skip watermark for videos
      const isVideo = isVideoFile(file);
      let processedFile = file;

      // Apply watermark to images only
      if (!isVideo) {
        processedFile = await applyWatermark(
          file,
          watermarkText,
          enableWatermark,
        );
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        newPreviews.push({
          id: Math.random(),
          src: e.target.result,
          file: processedFile,
          type: isVideo ? "video" : "image",
        });

        // Only update when all previews are loaded
        if (newPreviews.length === incomingFiles.length) {
          setImagePreviews((prev) => [...prev, ...newPreviews]);
          setManualProduct((prev) => ({
            ...prev,
            images: [...(prev.images || []), ...newPreviews.map((p) => p.file)],
          }));
          clearManualProductStatus();
        }
      };
      reader.readAsDataURL(processedFile);
    }
  };

  const handleRemoveImage = (id) => {
    // Calculate remaining previews once to avoid stale state issues
    const remainingPreviews = imagePreviews.filter((img) => img.id !== id);

    setImagePreviews(remainingPreviews);
    setManualProduct((prev) => {
      // Filter images to keep only those matching remaining previews
      const remainingImages = prev.images.filter((img) => {
        // If it's a File object, check if its preview is in remainingPreviews
        if (img instanceof File) {
          return remainingPreviews.some((preview) => preview.file === img);
        }
        // If it's an existing image object, check by id
        const imgId = `existing-${prev.images.indexOf(img)}`;
        return remainingPreviews.some((preview) => preview.id === imgId);
      });

      return {
        ...prev,
        images: remainingImages,
      };
    });
  };

  const readFileAsText = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => resolve(String(event.target?.result || ""));
      reader.onerror = () => reject(new Error("Unable to read the selected file."));
      reader.readAsText(file);
    });

  const normalizeRelatedLinksPayload = (relatedLinks) => {
    if (!relatedLinks || typeof relatedLinks !== "object") {
      return null;
    }

    const payload = {
      template_id: relatedLinks.template_id ? Number(relatedLinks.template_id) : null,
      template_name: relatedLinks.template_name?.trim() || null,
      pattern_product_id: relatedLinks.pattern_product_id ? Number(relatedLinks.pattern_product_id) : null,
      pattern_product_name: relatedLinks.pattern_product_name?.trim() || null,
      linked_product_id: relatedLinks.linked_product_id ? Number(relatedLinks.linked_product_id) : null,
      linked_product_name: relatedLinks.linked_product_name?.trim() || null,
      gallery_photo_id: relatedLinks.gallery_photo_id ? Number(relatedLinks.gallery_photo_id) : null,
      gallery_panel_name: relatedLinks.gallery_panel_name?.trim() || null,
      gallery_template_id: relatedLinks.gallery_template_id ? Number(relatedLinks.gallery_template_id) : null,
    };

    const hasValue = Object.values(payload).some((entry) => entry !== null && entry !== "");
    return hasValue ? payload : null;
  };

  const handleManualProductSubmit = async (event) => {
    event.preventDefault();

    const manualProductSnapshot = manualProduct;
    const selectedTypeCategorySnapshot = selectedTypeCategory;
    const addImagesToGallerySnapshot = Boolean(addImagesToGallery);
    const firstGalleryImagePreviewSnapshot = Array.isArray(imagePreviews)
      ? imagePreviews
        .filter((entry) => entry?.type !== "video")
        .slice(0, 1)
      : [];

    const shouldCreateTemplate = !editingProduct && productModeTemplate && Boolean(unifiedTemplate.upload_file);
    const hasProductName = Boolean(String(manualProduct.name || "").trim());
    const shouldSaveProduct = isProductSectionEnabled && (editingProduct || hasProductName);
    const creatingTemplateOnly = !editingProduct && !shouldSaveProduct && shouldCreateTemplate;
    const creatingBoth = !editingProduct && shouldSaveProduct && shouldCreateTemplate;
    const hasNewTemplateReferencePhotos = templateRefPhotos.some((entry) => entry?.file instanceof File);
    const isEditingDigitalPatternProduct = Boolean(editingProduct?.is_digital_download);
    const shouldCreatePatternCopy =
      productModePattern
      && !isEditingDigitalPatternProduct
      && selectedTypeCategory !== "patterns"
      && (
        !editingProduct
        || Boolean(
          relatedTemplateUpload.file
          || unifiedTemplate.upload_file
          || hasNewTemplateReferencePhotos
          || String(unifiedTemplate.price_amount || "").trim()
          || manualProduct.related_links?.pattern_product_id
          || manualProduct.related_links?.template_id,
        )
      );
    const creatingPatternOnly = !editingProduct && !shouldSaveProduct && !shouldCreateTemplate && shouldCreatePatternCopy;

    if (!isProductSectionEnabled && !isTemplateSectionEnabled) {
      setManualProductErrorStatus("Select at least one section to save.");
      return;
    }

    if (!editingProduct && !shouldSaveProduct && !shouldCreateTemplate && !shouldCreatePatternCopy) {
      setManualProductErrorStatus("Add a product name, upload a template/pattern file, or select a save mode.");
      return;
    }

    if (
      unifiedTemplate.is_digital_download
      && (!String(unifiedTemplate.price_amount).trim() || Number(unifiedTemplate.price_amount) < 0.5)
    ) {
      setManualProductErrorStatus("Digital downloads require a price of at least $0.50.");
      return;
    }

    const normalizedDimensionsResult = normalizeManualProductDimensions(manualProduct);
    if (normalizedDimensionsResult.error) {
      setManualProductErrorStatus(normalizedDimensionsResult.error);
      return;
    }

    const normalizedDimensions = normalizedDimensionsResult.normalized;

    if (shouldCreateTemplate) {
      if (!unifiedTemplate.name.trim()) {
        setManualProductErrorStatus("Digital template name is required.");
        return;
      }
      if (!unifiedTemplate.upload_file) {
        setManualProductErrorStatus("Upload an SVG, PDF, JPG, or PNG for the digital template.");
        return;
      }
      if (unifiedTemplate.upload_file.size > MAX_TEMPLATE_UPLOAD_BYTES) {
        setManualProductErrorStatus("Digital template file is too large (max 50 MB).");
        return;
      }
    }

    const saveJob = async () => {
      setIsSavingManualProduct(true);
      setManualProductInfoStatus(editingProduct ? "Updating product..." : "Saving listing...");

      try {
      let createdTemplate = null;
      let templateCreatePayload = null;
      let savedProduct = null;
      let processedImages = [];
      let linkedTemplateNotice = "";
      let patternPreferredImageUrl = "";
      let relatedLinks = normalizeRelatedLinksState(manualProduct.related_links);
      const isNotFoundError = (err) => {
        const status = Number(err?.response?.status || 0);
        const code = String(err?.response?.data?.error || "").toLowerCase();
        return status === 404 || code === "not_found";
      };

      if (shouldCreateTemplate) {
        const file = unifiedTemplate.upload_file;
        const fileName = String(file?.name || "").toLowerCase();
        const isPdf = fileName.endsWith(".pdf") || file?.type === "application/pdf";
        const templateType = fileName.endsWith(".svg") ? "svg" : "image";
        let svgContent = "";
        let uploadedImageUrl = "";

        if (templateType === "svg") {
          svgContent = (await readFileAsText(file)).trim();
          if (!svgContent) {
            throw new Error("The uploaded SVG appears to be empty.");
          }
        } else {
          const uploadFile = isPdf ? await pdfToPngFile(file) : file;
          const uploadPayload = new FormData();
          uploadPayload.append("file", uploadFile);
          const uploadResult = await uploadAdminTemplateImage(uploadPayload);
          uploadedImageUrl = String(uploadResult?.image_url || "").trim();
          if (!uploadedImageUrl) {
            throw new Error("Template image upload failed.");
          }
          patternPreferredImageUrl = uploadedImageUrl;
        }

        templateCreatePayload = {
          name: unifiedTemplate.name.trim(),
          category: unifiedTemplate.category.trim() || "Patterns",
          difficulty: unifiedTemplate.difficulty,
          dimensions: unifiedTemplate.dimensions.trim() || 'Letter (8.5" x 11")',
          template_type: templateType,
          is_active: true,
          is_digital_download: Boolean(unifiedTemplate.is_digital_download),
          price_amount: unifiedTemplate.is_digital_download ? Number(unifiedTemplate.price_amount) : null,
          price_currency: "USD",
          related_links: normalizeRelatedLinksPayload(
            isProductSectionEnabled ? manualProduct.related_links : unifiedTemplate.related_links,
          ),
          ...(svgContent ? { svg_content: svgContent } : {}),
          ...(uploadedImageUrl
            ? { image_url: uploadedImageUrl, thumbnail_url: uploadedImageUrl }
            : {}),
        };

        createdTemplate = await createAdminTemplate(templateCreatePayload);
        if (createdTemplate?.id) {
          relatedLinks.template_id = String(createdTemplate.id);
          relatedLinks.template_name = String(createdTemplate.name || unifiedTemplate.name || "").trim();
        }
        if (createdTemplate?.related_links?.pattern_product_id) {
          relatedLinks.pattern_product_id = String(createdTemplate.related_links.pattern_product_id);
          relatedLinks.pattern_product_name = String(
            createdTemplate.related_links.pattern_product_name || unifiedTemplate.name || "",
          ).trim();
        }
      }

      if (shouldSaveProduct) {
      // Upload new File objects to the server; re-upload legacy data: URLs to get server paths.
        // All uploads run in parallel so multiple images don't block each other.
        processedImages = (await Promise.all(
          (manualProduct.images || []).map(async (img) => {
            if (img instanceof File) {
              const formData = new FormData();
              formData.append("file", img);
              const uploadResult = await uploadProductImage(formData);
              const uploadedUrl = String(uploadResult?.image_url || "").trim();
              if (!uploadedUrl) return null;
              return {
                image_url: uploadedUrl,
                media_type: isVideoFile(img) ? "video" : "image",
                ...(uploadResult?.image_data ? { image_data: uploadResult.image_data } : {}),
              };
            }
            if (img.image_url) {
              const existingUrl = String(img.image_url || "").trim();
              // Legacy records may store full data: URLs; re-upload to get a server path.
              if (existingUrl.startsWith("data:") && existingUrl.includes(",")) {
                try {
                  const resp = await fetch(existingUrl);
                  const blob = await resp.blob();
                  const ext = blob.type === "image/png" ? ".png" : blob.type === "image/webp" ? ".webp" : ".jpg";
                  const file = new File([blob], `migrated${ext}`, { type: blob.type });
                  const formData = new FormData();
                  formData.append("file", file);
                  const uploadResult = await uploadProductImage(formData);
                  const uploadedUrl = String(uploadResult?.image_url || "").trim();
                  if (uploadedUrl) {
                    return {
                      image_url: uploadedUrl,
                      media_type: img.media_type || "image",
                      ...(uploadResult?.image_data ? { image_data: uploadResult.image_data } : {}),
                    };
                  }
                } catch {
                  // Fall through to keep the original data: URL as a last resort
                }
              }
              return {
                image_url: existingUrl,
                media_type: img.media_type || "image",
                ...(img.image_data ? { image_data: img.image_data } : {}),
              };
            }
            return null;
          }),
        )).filter(Boolean);

        const linkedTemplateSourceFile = relatedTemplateUpload.file || unifiedTemplate.upload_file;

        if (!createdTemplate?.id && linkedTemplateSourceFile) {
          if (linkedTemplateSourceFile.size > MAX_TEMPLATE_UPLOAD_BYTES) {
            throw new Error("Linked template upload is too large (max 50 MB).");
          }
          const linkedTemplateName = String(relatedTemplateUpload.name || unifiedTemplate.name || "").trim()
            || getNameFromFile(linkedTemplateSourceFile)
            || "Linked Template";
          const linkedTemplateCategory = String(
            relatedTemplateUpload.category || (productModeTemplate && !productModePattern ? "Template" : "Patterns"),
          ).trim() || "Patterns";

          const uploadedFileName = String(linkedTemplateSourceFile?.name || "").toLowerCase();
          const isPdfUpload = uploadedFileName.endsWith(".pdf") || linkedTemplateSourceFile?.type === "application/pdf";
          const fileForUpload = isPdfUpload
            ? await pdfToPngFile(linkedTemplateSourceFile)
            : linkedTemplateSourceFile;
          const fileType = String(fileForUpload?.type || "");
          if (!fileType.startsWith("image/")) {
            throw new Error("Linked template upload supports PDF or image files only.");
          }

          const uploadPayload = new FormData();
          uploadPayload.append("file", fileForUpload);
          const uploadResult = await uploadAdminTemplateImage(uploadPayload);
          const uploadedImageUrl = String(uploadResult?.image_url || "").trim();
          if (!uploadedImageUrl) {
            throw new Error("Linked template image upload failed.");
          }
          patternPreferredImageUrl = uploadedImageUrl;

          const uploadedTemplate = await createAdminTemplate({
            name: linkedTemplateName,
            category: linkedTemplateCategory,
            template_type: "image",
            image_url: uploadedImageUrl,
            thumbnail_url: uploadedImageUrl,
            is_active: true,
            is_digital_download: false,
          });

          if (uploadedTemplate?.id) {
            setProductTemplateOptions((prev) => {
              const exists = prev.some((entry) => String(entry.id) === String(uploadedTemplate.id));
              if (exists) return prev;
              return [{ id: uploadedTemplate.id, name: String(uploadedTemplate.name || "").trim(), thumbnail_url: String(uploadedTemplate.thumbnail_url || uploadedTemplate.image_url || "").trim() }, ...prev];
            });
            relatedLinks.template_id = String(uploadedTemplate.id);
              relatedLinks.template_name = String(
                uploadedTemplate.name || relatedTemplateUpload.name || unifiedTemplate.name || "",
              ).trim();
            linkedTemplateNotice = relatedLinks.template_name || linkedTemplateName;
          }
        }

        if (relatedGalleryUpload.file) {
          const uploadFile = relatedGalleryUpload.file;
          if (!String(uploadFile?.type || "").startsWith("image/")) {
            throw new Error("Linked gallery upload supports image files only.");
          }
          if (uploadFile.size > MAX_GALLERY_UPLOAD_BYTES) {
            throw new Error("Linked gallery image is too large (max 20 MB).");
          }

          const panelName = String(relatedGalleryUpload.panel_name || "").trim()
            || getNameFromFile(uploadFile)
            || "Linked Gallery";

          const uploadPayload = new FormData();
          uploadPayload.append("panel_name", panelName);
          uploadPayload.append("description", String(relatedGalleryUpload.description || "").trim());
          uploadPayload.append("category", String(relatedGalleryUpload.category || "").trim());
          uploadPayload.append("template_id", String(relatedGalleryUpload.template_id || "").trim());
          uploadPayload.append("display_name", "SGCG Art");
          uploadPayload.append("hide_submitter_name", "false");
          uploadPayload.append("photos", uploadFile);

          const galleryResult = await submitGalleryPhoto(uploadPayload);
          const galleryItems = Array.isArray(galleryResult?.items)
            ? galleryResult.items
            : Array.isArray(galleryResult)
              ? galleryResult
              : [];
          const createdGallery = galleryItems[0] || galleryResult?.photo || galleryResult;

          if (createdGallery?.id) {
            const createdGalleryId = String(createdGallery.id);
            const createdPanelName = String(createdGallery.panel_name || panelName).trim();
            const createdTemplateId = createdGallery.template_id
              ? String(createdGallery.template_id)
              : String(relatedGalleryUpload.template_id || "").trim();

            relatedLinks.gallery_photo_id = createdGalleryId;
            relatedLinks.gallery_panel_name = createdPanelName;
            relatedLinks.gallery_template_id = createdTemplateId;

            setProductGalleryOptions((prev) => {
              const exists = prev.some((entry) => String(entry.id) === createdGalleryId);
              if (exists) return prev;
              return [
                {
                  id: Number(createdGallery.id),
                  panel_name: createdPanelName || `Photo #${createdGalleryId}`,
                  template_id: createdTemplateId ? Number(createdTemplateId) : null,
                },
                ...prev,
              ];
            });
          }
        }

        if (createdTemplate?.id) {
          relatedLinks.template_id = String(createdTemplate.id);
          relatedLinks.template_name = String(createdTemplate.name || unifiedTemplate.name || "").trim();
        }

        const resolvedIsDigitalProduct = !productModePhysical && (productModePattern || productModeTemplate);

        const shouldManagePatternReferencePhotos = resolvedIsDigitalProduct && (
          selectedTypeCategory === "patterns" || isEditingDigitalPatternProduct
        );
        let productImagesForSave = processedImages;
        if (shouldManagePatternReferencePhotos) {
          const referenceImages = (await Promise.all(
            templateRefPhotos.map(async (entry) => {
              const file = entry?.file;
              if (file instanceof File) {
                if (!String(file.type || "").startsWith("image/")) return null;
                const formData = new FormData();
                formData.append("file", file);
                const uploadResult = await uploadProductImage(formData);
                const uploadedUrl = String(uploadResult?.image_url || "").trim();
                if (!uploadedUrl) return null;
                return { image_url: uploadedUrl, media_type: "image" };
              }
              return normalizeStoredProductImage({
                image_url: entry?.image_url || entry?.src,
                media_type: "image",
                image_data: entry?.image_data,
              }) || null;
            }),
          )).filter(Boolean);

          const imageEntries = productImagesForSave.filter(
            (entry) => String(entry?.media_type || entry?.type || "image").toLowerCase() !== "video",
          );
          const primaryPatternImage = imageEntries.slice(0, 1);
          const remainingPatternImages = isEditingDigitalPatternProduct
            ? []
            : imageEntries.slice(1);
          productImagesForSave = mergeUniqueProductImages([
            ...primaryPatternImage,
            ...referenceImages,
            ...remainingPatternImages,
          ]);
        }

        const productData = {
          // price field stores sale price when discount is present.
          name: manualProduct.name.trim(),
          description: manualProduct.description.trim(),
          category: (() => {
            const baseCategory = manualProduct.category.length > 0 ? manualProduct.category : [];
            if (resolvedIsDigitalProduct && productModePattern && !baseCategory.some(c => String(c).toLowerCase().includes('pattern'))) {
              return ['Patterns', ...baseCategory];
            }
            return baseCategory.length > 0 ? baseCategory : null;
          })(),
          materials:
            manualProduct.materials.length > 0 ? manualProduct.materials : null,
          width: normalizedDimensions.width,
          height: normalizedDimensions.height,
          depth: normalizedDimensions.depth,
          price: (() => {
            if (resolvedIsDigitalProduct) {
              const digitalPrice = Number(unifiedTemplate.price_amount || 0);
              return Number.isFinite(digitalPrice) && digitalPrice > 0 ? Number(digitalPrice.toFixed(2)) : 0;
            }
            const basePrice = Number(manualProduct.price || 0);
            const discountPercent = Number(manualProduct.discount_percent || 0);
            if (!Number.isFinite(basePrice) || basePrice <= 0) return 0;
            if (!Number.isFinite(discountPercent) || discountPercent <= 0) return Number(basePrice.toFixed(2));
            const bounded = Math.min(100, Math.max(0, discountPercent));
            return Number((basePrice * (1 - bounded / 100)).toFixed(2));
          })(),
          old_price: (() => {
            const basePrice = Number(manualProduct.price || 0);
            const discountPercent = Number(manualProduct.discount_percent || 0);
            if (!Number.isFinite(basePrice) || basePrice <= 0) return null;
            if (!Number.isFinite(discountPercent) || discountPercent <= 0) return null;
            return Number(basePrice.toFixed(2));
          })(),
          discount_percent: (() => {
            const discountPercent = Number(manualProduct.discount_percent || 0);
            if (!Number.isFinite(discountPercent) || discountPercent <= 0) return null;
            return Number(Math.min(100, Math.max(0, discountPercent)).toFixed(2));
          })(),
          quantity: resolvedIsDigitalProduct
            ? parseInt(DIGITAL_DEFAULT_QUANTITY, 10)
            : normalizeQuantityInput(manualProduct.quantity, false),
          is_featured: manualProduct.is_featured,
          is_home_featured: manualProduct.is_home_featured,
          is_digital_download: resolvedIsDigitalProduct,
          related_links: toManualRelatedLinksPayload(relatedLinks),
          images: productImagesForSave,
        };

        if (editingProduct) {
          try {
            savedProduct = await onUpdateManualProduct(editingProduct.id, productData);
            setStatus(
              linkedTemplateNotice
                ? `Product updated successfully. Linked pattern/template: ${linkedTemplateNotice}.`
                : "Product updated successfully!",
            );
          } catch (error) {
            if (!isNotFoundError(error)) {
              throw error;
            }
            savedProduct = await onAddManualProduct(productData);
            setStatus(
              linkedTemplateNotice
                ? `Original product was missing, so a new one was created. Linked pattern/template: ${linkedTemplateNotice}.`
                : "Original product was missing, so a new product was created.",
            );
          }
        } else {
          savedProduct = await onAddManualProduct(productData);
        }
      }

      if (shouldCreatePatternCopy) {
        const patternTypeLabel = PRODUCT_TYPE_LABEL_BY_KEY.patterns || "Patterns";
        const nonTypeCategories = removeTypeCategories(manualProduct.category || []);
        const existingPatternIdRaw = (() => {
          if (relatedLinks.pattern_product_id) {
            return Number(relatedLinks.pattern_product_id);
          }
          if (createdTemplate?.related_links?.pattern_product_id) {
            return Number(createdTemplate.related_links.pattern_product_id);
          }
          if (unifiedTemplate.related_links?.pattern_product_id) {
            return Number(unifiedTemplate.related_links.pattern_product_id);
          }

          const linkedTemplateId = relatedLinks.template_id
            ? Number(relatedLinks.template_id)
            : createdTemplate?.id
              ? Number(createdTemplate.id)
              : null;
          if (!Number.isFinite(linkedTemplateId)) {
            return null;
          }

          const matchedPattern = normalizedManualProducts.find((entry) => {
            const entryId = Number(entry?.id);
            if (!Number.isFinite(entryId)) return false;
            if (editingProduct && entryId === Number(editingProduct.id)) return false;
            if (!entry?.is_digital_download) return false;

            const entryLinks = entry?.related_links && typeof entry.related_links === "object"
              ? entry.related_links
              : null;
            const entryTemplateId = entryLinks?.template_id ? Number(entryLinks.template_id) : null;
            return Number.isFinite(entryTemplateId) && entryTemplateId === linkedTemplateId;
          });

          return matchedPattern?.id ? Number(matchedPattern.id) : null;
        })();
        const hasLinkedPatternInCatalog = Number.isFinite(existingPatternIdRaw)
          && normalizedManualProducts.some((entry) => Number(entry?.id) === Number(existingPatternIdRaw));
        // Guard: never update the editing product itself as if it were the pattern product
        // (self-referential pattern_product_id corrupts the physical product)
        const existingPatternId = !hasLinkedPatternInCatalog
          ? null
          : editingProduct && existingPatternIdRaw === Number(editingProduct.id)
            ? null
            : existingPatternIdRaw;

        const referenceImages = (await Promise.all(
          templateRefPhotos.map(async (entry) => {
            const file = entry?.file;
            if (file instanceof File) {
              if (!String(file.type || "").startsWith("image/")) return null;
              const formData = new FormData();
              formData.append("file", file);
              const uploadResult = await uploadProductImage(formData);
              const uploadedUrl = String(uploadResult?.image_url || "").trim();
              if (!uploadedUrl) return null;
              return { image_url: uploadedUrl, media_type: "image" };
            }
            return normalizeStoredProductImage({
              image_url: entry?.image_url || entry?.src,
              media_type: "image",
              image_data: entry?.image_data,
            }) || null;
          }),
        )).filter(Boolean);

        if (!patternPreferredImageUrl && relatedLinks.template_id) {
          const selectedTemplate = productTemplateOptions.find(
            (entry) => String(entry?.id) === String(relatedLinks.template_id),
          );
          patternPreferredImageUrl = String(
            selectedTemplate?.thumbnail_url || selectedTemplate?.image_url || "",
          ).trim();
        }

        const preferredTemplateImage = patternPreferredImageUrl
          ? [{ image_url: patternPreferredImageUrl, media_type: "image" }]
          : [];

        const fallbackProductImages = processedImages.filter((entry) => {
          const mediaType = String(entry.media_type || entry.type || "").toLowerCase();
          return mediaType !== "video";
        });

        const rawPatternImages = mergeUniqueProductImages([
          ...preferredTemplateImage,
          ...referenceImages,
          ...fallbackProductImages,
        ]);

        if (rawPatternImages.length === 0 && unifiedTemplate.upload_file) {
          const uploadFile = (() => {
            const fileName = String(unifiedTemplate.upload_file?.name || "").toLowerCase();
            const isPdf = fileName.endsWith(".pdf") || unifiedTemplate.upload_file?.type === "application/pdf";
            return isPdf ? null : unifiedTemplate.upload_file;
          })();
          if (uploadFile && String(uploadFile.type || "").startsWith("image/")) {
            const formData = new FormData();
            formData.append("file", uploadFile);
            const uploadResult = await uploadProductImage(formData);
            const uploadedUrl = String(uploadResult?.image_url || "").trim();
            if (uploadedUrl) {
              rawPatternImages.push({
                image_url: uploadedUrl,
                media_type: "image",
              });
            }
          }
        }

        // Keep the same image set for the derived pattern. Legacy data URLs are re-uploaded
        // earlier when possible, and retaining fallback URLs prevents empty-image pattern copies.
        const patternImages = rawPatternImages;

        const resolvedPatternDescription = String(
          manualProduct.description
          || patternOnlyDescription
          || `Digital pattern download for ${manualProduct.name || unifiedTemplate.name || "this design"}`,
        ).trim();

        const patternProductData = {
          name: String(manualProduct.name || unifiedTemplate.name || "Pattern").trim(),
          description: resolvedPatternDescription,
          category: [patternTypeLabel, ...nonTypeCategories],
          materials: manualProduct.materials.length > 0 ? manualProduct.materials : null,
          width: normalizedDimensions.width,
          height: normalizedDimensions.height,
          depth: normalizedDimensions.depth,
          price: (() => {
            const digitalPrice = Number(unifiedTemplate.price_amount);
            if (Number.isFinite(digitalPrice) && digitalPrice > 0) {
              return Number(digitalPrice.toFixed(2));
            }
            const basePrice = Number(manualProduct.price || 0);
            return Number.isFinite(basePrice) && basePrice > 0 ? Number(basePrice.toFixed(2)) : 0;
          })(),
          old_price: null,
          discount_percent: null,
          quantity: parseInt(DIGITAL_DEFAULT_QUANTITY, 10),
          is_featured: false,
          is_home_featured: false,
          is_digital_download: true,
          related_links: {
            template_id: relatedLinks.template_id ? Number(relatedLinks.template_id) : (createdTemplate?.id || null),
            template_name: relatedLinks.template_name || (createdTemplate?.name || unifiedTemplate.name || null),
            pattern_product_id: existingPatternId,
            pattern_product_name: String(manualProduct.name || unifiedTemplate.name || "").trim() || null,
            linked_product_id: relatedLinks.linked_product_id ? Number(relatedLinks.linked_product_id) : null,
            linked_product_name: relatedLinks.linked_product_name || null,
            gallery_photo_id: null,
            gallery_panel_name: null,
            gallery_template_id: null,
          },
          images: patternImages,
          // In edit mode with an existing pattern, omit the images key entirely when we have
          // no clean server-hosted images to send – this preserves the pattern's stored photos.
          ...(editingProduct && existingPatternId && patternImages.length === 0 ? { images: undefined } : {}),
        };

        let savedPatternProduct = null;
        if (existingPatternId) {
          try {
            savedPatternProduct = await onUpdateManualProduct(existingPatternId, patternProductData);
          } catch (error) {
            if (!isNotFoundError(error)) {
              throw error;
            }

            // The previously linked pattern was deleted; create a fresh replacement.
            const fallbackPatternData = {
              ...patternProductData,
              related_links: {
                ...(patternProductData.related_links || {}),
                pattern_product_id: null,
              },
            };
            savedPatternProduct = await onAddManualProduct(fallbackPatternData);
          }
        } else {
          savedPatternProduct = await onAddManualProduct(patternProductData);
        }
        if (savedPatternProduct?.id) {
          relatedLinks.pattern_product_id = String(savedPatternProduct.id);
          relatedLinks.pattern_product_name = String(
            savedPatternProduct.name || patternProductData.name || "",
          ).trim();

          if (savedProduct?.id) {
            await onUpdateManualProduct(savedProduct.id, {
              related_links: toManualRelatedLinksPayload(relatedLinks),
            });
          }
        }
      }

      const linkedTemplateIdForUpdate = !createdTemplate?.id && relatedLinks.template_id
        ? Number(relatedLinks.template_id)
        : null;
      if (linkedTemplateIdForUpdate && productModePattern) {
        await updateAdminTemplate(linkedTemplateIdForUpdate, {
          name: String(unifiedTemplate.name || relatedLinks.template_name || manualProduct.name || "").trim() || `Template #${linkedTemplateIdForUpdate}`,
          category: String(unifiedTemplate.category || "").trim() || "Patterns",
          difficulty: unifiedTemplate.difficulty,
          dimensions: String(unifiedTemplate.dimensions || "").trim() || 'Letter (8.5" x 11")',
          is_digital_download: Boolean(unifiedTemplate.is_digital_download),
          price_amount: unifiedTemplate.is_digital_download ? Number(unifiedTemplate.price_amount) : null,
          price_currency: "USD",
          related_links: normalizeRelatedLinksPayload({
            ...createDefaultRelatedLinks(),
            ...(manualProduct.related_links || {}),
            ...(unifiedTemplate.related_links || {}),
            template_id: linkedTemplateIdForUpdate,
            template_name: String(unifiedTemplate.name || relatedLinks.template_name || manualProduct.name || "").trim() || null,
            pattern_product_id: relatedLinks.pattern_product_id ? Number(relatedLinks.pattern_product_id) : null,
            pattern_product_name: relatedLinks.pattern_product_name || null,
            linked_product_id: relatedLinks.linked_product_id ? Number(relatedLinks.linked_product_id) : null,
            linked_product_name: relatedLinks.linked_product_name || null,
            gallery_photo_id: relatedLinks.gallery_photo_id ? Number(relatedLinks.gallery_photo_id) : null,
            gallery_panel_name: relatedLinks.gallery_panel_name || null,
            gallery_template_id: relatedLinks.gallery_template_id ? Number(relatedLinks.gallery_template_id) : null,
          }),
        });
      }

      if (addImagesToGallerySnapshot && savedProduct?.id && firstGalleryImagePreviewSnapshot.length > 0) {
        const [firstGalleryEntry] = firstGalleryImagePreviewSnapshot;
        let firstGalleryFile = null;

        if (firstGalleryEntry?.file instanceof File) {
          firstGalleryFile = firstGalleryEntry.file;
        } else {
          const existingIndex = String(firstGalleryEntry?.id || "").startsWith("existing-")
            ? Number(String(firstGalleryEntry.id).replace("existing-", ""))
            : NaN;
          const existingImage = Number.isFinite(existingIndex)
            ? manualProductSnapshot?.images?.[existingIndex]
            : null;
          const fallbackBaseName = `${savedProduct.name || manualProductSnapshot.name || "product-gallery"}-1`;
          firstGalleryFile = await createGalleryUploadFileFromImage(existingImage, fallbackBaseName);
        }

        if (!(firstGalleryFile instanceof File)) {
          throw new Error("Unable to prepare the selected product photos for gallery upload.");
        }

        const galleryPayload = new FormData();
        galleryPayload.append(
          "panel_name",
          String(savedProduct.name || manualProductSnapshot.name || "Product Gallery").trim(),
        );
        galleryPayload.append("description", String(manualProductSnapshot.description || "").trim());
        galleryPayload.append("category", String(selectedTypeCategorySnapshot || "").trim());
        if (relatedLinks.template_id || createdTemplate?.id) {
          galleryPayload.append("template_id", String(relatedLinks.template_id || createdTemplate.id));
        }
        galleryPayload.append("display_name", "SGCG Art");
        galleryPayload.append("hide_submitter_name", "false");
        galleryPayload.append("photos", firstGalleryFile);

        const galleryResult = await submitGalleryPhoto(galleryPayload);
        const galleryItems = Array.isArray(galleryResult?.items)
          ? galleryResult.items
          : Array.isArray(galleryResult)
            ? galleryResult
            : [];
        const firstCreated = galleryItems[0] || galleryResult?.photo || galleryResult;

        if (firstCreated?.id) {
          const firstGalleryId = Number(firstCreated.id);
          const firstGalleryPanelName = String(
            firstCreated.panel_name || savedProduct.name || manualProductSnapshot.name || "Product Gallery",
          ).trim();
          const firstGalleryTemplateId = firstCreated.template_id
            ? Number(firstCreated.template_id)
            : relatedLinks.template_id
              ? Number(relatedLinks.template_id)
              : null;

          relatedLinks.gallery_photo_id = String(firstGalleryId);
          relatedLinks.gallery_panel_name = firstGalleryPanelName;
          relatedLinks.gallery_template_id = firstGalleryTemplateId ? String(firstGalleryTemplateId) : "";

          await onUpdateManualProduct(savedProduct.id, {
            related_links: {
              template_id: relatedLinks.template_id
                ? Number(relatedLinks.template_id)
                : null,
              template_name: relatedLinks.template_name || null,
              pattern_product_id: relatedLinks.pattern_product_id
                ? Number(relatedLinks.pattern_product_id)
                : null,
              pattern_product_name: relatedLinks.pattern_product_name || null,
              linked_product_id: relatedLinks.linked_product_id
                ? Number(relatedLinks.linked_product_id)
                : null,
              linked_product_name: relatedLinks.linked_product_name || null,
              gallery_photo_id: firstGalleryId,
              gallery_panel_name: firstGalleryPanelName,
              gallery_template_id: firstGalleryTemplateId,
            },
          });

          setProductGalleryOptions((prev) => {
            const exists = prev.some((entry) => String(entry.id) === String(firstGalleryId));
            if (exists) return prev;
            return [
              {
                id: firstGalleryId,
                panel_name: firstGalleryPanelName || `Photo #${firstGalleryId}`,
                template_id: firstGalleryTemplateId,
              },
              ...prev,
            ];
          });
        }
      }

      if (createdTemplate?.id && templateCreatePayload) {
        const currentTemplateLinks = {
          ...createDefaultRelatedLinks(),
          ...(createdTemplate.related_links || {}),
          ...(templateCreatePayload.related_links || {}),
        };
        const nextTemplateLinks = {
          ...currentTemplateLinks,
          pattern_product_id: relatedLinks.pattern_product_id ? Number(relatedLinks.pattern_product_id) : null,
          pattern_product_name: relatedLinks.pattern_product_name || null,
          gallery_photo_id: relatedLinks.gallery_photo_id ? Number(relatedLinks.gallery_photo_id) : null,
          gallery_panel_name: relatedLinks.gallery_panel_name || null,
          gallery_template_id: relatedLinks.gallery_template_id ? Number(relatedLinks.gallery_template_id) : null,
        };

        await updateAdminTemplate(createdTemplate.id, {
          ...templateCreatePayload,
          related_links: normalizeRelatedLinksPayload(nextTemplateLinks),
        });
      }

      if (typeof onRefreshCatalog === "function") {
        await onRefreshCatalog();
      }

      if (creatingBoth) {
        setStatus("Digital template and product listing created successfully!");
      } else if (creatingTemplateOnly) {
        setStatus("Digital template created successfully!");
      } else if (creatingPatternOnly) {
        setStatus("Pattern-only listing created successfully!");
      } else if (!editingProduct) {
        setStatus("Manual product added successfully!");
      }

      // Close modal and reset state after a successful save so gallery uploads
      // and related-link updates can complete against the current form state.
      setShowManualProductModal(false);
      setEditingProduct(null);
      setManualProduct(createEmptyManualProduct());
      setQuantityManuallyEdited(false);
      setUnifiedTemplate(createEmptyUnifiedTemplate());
      setRelatedTemplateUpload(createEmptyRelatedTemplateUpload());
      setRelatedGalleryUpload(createEmptyRelatedGalleryUpload());
      setImagePreviews([]);
      setEnableWatermark(true); // Always reset to true after submission
      setWatermarkText("SGCG ART GLASS"); // Reset to default text
      setAddImagesToGallery(false);
      setTemplateRefPhotos([]);
      setTemplateNameManuallyEdited(false);
      setPatternOnlyDescription("");
      setProductModePhysical(true);
      setProductModePattern(false);
      setProductModeTemplate(false);
      await loadManualProductLinkOptions();
      } catch (error) {
        // Check if it's an authentication error
        if (
          error.message.includes("Unauthorized") ||
          error.message.includes("401")
        ) {
          setManualProductErrorStatus("Session expired. Please log out and log back in.");
        } else {
          setManualProductErrorStatus(
            `Error: ${
              error?.response?.data?.detail
              || error?.response?.data?.error
              || error.message
            }`,
          );
        }
      } finally {
        setIsSavingManualProduct(false);
      }
    };

    const saveJobId = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `manual-product-save-${Date.now()}`;
    const queuedProductName = String(manualProductSnapshot.name || manualProduct.name || "product").trim() || "product";
    const queuedJobLabel = editingProduct
      ? `Update ${queuedProductName}`
      : `Add ${queuedProductName}`;

    setManualProductSaveQueue((prev) => [...prev, {
      id: saveJobId,
      label: queuedJobLabel,
      run: saveJob,
    }]);
    setManualProductInfoStatus(`${queuedJobLabel} queued in the background.`);
    setManualProductStatusTone("neutral");
    setShowManualProductModal(false);
    return;
  };

  const handleEditProduct = async (product) => {
    setIsOpeningProductEdit(true);
    try {
    let productRecord = product;

    try {
      const fullProduct = await fetchManualProduct(product.id);
      if (fullProduct && typeof fullProduct === "object") {
        productRecord = fullProduct;
      }
    } catch (error) {
      console.error("[AdminDashboard] Failed to load full product details for edit:", error);
      setStatus("Using catalog data only because full product details could not be loaded.");
    }

    const inferredType = inferProductType(productRecord);
    const existingCategories = Array.isArray(productRecord.category)
      ? productRecord.category
      : productRecord.category
        ? [productRecord.category]
        : [];
    const normalizedCategories = [
      PRODUCT_TYPE_LABEL_BY_KEY[inferredType] ||
        PRODUCT_TYPE_LABEL_BY_KEY.stainedGlassPanels,
      ...removeTypeCategories(existingCategories),
    ];

    await loadManualProductLinkOptions();
    setProductType(inferredType);
    setEditingProduct(productRecord);
    const isDigitalPatternProduct = Boolean(productRecord.is_digital_download);
    const existingImages = (productRecord.images || []).map((img, idx) => ({
      id: `existing-${idx}`,
      src: resolveImageObjectToUrl(img),
      type: img.media_type === "video" ? "video" : "image",
      image_url: String(img?.image_url || "").trim(),
      image_data: img?.image_data,
      isExisting: true,
    }));
    setImagePreviews(isDigitalPatternProduct ? [] : existingImages);
    const existingRelatedLinks =
      productRecord?.related_links && typeof productRecord.related_links === "object"
        ? productRecord.related_links
        : createDefaultRelatedLinks();
    const linkedTemplateId = existingRelatedLinks?.template_id ? Number(existingRelatedLinks.template_id) : null;
    let linkedTemplateDetails = null;
    if (Number.isFinite(linkedTemplateId) && linkedTemplateId > 0) {
      try {
        linkedTemplateDetails = await getTemplate(linkedTemplateId);
      } catch (error) {
        console.warn("[AdminDashboard] Failed to load linked template details for edit:", error);
      }
    }
    const existingPatternImages = isDigitalPatternProduct
      ? (productRecord.images || []).filter((img) => String(img?.media_type || "image").toLowerCase() !== "video")
      : [];
    const existingPatternUploadPreview = isDigitalPatternProduct
      ? (() => {
          const firstImage = existingPatternImages[0] || null;
          const previewUrl = firstImage ? resolveImageObjectToUrl(firstImage) : "";
          if (!previewUrl) {
            return null;
          }
          return {
            name: String(productRecord.name || "Current pattern image").trim() || "Current pattern image",
            url: previewUrl,
            media_type: String(firstImage?.media_type || "image").toLowerCase(),
          };
        })()
      : null;
    const existingTemplateReferencePhotos = isDigitalPatternProduct
      ? existingPatternImages.slice(1).map((img, idx) => ({
          id: `template-ref-existing-${idx}`,
          src: resolveImageObjectToUrl(img),
          image_url: String(img?.image_url || "").trim(),
          image_data: img?.image_data,
          isExisting: true,
        })).filter((img) => img.src)
      : [];

    setManualProduct({
      name: productRecord.name || "",
      images: productRecord.images || [],
      description: productRecord.description || "",
      category: normalizedCategories,
      materials: Array.isArray(productRecord.materials)
        ? productRecord.materials
        : productRecord.materials
          ? [productRecord.materials]
          : [],
      width: productRecord.width?.toString() || "",
      height: productRecord.height?.toString() || "",
      depth: productRecord.depth?.toString() || "",
      price: (() => {
        if (productRecord.is_digital_download) {
          return "";
        }
        const regular = Number(productRecord.old_price || productRecord.price || 0);
        return Number.isFinite(regular) && regular > 0 ? regular.toString() : "";
      })(),
      discount_percent: (() => {
        const explicit = Number(productRecord.discount_percent || 0);
        if (Number.isFinite(explicit) && explicit > 0) return explicit.toString();
        const regular = Number(productRecord.old_price || 0);
        const sale = Number(productRecord.price || 0);
        if (regular > 0 && sale > 0 && regular > sale) {
          return Number((((regular - sale) / regular) * 100).toFixed(2)).toString();
        }
        return "";
      })(),
      quantity: syncQuantityWithDownloadMode(
        productRecord.quantity?.toString() || "",
        Boolean(productRecord.is_digital_download),
      ),
      is_featured: productRecord.is_featured === 1 || productRecord.is_featured === true,
      is_home_featured: productRecord.is_home_featured === 1 || productRecord.is_home_featured === true,
      is_digital_download: Boolean(productRecord.is_digital_download),
      related_links: normalizeRelatedLinksState({
        ...existingRelatedLinks,
        template_id: existingRelatedLinks?.template_id ? String(existingRelatedLinks.template_id) : "",
        pattern_product_id: existingRelatedLinks?.pattern_product_id ? String(existingRelatedLinks.pattern_product_id) : "",
        linked_product_id: existingRelatedLinks?.linked_product_id ? String(existingRelatedLinks.linked_product_id) : "",
        gallery_photo_id: existingRelatedLinks?.gallery_photo_id ? String(existingRelatedLinks.gallery_photo_id) : "",
        gallery_template_id: existingRelatedLinks?.gallery_template_id ? String(existingRelatedLinks.gallery_template_id) : "",
      }),
    });
    setUnifiedTemplate({
      ...createEmptyUnifiedTemplate(),
      name: String(linkedTemplateDetails?.name || productRecord.name || "").trim(),
      category: String(linkedTemplateDetails?.category || "").trim(),
      difficulty: linkedTemplateDetails?.difficulty || TEMPLATE_DIFFICULTY_OPTIONS[0],
      dimensions: String(linkedTemplateDetails?.dimensions || "").trim(),
      is_digital_download: Boolean(
        linkedTemplateDetails?.is_digital_download ?? productRecord.is_digital_download,
      ),
      price_amount: (() => {
        const linkedPrice = linkedTemplateDetails?.price_amount;
        if (linkedPrice !== null && linkedPrice !== undefined && linkedPrice !== "") {
          return String(linkedPrice);
        }
        if (productRecord.is_digital_download) {
          const productPrice = Number(productRecord.price || 0);
          return Number.isFinite(productPrice) && productPrice > 0 ? String(productPrice) : "";
        }
        return "";
      })(),
      existing_upload_preview: existingPatternUploadPreview,
      related_links: {
        ...createDefaultRelatedLinks(),
        ...(linkedTemplateDetails?.related_links || {}),
      },
    });
    setRelatedTemplateUpload(createEmptyRelatedTemplateUpload());
    setRelatedGalleryUpload(createEmptyRelatedGalleryUpload());
    setCategoryInput("");
    setMaterialInput("");
    setTemplateRefPhotos(existingTemplateReferencePhotos);
    clearManualProductStatus();
    setShowManualProductModal(true);
    setQuantityManuallyEdited(true);
    setTemplateNameManuallyEdited(false);
    setPatternOnlyDescription(String(productRecord.description || ""));
    setProductModePhysical(!productRecord.is_digital_download);
    setProductModePattern(Boolean(productRecord.is_digital_download));
    setProductModeTemplate(false);
    } finally {
      setIsOpeningProductEdit(false);
    }
  };

  const handleDeleteProduct = async (product) => {
    const confirmDelete = window.confirm(
      `⚠️ Delete Product?\n\nAre you sure you want to permanently delete "${product.name}"?\n\nThis action cannot be undone.`,
    );
    if (confirmDelete) {
      setActiveProductDeleteId(String(product?.id || ""));
      try {
        setStatus("Deleting product...");
        await onDeleteManualProduct(product.id);
        setStatus("Product deleted successfully!");
      } catch (error) {
        if (
          error.message.includes("Unauthorized") ||
          error.message.includes("401")
        ) {
          setStatus("Session expired. Please log out and log back in.");
        } else {
          setStatus(`Error deleting product: ${error.message}`);
        }
      } finally {
        setActiveProductDeleteId("");
      }
    }
  };

  const handleToggleProductActive = async (product) => {
    const productId = String(product?.id || "");
    if (!productId) return;

    const isCurrentlyActive = product?.is_active !== 0 && product?.is_active !== false;
    const nextActive = !isCurrentlyActive;
    const confirmMessage = nextActive
      ? `Reactivate "${product.name}" and show it on the site?`
      : `Deactivate "${product.name}" and remove it from the site?`;

    if (!window.confirm(confirmMessage)) {
      return;
    }

    setActiveProductToggleId(productId);
    try {
      setStatus(nextActive ? "Activating product..." : "Deactivating product...");
      await onUpdateManualProduct(product.id, {
        ...product,
        is_active: nextActive,
      });
      setStatus(nextActive ? "Product activated." : "Product deactivated.");
    } catch (error) {
      if (
        error.message.includes("Unauthorized") ||
        error.message.includes("401")
      ) {
        setStatus("Session expired. Please log out and log back in.");
      } else {
        setStatus(`Error updating product visibility: ${error.message}`);
      }
    } finally {
      setActiveProductToggleId("");
    }
  };

  const handleToggleProductFeatured = async (product) => {
    const productId = String(product?.id || "");
    if (!productId) return;

    const isCurrentlyFeatured = product?.is_featured === 1 || product?.is_featured === true;
    const nextFeatured = !isCurrentlyFeatured;

    setActiveProductFeaturedId(productId);
    try {
      setStatus(nextFeatured ? "Marking product as featured..." : "Removing featured status...");
      await onUpdateManualProduct(product.id, {
        ...product,
        is_featured: nextFeatured,
      });
      setStatus(nextFeatured ? "Product marked as featured." : "Featured status removed.");
    } catch (error) {
      if (
        error.message.includes("Unauthorized") ||
        error.message.includes("401")
      ) {
        setStatus("Session expired. Please log out and log back in.");
      } else {
        setStatus(`Error updating featured status: ${error.message}`);
      }
    } finally {
      setActiveProductFeaturedId("");
    }
  };

  const handleToggleProductHomeFeatured = async (product) => {
    const productId = String(product?.id || "");
    if (!productId) return;

    const isCurrentlyHomeFeatured = product?.is_home_featured === 1 || product?.is_home_featured === true;
    const nextHomeFeatured = !isCurrentlyHomeFeatured;

    setActiveProductHomeFeaturedId(productId);
    try {
      setStatus(nextHomeFeatured ? "Adding product to home carousel..." : "Removing product from home carousel...");
      await onUpdateManualProduct(product.id, {
        ...product,
        is_home_featured: nextHomeFeatured,
      });
      setStatus(nextHomeFeatured ? "Product added to home carousel." : "Product removed from home carousel.");
    } catch (error) {
      const detail = error?.response?.data?.detail || "";
      const code = error?.response?.data?.error || "";
      if (code === "home_featured_limit_reached") {
        setManualProductErrorStatus(detail || "Home page carousel limit met (20). Remove a home page feature before adding more.");
      } else if (
        error.message.includes("Unauthorized") ||
        error.message.includes("401")
      ) {
        setManualProductErrorStatus("Session expired. Please log out and log back in.");
      } else {
        setManualProductErrorStatus(`Error updating home carousel status: ${detail || error.message}`);
      }
    } finally {
      setActiveProductHomeFeaturedId("");
    }
  };

  const openFacebookShareDialog = (product) => {
    const productId = String(product?.id || "").trim();
    if (!productId) {
      setStatus("Unable to share this product right now.");
      return false;
    }

    const productLink = `${window.location.origin}/#/product/m-${productId}`;
    const rawPrice = Number(product?.price || 0);
    const priceText = Number.isFinite(rawPrice) && rawPrice > 0 ? `$${rawPrice}` : "";
    const quote = [product?.name || "Manual Product", priceText, productLink]
      .filter(Boolean)
      .join(" · ");
    const shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(productLink)}&quote=${encodeURIComponent(quote)}`;

    const popup = window.open(
      shareUrl,
      "facebook-share",
      "noopener,noreferrer,width=700,height=680",
    );

    if (!popup) {
      setStatus("Popup blocked. Please allow popups for this site to share on Facebook.");
      return false;
    }

    return true;
  };

  const handleShareProductToFacebook = async (product) => {
    const productId = String(product?.id || "").trim();
    if (!productId) {
      setStatus("Unable to share this product right now.");
      return;
    }

    setActiveFacebookShareId(productId);
    try {
      await publishManualProductToFacebook(productId);
      setFacebookPostedProductIds((prev) => ({
        ...prev,
        [productId]: true,
      }));
      setStatus(`Posted "${product?.name || "product"}" directly to your Facebook page.`);
      return;
    } catch (error) {
      const apiError = error?.response?.data?.error;
      if (apiError === "facebook_not_configured") {
        const opened = openFacebookShareDialog(product);
        if (opened) {
          setFacebookPostedProductIds((prev) => ({
            ...prev,
            [productId]: true,
          }));
          setStatus("Facebook page credentials not configured yet. Opened share dialog instead.");
        }
        return;
      }

      const opened = openFacebookShareDialog(product);
      if (opened) {
        setFacebookPostedProductIds((prev) => ({
          ...prev,
          [productId]: true,
        }));
        setStatus("Facebook page post failed. Opened share dialog fallback.");
        return;
      }

      setStatus(
        error?.response?.data?.detail
        || error?.response?.data?.error
        || error?.message
        || "Unable to post to Facebook.",
      );
      return;
    } finally {
      setActiveFacebookShareId("");
    }
  };

  const handleDownloadPreviewImage = async (preview, options = {}) => {
    const sourceUrl = String(options.sourceUrl || preview?.downloadUrl || preview?.src || "").trim();
    if (!sourceUrl) {
      setStatus("No downloadable file was found for this image.");
      return;
    }

    try {
      const response = await fetch(sourceUrl);
      if (!response.ok) {
        throw new Error(`Download failed (${response.status})`);
      }
      const blob = await response.blob();
      const explicitName = String(options.fileName || "").trim();
      const fallbackBase = sanitizeDownloadBaseName(editingProduct?.name || manualProduct?.name || "product-image");
      const extension = extensionFromUrl(sourceUrl) || extensionFromMimeType(blob.type) || ".jpg";
      downloadBlobFile(blob, explicitName || `${fallbackBase}${extension}`);
    } catch (error) {
      setStatus(error?.message || "Unable to download this image.");
    }
  };

  const handleDownloadPatternCustomerCopy = async () => {
    const productId = Number(editingProduct?.id || 0);
    if (!productId) {
      setStatus("Open a saved pattern product before downloading the customer copy.");
      return;
    }

    try {
      const blob = await downloadAdminManualProductPattern(productId);
      const fallbackName = sanitizeDownloadBaseName(editingProduct?.name || manualProduct?.name || "sgcg-pattern");
      const extension = extensionFromMimeType(blob?.type) || ".jpg";
      downloadBlobFile(blob, `${fallbackName}${extension}`);
    } catch (error) {
      setStatus(
        error?.response?.data?.detail
        || error?.response?.data?.error
        || error?.message
        || "Unable to download the customer pattern file.",
      );
    }
  };

  useEffect(() => {
    localStorage.setItem(
      FACEBOOK_POSTED_STORAGE_KEY,
      JSON.stringify(facebookPostedProductIds),
    );
  }, [facebookPostedProductIds]);

  useEffect(() => {
    setManualProductsPage(1);
  }, [manualProductSearch, manualProductsListTab, manualProductTypeFilter]);

  useEffect(() => {
    setDeactivatedProductsPage(1);
  }, [deactivatedProductSearch, manualProductTypeFilter]);

  useEffect(() => {
    if (manualProductTypeFilter !== "patterns") {
      setPatternToTemplateSelection("");
      setPatternToTemplateStatus("");
      return;
    }

    if (!patternToTemplateSelection) return;
    const stillExists = filteredPatternProducts.some(
      (entry) => String(entry.id) === String(patternToTemplateSelection),
    );
    if (!stillExists) {
      setPatternToTemplateSelection("");
    }
  }, [
    manualProductTypeFilter,
    patternToTemplateSelection,
    filteredPatternProducts,
  ]);

  useEffect(() => {
    setCustomersPage(1);
  }, [filteredCustomers.length, customerListTab]);

  useEffect(() => {
    setDigitalSessionsPage(1);
  }, [digitalCheckoutSessions.length]);

  useEffect(() => {
    setDigitalSessionsPage(1);
  }, [digitalSessionEmailSearch]);

  useEffect(() => {
    setReviewCodesPage(1);
  }, [reviewInviteCodes.length]);

  useEffect(() => {
    setReviewsPage(1);
  }, [adminReviews.length, adminReviewStatusFilter]);

  useEffect(() => {
    if (manualProductsPage > totalManualProductPages) {
      setManualProductsPage(totalManualProductPages);
    }
  }, [manualProductsPage, totalManualProductPages]);

  useEffect(() => {
    if (customersPage > totalCustomersPages) {
      setCustomersPage(totalCustomersPages);
    }
  }, [customersPage, totalCustomersPages]);

  useEffect(() => {
    if (digitalSessionsPage > totalDigitalSessionsPages) {
      setDigitalSessionsPage(totalDigitalSessionsPages);
    }
  }, [digitalSessionsPage, totalDigitalSessionsPages]);

  useEffect(() => {
    if (reviewCodesPage > totalReviewCodesPages) {
      setReviewCodesPage(totalReviewCodesPages);
    }
  }, [reviewCodesPage, totalReviewCodesPages]);

  useEffect(() => {
    if (reviewsPage > totalReviewsPages) {
      setReviewsPage(totalReviewsPages);
    }
  }, [reviewsPage, totalReviewsPages]);

  const renderSectionPagination = (currentPage, totalPages, setPage) => {
    if (totalPages <= 1) return null;
    return (
      <div style={{ marginTop: "0.8rem" }}>
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setPage}
          ariaLabel="Section pages"
        />
      </div>
    );
  };

  const handleCloseModal = () => {
    setShowManualProductModal(false);
    setEditingProduct(null);
    setManualProduct(createEmptyManualProduct());
    setQuantityManuallyEdited(false);
    setUnifiedTemplate(createEmptyUnifiedTemplate());
    setRelatedTemplateUpload(createEmptyRelatedTemplateUpload());
    setRelatedGalleryUpload(createEmptyRelatedGalleryUpload());
    setCategoryInput("");
    setMaterialInput("");
    setImagePreviews([]);
    setEnableWatermark(true); // Always reset to true when modal closes
    setWatermarkText("SGCG ART GLASS"); // Reset to default text
    setAddImagesToGallery(false);
    setTemplateRefPhotos([]);
    setTemplateNameManuallyEdited(false);
    setPatternOnlyDescription("");
    clearManualProductStatus();
    setProductModePhysical(true);
    setProductModePattern(false);
    setProductModeTemplate(false);
  };

  const openCustomerEditModal = async (customer) => {
    const customerId = customer.id;
    openingCustomerIdRef.current = customerId;
    setIsOpeningCustomerModal(true);
    setEditingCustomer(customer);
    setCustomerStatus("Loading customer details...");
    setCustomerForm({
      first_name: customer.first_name || "",
      last_name: customer.last_name || "",
      email: customer.email || "",
      phone: customer.phone || "",
      admin_notes: customer.admin_notes || "",
      address: {
        label: "Primary",
        line1: "",
        line2: "",
        city: "",
        state: "",
        postal_code: "",
        country: "",
      },
    });
    try {
      const templatesResponse = await getTemplates({ active: 1 });
      if (openingCustomerIdRef.current !== customerId) return;
      const templateItems = Array.isArray(templatesResponse?.items)
        ? templatesResponse.items
        : Array.isArray(templatesResponse)
          ? templatesResponse
          : [];
      setAdminTemplateOptions(
        templateItems.filter((template) => canUseTemplateForCustomer(template, customer.id)),
      );

      const details = await getCustomerDetails(customer.id);
      if (openingCustomerIdRef.current !== customerId) return;
      const nextCustomer = details?.customer || customer;
      const primaryAddress =
        (Array.isArray(details?.addresses)
          ? details.addresses.find((entry) => entry.is_default)
          : null) ||
        (Array.isArray(details?.addresses) ? details.addresses[0] : null) ||
        {};

      setEditingCustomer(nextCustomer);
      setCustomerForm({
        first_name: nextCustomer.first_name || "",
        last_name: nextCustomer.last_name || "",
        email: nextCustomer.email || "",
        phone: nextCustomer.phone || "",
        admin_notes: nextCustomer.admin_notes || "",
        address: {
          label: primaryAddress.label || "Primary",
          line1: primaryAddress.line1 || "",
          line2: primaryAddress.line2 || "",
          city: primaryAddress.city || "",
          state: primaryAddress.state || "",
          postal_code: primaryAddress.postal_code || "",
          country: primaryAddress.country || "",
        },
      });
      setCustomerStatus("");
      setSendTemplateStatus("");
      setSendTemplateForm({
        template_id: "",
        message: "",
        project_name: "",
        uploaded_file: null,
        new_template_name: "",
        new_template_category: "",
      });
    } catch (error) {
      if (openingCustomerIdRef.current !== customerId) return;
      const message =
        error?.response?.data?.error || error?.message || "Unable to load address details.";
      setCustomerStatus(`Error: ${message}`);
    } finally {
      setIsOpeningCustomerModal(false);
    }
  };

  const closeCustomerEditModal = () => {
    openingCustomerIdRef.current = null;
    setEditingCustomer(null);
    setCustomerStatus("");
    setIsSavingCustomer(false);
    setIsDeletingCustomer(false);
    setSendTemplateStatus("");
    setIsSendingTemplate(false);
    setSendTemplateForm({
      template_id: "",
      message: "",
      project_name: "",
      uploaded_file: null,
      new_template_name: "",
      new_template_category: "",
    });
  };

  const handleSendTemplateToCustomer = async () => {
    if (!editingCustomer) return;

    setIsSendingTemplate(true);
    setSendTemplateStatus("");
    try {
      let templateId = sendTemplateForm.template_id ? Number(sendTemplateForm.template_id) : null;

      if (!templateId) {
        if (!sendTemplateForm.uploaded_file) {
          setSendTemplateStatus("Select a template from the list or upload a new one.");
          setIsSendingTemplate(false);
          return;
        }
        if (sendTemplateForm.uploaded_file.size > MAX_TEMPLATE_UPLOAD_BYTES) {
          setSendTemplateStatus("Uploaded file is too large (max 50 MB). Please use a smaller file.");
          setIsSendingTemplate(false);
          return;
        }
        if (!sendTemplateForm.new_template_name.trim()) {
          setSendTemplateStatus("Enter a name for the uploaded template.");
          setIsSendingTemplate(false);
          return;
        }

        const uploadPayload = new FormData();
        uploadPayload.append("file", sendTemplateForm.uploaded_file);
        const uploadResult = await uploadAdminTemplateImage(uploadPayload);

        const chosenCategory = sendTemplateForm.new_template_category.trim() || "Direct Message";
        const isDirectMessageTemplate = chosenCategory.toLowerCase() === "direct message";

        const createdTemplate = await createAdminTemplate({
          name: sendTemplateForm.new_template_name.trim(),
          category: chosenCategory,
          template_type: "image",
          image_url: uploadResult.image_url,
          thumbnail_url: uploadResult.image_url,
          is_active: true,
          is_private: isDirectMessageTemplate,
          assigned_customer_id: isDirectMessageTemplate ? editingCustomer.id : null,
        });

        templateId = createdTemplate?.id || null;
        if (!templateId) {
          throw new Error("Template was uploaded but could not be created.");
        }
        setAdminTemplateOptions((prev) => [createdTemplate, ...prev]);
      }

      await sendTemplateToCustomerWorkOrder(editingCustomer.id, {
        template_id: templateId,
        message: sendTemplateForm.message,
        project_name: sendTemplateForm.project_name,
      });
      setSendTemplateStatus("Template sent to customer work orders.");
      setSendTemplateForm((prev) => ({
        ...prev,
        template_id: "",
        message: "",
        project_name: "",
        uploaded_file: null,
        new_template_name: "",
        new_template_category: "",
      }));
    } catch (error) {
      const message =
        error?.response?.data?.detail ||
        error?.response?.data?.error ||
        error?.message ||
        "Failed to send template to customer.";
      setSendTemplateStatus(`Error: ${message}`);
    } finally {
      setIsSendingTemplate(false);
    }
  };

  const handleCustomerSave = async (event) => {
    event.preventDefault();
    if (!editingCustomer) return;
    setIsSavingCustomer(true);
    setCustomerStatus("");
    try {
      const updated = await updateCustomer(editingCustomer.id, customerForm);
      setCustomers((prev) =>
        prev.map((customer) =>
          customer.id === editingCustomer.id ? { ...customer, ...updated } : customer,
        ),
      );
      setCustomerStatus("Customer updated successfully.");
      setEditingCustomer((prev) => (prev ? { ...prev, ...updated } : prev));
    } catch (error) {
      const message =
        error?.response?.data?.error || error?.message || "Failed to update customer.";
      setCustomerStatus(`Error: ${message}`);
    } finally {
      setIsSavingCustomer(false);
    }
  };

  const handleDeleteCustomer = async () => {
    if (!editingCustomer?.id) return;
    const confirmDelete = window.confirm(
      `Delete customer ${customerForm.email || `#${editingCustomer.id}`}? This permanently removes customer account data.`,
    );
    if (!confirmDelete) return;

    setIsDeletingCustomer(true);
    setCustomerStatus("");
    try {
      await deleteCustomer(editingCustomer.id);
      setCustomers((prev) => prev.filter((customer) => customer.id !== editingCustomer.id));
      closeCustomerEditModal();
    } catch (error) {
      const apiError = error?.response?.data?.error;
      const message = apiError === "cannot_delete_self"
        ? "You cannot delete your own admin account."
        : apiError || error?.message || "Failed to delete customer.";
      setCustomerStatus(`Error: ${message}`);
      setIsDeletingCustomer(false);
    }
  };

  const handleRefreshCatalog = async () => {
    if (typeof onRefreshCatalog !== "function") return;
    setIsRefreshingCatalog(true);
    setStatus("Refreshing catalog...");
    try {
      await onRefreshCatalog();
      setStatus("Catalog refreshed.");
    } catch (error) {
      const message = error?.message || "Unable to refresh catalog right now.";
      setStatus(`Error: ${message}`);
    } finally {
      setIsRefreshingCatalog(false);
    }
  };

  const handlePrintListedProducts = async () => {
    if (filteredManualProducts.length === 0) {
      setStatus("No listed products to export.");
      return;
    }

    setIsGeneratingPdf(true);
    try {
      setStatus("Preparing checklist PDF...");

      const imageToJpegDataUrl = async (url) => {
        const normalized = (() => {
          const raw = String(url || "").trim();
          if (!raw) return "";
          if (raw.startsWith("http://") || raw.startsWith("https://")) {
            try {
              const parsed = new URL(raw);
              const isLocalDev = ["localhost", "127.0.0.1"].includes(window.location.hostname);
              if (isLocalDev && parsed.pathname.startsWith("/uploads/") && parsed.origin !== window.location.origin) {
                return `${window.location.origin}${parsed.pathname}`;
              }
            } catch {
              return raw;
            }
          }
          return raw;
        })();
        if (!normalized) return "";

        const cache = pdfThumbnailCacheRef.current;
        if (cache.has(normalized)) {
          return String(cache.get(normalized) || "");
        }

        const jpegDataUrl = await Promise.race([
          new Promise((resolve) => {
            const image = new Image();
            image.crossOrigin = "anonymous";

            image.onload = () => {
              try {
                const sourceWidth = Math.max(1, Number(image.naturalWidth || image.width || 1));
                const sourceHeight = Math.max(1, Number(image.naturalHeight || image.height || 1));
                const maxEdge = 360;
                const scale = Math.min(1, maxEdge / Math.max(sourceWidth, sourceHeight));
                const canvas = document.createElement("canvas");
                canvas.width = Math.max(1, Math.round(sourceWidth * scale));
                canvas.height = Math.max(1, Math.round(sourceHeight * scale));
                const ctx = canvas.getContext("2d");
                if (!ctx) {
                  resolve("");
                  return;
                }
                ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL("image/jpeg", 0.86));
              } catch {
                resolve("");
              }
            };

            image.onerror = () => resolve("");
            image.src = normalized;
          }),
          // Give up after 8 s so a 404 / slow server doesn't stall the whole PDF.
          new Promise((resolve) => setTimeout(() => resolve(""), 8000)),
        ]);

        cache.set(normalized, jpegDataUrl);
        return jpegDataUrl;
      };

      const alphabetizedProducts = [...filteredManualProducts].sort((left, right) =>
        String(left?.name || "").localeCompare(String(right?.name || ""), undefined, {
          sensitivity: "base",
          numeric: true,
        }),
      );

      // Batch-prefetch all template previews in parallel so the per-product
      // loop below never stalls waiting for sequential network requests.
      const missingTemplateIds = Array.from(
        new Set(
          alphabetizedProducts
            .filter((p) => isPatternProductRecord(p))
            .map((p) => String(p?.related_links?.template_id || "").trim())
            .filter((tid) => tid && !linkedTemplatePreviewUrls[tid]),
        ),
      );
      const prefetchedTemplateUrls = { ...linkedTemplatePreviewUrls };
      if (missingTemplateIds.length > 0) {
        setStatus(`Preparing checklist PDF… (loading ${missingTemplateIds.length} template preview${missingTemplateIds.length === 1 ? "" : "s"})`);
        await Promise.all(
          missingTemplateIds.map(async (tid) => {
            try {
              const payload = await getTemplate(tid);
              prefetchedTemplateUrls[tid] = resolveMediaUrl(payload?.thumbnail_url || payload?.image_url || "") || "";
            } catch {
              prefetchedTemplateUrls[tid] = "";
            }
          }),
        );
        setStatus("Preparing checklist PDF… (building pages)");
      }

      const resolveWithConcurrency = async (items, limit, mapper) => {
        const results = new Array(items.length);
        let nextIndex = 0;
        const workerCount = Math.min(limit, items.length || 0);

        const workers = Array.from({ length: workerCount }, async () => {
          while (nextIndex < items.length) {
            const index = nextIndex;
            nextIndex += 1;
            results[index] = await mapper(items[index], index);
          }
        });

        await Promise.all(workers);
        return results;
      };

      // Pre-resolve all image URLs with limited concurrency to avoid browser request throttling.
      const resolvedImageUrls = await resolveWithConcurrency(
        alphabetizedProducts,
        6,
        async (product) => {
          const templateId = String(product?.related_links?.template_id || "").trim();
          const linkedUrl = prefetchedTemplateUrls[templateId] || "";
          let candidates = getProductDisplayThumbnailCandidates(product, linkedUrl);

          // Some list payloads do not include complete image metadata.
          // Fall back to the full product payload for PDF image resolution.
          if (candidates.length === 0) {
            const productId = String(product?.id || "").trim();
            if (productId) {
              try {
                const fullProduct = await fetchManualProduct(productId);
                candidates = getProductDisplayThumbnailCandidates(fullProduct, linkedUrl);
              } catch {
                // Keep candidates empty and render the "No image" placeholder.
              }
            }
          }

          const url = candidates[0] || "";
          return imageToJpegDataUrl(url);
        },
      );

      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const marginX = 10;
      const topHeaderY = 12;
      const contentTopY = 28;
      const bottomMargin = 10;

      const rowGap = 2;
      const rowStartX = marginX;
      const rowWidth = pageWidth - marginX * 2;
      const checkBoxXOffset = 2;
      const checkBoxYOffset = 6;
      const thumbXOffset = 24;
      const thumbYOffset = 4;
      const thumbSize = 16;
      const textXOffset = 44;
      const lineHeight = 3.9;

      const drawHeader = () => {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(14);
        doc.text("Manual Products Checklist", marginX, topHeaderY);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9.5);
        doc.setTextColor(75, 85, 99);
        doc.text(`Listed products: ${alphabetizedProducts.length} · Generated: ${new Date().toLocaleString()}`, marginX, topHeaderY + 5);
        doc.setDrawColor(209, 213, 219);
        doc.line(marginX, topHeaderY + 8, pageWidth - marginX, topHeaderY + 8);
        doc.setTextColor(17, 24, 39);
      };

      drawHeader();

      let y = contentTopY;

      for (let index = 0; index < alphabetizedProducts.length; index += 1) {
        const product = alphabetizedProducts[index];
        const priceLabel = formatListingPriceLabel(product);
        const tagsLabel = `Tags: ${toDisplayList(product.category) || "No tags"}`;
        const dimensionParts = [
          product?.width ? `W: ${product.width}` : "",
          product?.height ? `H: ${product.height}` : "",
          product?.depth ? `D: ${product.depth}` : "",
        ].filter(Boolean);
        const dimensionsLabel = `Size: ${dimensionParts.length > 0 ? dimensionParts.join(" · ") : "No size listed"}`;

        const contentWidth = rowWidth - textXOffset - 2;
        const nameLines = doc.splitTextToSize(String(product?.name || "Untitled product"), contentWidth);
        const tagsLines = doc.splitTextToSize(tagsLabel, contentWidth);

        const textLineCount = Math.max(4, nameLines.length + 1 + 1 + tagsLines.length);
        const rowHeight = Math.max(24, 6 + (textLineCount * lineHeight));

        if (y + rowHeight > pageHeight - bottomMargin) {
          doc.addPage();
          drawHeader();
          y = contentTopY;
        }

        doc.setDrawColor(209, 213, 219);
        doc.roundedRect(rowStartX, y, rowWidth, rowHeight, 2.2, 2.2, "S");

        doc.rect(rowStartX + checkBoxXOffset, y + checkBoxYOffset, 4, 4);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9.5);
        doc.setTextColor(55, 65, 81);
        doc.text(`${index + 1}.`, rowStartX + checkBoxXOffset + 6.5, y + checkBoxYOffset + 3.3);

        const imageDataUrl = resolvedImageUrls[index] || "";
        if (imageDataUrl) {
          try {
            doc.addImage(imageDataUrl, "JPEG", rowStartX + thumbXOffset, y + thumbYOffset, thumbSize, thumbSize);
            doc.setDrawColor(203, 213, 225);
            doc.rect(rowStartX + thumbXOffset, y + thumbYOffset, thumbSize, thumbSize);
          } catch {
            doc.setDrawColor(203, 213, 225);
            doc.rect(rowStartX + thumbXOffset, y + thumbYOffset, thumbSize, thumbSize);
            doc.setFontSize(8);
            doc.setTextColor(107, 114, 128);
            doc.text("No image", rowStartX + thumbXOffset + 2.7, y + thumbYOffset + 8.8);
          }
        } else {
          doc.setDrawColor(203, 213, 225);
          doc.rect(rowStartX + thumbXOffset, y + thumbYOffset, thumbSize, thumbSize);
          doc.setFontSize(8);
          doc.setTextColor(107, 114, 128);
          doc.text("No image", rowStartX + thumbXOffset + 2.7, y + thumbYOffset + 8.8);
        }

        let textY = y + 5.5;
        doc.setTextColor(17, 24, 39);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10.5);
        nameLines.forEach((line) => {
          doc.text(String(line), rowStartX + textXOffset, textY);
          textY += lineHeight;
        });

        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(15, 63, 166);
        doc.text(priceLabel, rowStartX + textXOffset, textY);
        textY += lineHeight;

        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.8);
        doc.setTextColor(31, 41, 55);
        doc.text(dimensionsLabel, rowStartX + textXOffset, textY);
        textY += lineHeight;

        doc.setTextColor(55, 65, 81);
        tagsLines.forEach((line) => {
          doc.text(String(line), rowStartX + textXOffset, textY);
          textY += lineHeight;
        });

        y += rowHeight + rowGap;
      }

      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      doc.save(`manual-products-checklist-${stamp}.pdf`);
      setStatus("PDF downloaded — open it from your Downloads folder to print.");
    } catch (error) {
      console.error("Failed to export checklist PDF:", error);
      setStatus("Unable to export checklist PDF. Please try again.");
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const toManualRelatedLinksPayload = (relatedLinks) => {
    const normalized = normalizeRelatedLinksState(relatedLinks);
    const payload = {
      template_id: normalized.template_id ? Number(normalized.template_id) : null,
      template_name: String(normalized.template_name || "").trim() || null,
      pattern_product_id: normalized.pattern_product_id ? Number(normalized.pattern_product_id) : null,
      pattern_product_name: String(normalized.pattern_product_name || "").trim() || null,
      linked_product_id: normalized.linked_product_id ? Number(normalized.linked_product_id) : null,
      linked_product_name: String(normalized.linked_product_name || "").trim() || null,
      gallery_photo_id: normalized.gallery_photo_id ? Number(normalized.gallery_photo_id) : null,
      gallery_panel_name: String(normalized.gallery_panel_name || "").trim() || null,
      gallery_template_id: normalized.gallery_template_id ? Number(normalized.gallery_template_id) : null,
    };
    const manualOverrides = normalizeRelatedLinkManualOverrides(normalized.manual_overrides);
    if (Object.values(manualOverrides).some(Boolean)) {
      payload.manual_overrides = manualOverrides;
    }
    return payload;
  };

  const relatedLinkAutoMatchNames = useMemo(
    () => buildUniqueNameCandidates([manualProduct.name, unifiedTemplate.name]),
    [manualProduct.name, unifiedTemplate.name],
  );

  useEffect(() => {
    if (!showManualProductModal) return;
    if (relatedLinkAutoMatchNames.length === 0) return;

    const editingProductId = String(editingProduct?.id || "").trim();
    setManualProduct((prev) => {
      const currentLinks = normalizeRelatedLinksState(prev.related_links);
      let nextLinks = currentLinks;
      let changed = false;

      const maybeApplyAutoMatch = (fieldName, match) => {
        const currentId = String(nextLinks[fieldName] || "").trim();
        const matchId = String(match?.id || "").trim();
        if (currentId || !matchId) return;
        nextLinks = applyRelatedLinkSelection(nextLinks, fieldName, match, { markManual: false });
        changed = true;
      };

      if (!currentLinks.manual_overrides?.template_id) {
        maybeApplyAutoMatch("template_id", findOptionByMatchingName({
          options: productTemplateOptions,
          candidateNames: relatedLinkAutoMatchNames,
          getName: (entry) => entry?.name,
        }));
      }

      if (!currentLinks.manual_overrides?.pattern_product_id) {
        maybeApplyAutoMatch("pattern_product_id", findOptionByMatchingName({
          options: patternProductOptions,
          candidateNames: relatedLinkAutoMatchNames,
          getName: (entry) => entry?.name,
          excludeIds: editingProductId ? [editingProductId] : [],
        }));
      }

      if (!currentLinks.manual_overrides?.linked_product_id) {
        maybeApplyAutoMatch("linked_product_id", findOptionByMatchingName({
          options: linkedProductOptions,
          candidateNames: relatedLinkAutoMatchNames,
          getName: (entry) => entry?.name,
          excludeIds: editingProductId ? [editingProductId] : [],
        }));
      }

      if (!currentLinks.manual_overrides?.gallery_photo_id) {
        const galleryMatch = findOptionByMatchingName({
          options: productGalleryOptions,
          candidateNames: relatedLinkAutoMatchNames,
          getName: (entry) => entry?.panel_name,
        });
        maybeApplyAutoMatch(
          "gallery_photo_id",
          galleryMatch
            ? {
              id: galleryMatch.id,
              name: galleryMatch.panel_name,
              template_id: galleryMatch.template_id ? String(galleryMatch.template_id) : "",
            }
            : null,
        );
      }

      if (!changed) return prev;
      return {
        ...prev,
        related_links: nextLinks,
      };
    });
  }, [
    showManualProductModal,
    relatedLinkAutoMatchNames,
    productTemplateOptions,
    patternProductOptions,
    linkedProductOptions,
    productGalleryOptions,
    editingProduct,
  ]);

  const handleConvertPatternToTemplate = async () => {
    if (isConvertingPatternToTemplate) return;

    const patternProductId = Number(patternToTemplateSelection || 0);
    if (!patternProductId) {
      setPatternToTemplateStatus("Select a pattern to convert.");
      return;
    }

    const patternProduct = normalizedManualProducts.find(
      (entry) => Number(entry?.id || 0) === patternProductId,
    );
    if (!patternProduct) {
      setPatternToTemplateStatus("The selected pattern could not be found.");
      return;
    }

    const patternName = String(patternProduct.name || `Pattern #${patternProductId}`).trim();
    if (!patternName) {
      setPatternToTemplateStatus("Pattern name is required before conversion.");
      return;
    }

    const firstPatternImage = ensureArray(patternProduct.images).find((entry) => {
      const mediaType = String(entry?.media_type || entry?.type || "").toLowerCase();
      const imageUrl = String(entry?.image_url || entry?.url || "").trim();
      return mediaType !== "video" && Boolean(imageUrl);
    });
    const templateImageUrl = String(
      firstPatternImage?.image_url || firstPatternImage?.url || "",
    ).trim();

    if (!templateImageUrl) {
      setPatternToTemplateStatus("Pattern needs at least one image before it can be converted to a template.");
      return;
    }

    setIsConvertingPatternToTemplate(true);
    setPatternToTemplateStatus("Converting pattern to template...");

    try {
      const baseRelatedLinks = {
        ...createDefaultRelatedLinks(),
        ...(patternProduct.related_links && typeof patternProduct.related_links === "object"
          ? patternProduct.related_links
          : {}),
      };

      const toDimensionPart = (value) => {
        const numeric = Number(value);
        if (!Number.isFinite(numeric) || numeric <= 0) return "";
        return String(Number(numeric.toFixed(2))).replace(/\.00$/, "");
      };

      const widthText = toDimensionPart(patternProduct.width);
      const heightText = toDimensionPart(patternProduct.height);
      const depthText = toDimensionPart(patternProduct.depth);
      const derivedDimensions = [
        widthText && heightText ? `${widthText}" x ${heightText}"` : "",
        depthText ? `Depth ${depthText}"` : "",
      ]
        .filter(Boolean)
        .join(" · ");

      const templateCategory = Array.isArray(patternProduct.category)
        ? (patternProduct.category.find((entry) => String(entry || "").trim()) || "Patterns")
        : (String(patternProduct.category || "").trim() || "Patterns");

      const listedPrice = Number(patternProduct.price || 0);
      const digitalPrice = Number.isFinite(listedPrice) && listedPrice >= 0.5
        ? Number(listedPrice.toFixed(2))
        : null;

      const templateRelatedLinks = {
        ...baseRelatedLinks,
        pattern_product_id: patternProductId,
        pattern_product_name: patternName,
      };

      const createdTemplate = await createAdminTemplate({
        name: patternName,
        description: String(patternProduct.description || "").trim() || `Digital pattern for ${patternName}`,
        category: templateCategory,
        difficulty: TEMPLATE_DIFFICULTY_OPTIONS[0],
        dimensions: derivedDimensions || 'Letter (8.5" x 11")',
        template_type: "image",
        image_url: templateImageUrl,
        thumbnail_url: templateImageUrl,
        is_active: true,
        is_digital_download: Boolean(digitalPrice),
        price_amount: digitalPrice,
        price_currency: "USD",
        related_links: normalizeRelatedLinksPayload(templateRelatedLinks),
      });

      const createdTemplateId = Number(createdTemplate?.id || 0);
      if (!createdTemplateId) {
        throw new Error("Template was created but did not return a template id.");
      }

      const nextPatternLinks = {
        ...templateRelatedLinks,
        template_id: createdTemplateId,
        template_name: String(createdTemplate.name || patternName).trim(),
        gallery_template_id: baseRelatedLinks.gallery_photo_id
          ? String(createdTemplateId)
          : baseRelatedLinks.gallery_template_id,
      };

      await onUpdateManualProduct(patternProductId, {
        related_links: toManualRelatedLinksPayload(nextPatternLinks),
      });

      const linkedProductId = Number(baseRelatedLinks.linked_product_id || 0);
      if (linkedProductId && linkedProductId !== patternProductId) {
        const linkedProduct = normalizedManualProducts.find(
          (entry) => Number(entry?.id || 0) === linkedProductId,
        );
        const linkedProductLinks = {
          ...createDefaultRelatedLinks(),
          ...(linkedProduct?.related_links && typeof linkedProduct.related_links === "object"
            ? linkedProduct.related_links
            : {}),
          template_id: createdTemplateId,
          template_name: String(createdTemplate.name || patternName).trim(),
          pattern_product_id: patternProductId,
          pattern_product_name: patternName,
          linked_product_id: linkedProductId,
          linked_product_name: String(
            baseRelatedLinks.linked_product_name || linkedProduct?.name || "",
          ).trim() || null,
          gallery_photo_id: baseRelatedLinks.gallery_photo_id || null,
          gallery_panel_name: String(baseRelatedLinks.gallery_panel_name || "").trim() || null,
          gallery_template_id: baseRelatedLinks.gallery_photo_id
            ? createdTemplateId
            : (baseRelatedLinks.gallery_template_id || null),
        };

        await onUpdateManualProduct(linkedProductId, {
          related_links: toManualRelatedLinksPayload(linkedProductLinks),
        });
      }

      const galleryPhotoId = Number(baseRelatedLinks.gallery_photo_id || 0);
      if (galleryPhotoId) {
        await updateAdminGalleryPhoto(galleryPhotoId, {
          template_id: createdTemplateId,
        });
      }

      setProductTemplateOptions((prev) => {
        const exists = prev.some((entry) => String(entry.id) === String(createdTemplateId));
        if (exists) return prev;
        return [
          {
            id: createdTemplateId,
            name: String(createdTemplate.name || patternName).trim(),
          },
          ...prev,
        ];
      });

      await loadManualProductLinkOptions();
      if (typeof onRefreshCatalog === "function") {
        await onRefreshCatalog();
      }

      setPatternToTemplateStatus(
        `Template created from ${patternName}. Linked pattern, product, and gallery references were synced automatically.`,
      );
    } catch (error) {
      const message =
        error?.response?.data?.detail
        || error?.response?.data?.error
        || error?.message
        || "Failed to convert pattern to template.";
      setPatternToTemplateStatus(`Error: ${message}`);
    } finally {
      setIsConvertingPatternToTemplate(false);
    }
  };

  const handleRecoverCheckoutSession = async (sessionIdRaw) => {
    const sessionId = String(sessionIdRaw || "").trim();
    if (!sessionId) return;

    setActiveRecoverySessionId(sessionId);
    setCheckoutRecoveryStatus("");
    try {
      const result = await recoverAdminCheckoutSession(sessionId);
      const orderNumber = result?.order?.order_number;
      const alreadyPlaced = Boolean(result?.already_placed);
      const downloadsCount = Array.isArray(result?.downloads) ? result.downloads.length : 0;
      const downloadsCreatedCount = Math.max(0, Number(result?.downloads_created_count) || 0);
      const emailSent = result?.downloads_email_sent;
      const emailTarget = String(result?.downloads_email_target || "").trim();
      const base = alreadyPlaced
        ? `Order already existed${orderNumber ? ` (${orderNumber})` : ""}.`
        : `Order finalized${orderNumber ? ` (${orderNumber})` : ""}.`;
      const downloadsInfo = downloadsCount > 0
        ? ` ${downloadsCount} download${downloadsCount === 1 ? "" : "s"} available.`
        : "";
      let emailInfo = "";
      if (downloadsCreatedCount > 0) {
        if (emailSent === true) {
          emailInfo = emailTarget
            ? ` Download email sent to ${emailTarget}.`
            : " Download email sent.";
        } else if (emailSent === false) {
          emailInfo = emailTarget
            ? ` Download email failed for ${emailTarget}.`
            : " Download email failed.";
        } else {
          emailInfo = " Download email was not attempted.";
        }
      }
      setCheckoutRecoveryStatus(`${base}${downloadsInfo}${emailInfo}`);
      await loadDigitalCheckoutSessions();
    } catch (error) {
      setCheckoutRecoveryStatus(
        error?.response?.data?.detail
        || error?.response?.data?.error
        || error?.message
        || "Failed to recover checkout session.",
      );
    } finally {
      setActiveRecoverySessionId("");
    }
  };

  const handleResendCheckoutDownloadEmail = async (sessionIdRaw) => {
    const sessionId = String(sessionIdRaw || "").trim();
    if (!sessionId) return;

    setActiveResendSessionId(sessionId);
    setCheckoutRecoveryStatus("");
    try {
      const result = await resendAdminCheckoutDownloadEmail(sessionId);
      const sent = result?.downloads_email_sent === true;
      const emailTarget = String(result?.downloads_email_target || "").trim();
      const downloadsCount = Math.max(0, Number(result?.downloads_count) || 0);
      const emailText = emailTarget ? ` to ${emailTarget}` : "";
      setCheckoutRecoveryStatus(
        sent
          ? `Sent ${downloadsCount} download email${downloadsCount === 1 ? "" : "s"}${emailText}.`
          : `Email send failed${emailText}.`,
      );
      await loadDigitalCheckoutSessions();
    } catch (error) {
      setCheckoutRecoveryStatus(
        error?.response?.data?.detail
        || error?.response?.data?.error
        || error?.message
        || "Failed to resend download email.",
      );
    } finally {
      setActiveResendSessionId("");
    }
  };

  const handleDeleteCheckoutRecovery = async (entry) => {
    const sessionId = String(entry?.session_id || "").trim();
    if (!sessionId) return;

    const customerEmail = String(entry?.customer_email || "").trim() || "this customer";
    const confirmDelete = window.confirm(
      `Delete the recovery row for ${customerEmail}?\n\nSession ID: ${sessionId}\n\nThis only removes the admin recovery entry from this list. It does not delete completed orders or download access.`,
    );
    if (!confirmDelete) return;

    setActiveDeleteRecoverySessionId(sessionId);
    setCheckoutRecoveryStatus("");
    try {
      await deleteAdminDigitalCheckoutSession(sessionId);
      setCheckoutRecoveryStatus(`Deleted recovery row for ${customerEmail}.`);
      await loadDigitalCheckoutSessions();
    } catch (error) {
      setCheckoutRecoveryStatus(
        error?.response?.data?.detail
        || error?.response?.data?.error
        || error?.message
        || "Failed to delete recovery row.",
      );
    } finally {
      setActiveDeleteRecoverySessionId("");
    }
  };

  const adminActivityState = useMemo(() => {
    if (isOpeningProductEdit) {
      return {
        title: "Opening editor...",
        detail: "Loading product links and preparing edit form.",
      };
    }
    if (isSavingManualProduct) {
      return {
        title: "Saving listing...",
        detail: "Uploading media and applying all linked product updates.",
      };
    }
    if (isSendingTemplate) {
      return {
        title: "Uploading template...",
        detail: "Preparing and sending template files to the customer.",
      };
    }
    if (isOpeningCustomerModal) {
      return {
        title: "Loading customer details...",
        detail: "Fetching addresses and available templates.",
      };
    }
    if (isSavingCustomer) {
      return {
        title: "Saving customer...",
        detail: "Updating customer profile and address information.",
      };
    }
    if (isDeletingCustomer) {
      return {
        title: "Deleting customer...",
        detail: "Removing customer account data.",
      };
    }
    if (isRefreshingCatalog) {
      return {
        title: "Loading catalog...",
        detail: "Refreshing products and templates from the latest data.",
      };
    }
    if (isGeneratingPdf) {
      return {
        title: "Generating PDF...",
        detail: "Building the product checklist for download.",
      };
    }
    if (isLoadingDigitalSessions || activeRecoverySessionId || activeResendSessionId) {
      return {
        title: "Loading checkout sessions...",
        detail: "Syncing recent digital checkout activity.",
      };
    }
    if (isSavingReview) {
      return {
        title: "Saving review...",
        detail: "Updating the review details and status.",
      };
    }
    if (isDeletingReview) {
      return {
        title: "Deleting review...",
        detail: "Removing the selected review.",
      };
    }
    if (isGeneratingReviewCode || isRegeneratingReviewCode) {
      return {
        title: "Generating review code...",
        detail: "Creating a code and preparing email delivery.",
      };
    }
    if (isDeletingReviewCode) {
      return {
        title: "Deleting review code...",
        detail: "Removing the selected invite code.",
      };
    }
    if (activeProductDeleteId) {
      return {
        title: "Deleting product...",
        detail: "Removing product data from the catalog.",
      };
    }
    if (activeProductToggleId) {
      return {
        title: "Updating product visibility...",
        detail: "Applying storefront visibility change.",
      };
    }
    if (activeFacebookShareId) {
      return {
        title: "Posting to Facebook...",
        detail: "Publishing product content to your connected page.",
      };
    }
    return null;
  }, [
    isOpeningProductEdit,
    isSavingManualProduct,
    isSendingTemplate,
    isOpeningCustomerModal,
    isSavingCustomer,
    isDeletingCustomer,
    isRefreshingCatalog,
    isGeneratingPdf,
    isLoadingDigitalSessions,
    activeRecoverySessionId,
    activeResendSessionId,
    isSavingReview,
    isDeletingReview,
    isGeneratingReviewCode,
    isRegeneratingReviewCode,
    isDeletingReviewCode,
    activeProductDeleteId,
    activeProductToggleId,
    activeFacebookShareId,
  ]);

  const [showAdminActivityOverlay, setShowAdminActivityOverlay] = useState(false);

  useEffect(() => {
    let timerId;
    if (adminActivityState) {
      timerId = window.setTimeout(() => {
        setShowAdminActivityOverlay(true);
      }, ADMIN_ACTIVITY_POPUP_DELAY_MS);
    } else {
      setShowAdminActivityOverlay(false);
    }

    return () => {
      if (timerId) {
        window.clearTimeout(timerId);
      }
    };
  }, [adminActivityState]);

  return (
    <div className="admin-dashboard">
      {adminActivityState && showAdminActivityOverlay ? (
        <div className="admin-activity-overlay" role="status" aria-live="polite" aria-busy="true">
          <div className="admin-activity-popup">
            <span className="admin-activity-spinner" aria-hidden="true" />
            <div className="admin-activity-text">
              <strong>{adminActivityState.title}</strong>
              <span>{adminActivityState.detail}</span>
            </div>
          </div>
        </div>
      ) : null}
      <div className="dashboard-header">
        <div>
          <h2>Admin Dashboard</h2>
          <p>Manage products and view analytics.</p>
        </div>
        <button className="button" onClick={onLogout}>
          Sign out
        </button>
      </div>

      <div className="dashboard-tabs">
        <button
          className={`tab ${activeTab === "products" ? "active" : ""}`}
          onClick={() => setActiveTab("products")}
        >
          Products
        </button>
        <button
          className={`tab ${activeTab === "deactivated-products" ? "active" : ""}`}
          onClick={() => setActiveTab("deactivated-products")}
        >
          Deactivated
          {normalizedManualProducts.filter((p) => !p.is_active).length > 0 && (
            <span className="tab-count-badge">
              {normalizedManualProducts.filter((p) => !p.is_active).length}
            </span>
          )}
        </button>
        <button
          className={`tab ${activeTab === "customers" ? "active" : ""}`}
          onClick={() => setActiveTab("customers")}
        >
          Customers
        </button>
        <button
          className={`tab ${activeTab === "templates" ? "active" : ""}`}
          onClick={() => setActiveTab("templates")}
        >
          Templates
        </button>
        <button
          className={`tab ${activeTab === "glass-types" ? "active" : ""}`}
          onClick={() => setActiveTab("glass-types")}
        >
          Glass Types
        </button>
        <button
          className={`tab ${activeTab === "work-orders" ? "active" : ""}`}
          onClick={() => setActiveTab("work-orders")}
        >
          Work Orders
        </button>
        <button
          className={`tab ${activeTab === "gallery" ? "active" : ""}`}
          onClick={() => setActiveTab("gallery")}
        >
          Photo Gallery
        </button>
        <button
          className={`tab ${activeTab === "reviews" ? "active" : ""}`}
          onClick={() => setActiveTab("reviews")}
        >
          Reviews
        </button>
        {/*
        <button
          className={`tab ${activeTab === 'etsy' ? 'active' : ''}`}
          onClick={() => setActiveTab('etsy')}
        >
          Etsy Analytics
        </button>
        */}
      </div>
      {activeTab === "customers" && (
        <div className="tab-panel">
          <div className="panel-section customer-insight-section">
            <div className="customer-insight-header-row">
              <h3>Customer Insight</h3>
              <span className="customer-insight-subtitle">Unique home-page visitors (by IP)</span>
            </div>
            {isLoadingCustomerInsight ? (
              <p className="form-note">Loading visitor metrics...</p>
            ) : (
              <div className="customer-insight-grid">
                <article className="customer-insight-card">
                  <span className="customer-insight-label">Total Clicks</span>
                  <strong className="customer-insight-value">{formatInsightCount(customerInsight?.total_clicks)}</strong>
                  <span className="customer-insight-footnote">All-time unique visitors</span>
                </article>
                <article className="customer-insight-card">
                  <span className="customer-insight-label">Clicks Today</span>
                  <strong className="customer-insight-value">{formatInsightCount(customerInsight?.clicks_today)}</strong>
                  <span className={`customer-insight-trend is-${customerInsight?.daily_trend || "flat"}`}>
                    <span className="customer-insight-trend-arrow" aria-hidden="true">{trendDirectionSymbol(customerInsight?.daily_trend)}</span>
                    <span>
                      {formatInsightCount(Math.abs(Number(customerInsight?.daily_delta || 0)))} vs yesterday
                    </span>
                  </span>
                </article>
                <article className="customer-insight-card">
                  <span className="customer-insight-label">Monthly Clicks</span>
                  <strong className="customer-insight-value">{formatInsightCount(customerInsight?.monthly_clicks)}</strong>
                  <span className={`customer-insight-trend is-${customerInsight?.monthly_trend || "flat"}`}>
                    <span className="customer-insight-trend-arrow" aria-hidden="true">{trendDirectionSymbol(customerInsight?.monthly_trend)}</span>
                    <span>
                      {formatInsightCount(Math.abs(Number(customerInsight?.monthly_delta || 0)))} vs last month
                    </span>
                  </span>
                </article>
              </div>
            )}
          </div>

          <div className="panel-section discount-code-section">
            <h3>Discount Codes</h3>
            <p className="form-note">Create campaign codes with percent-off and either a time limit or usage limit.</p>
            <form className="discount-code-form" onSubmit={handleCreateDiscountCode}>
              <label>
                Code Name
                <input
                  type="text"
                  value={discountCodeForm.name}
                  onChange={(event) => setDiscountCodeForm((prev) => ({ ...prev, name: event.target.value }))}
                  placeholder="Flash Sale 20%"
                />
              </label>
              <label>
                Code
                <input
                  type="text"
                  value={discountCodeForm.code}
                  onChange={(event) => setDiscountCodeForm((prev) => ({ ...prev, code: event.target.value.toUpperCase().replace(/\s+/g, "") }))}
                  placeholder="FLASH20"
                  required
                />
              </label>
              <label>
                Percent Off
                <input
                  type="number"
                  min="1"
                  max="95"
                  step="1"
                  value={discountCodeForm.discount_percent}
                  onChange={(event) => setDiscountCodeForm((prev) => ({ ...prev, discount_percent: event.target.value }))}
                  required
                />
              </label>
              <label>
                Limit By
                <select
                  value={discountCodeForm.limit_type}
                  onChange={(event) => setDiscountCodeForm((prev) => ({ ...prev, limit_type: event.target.value }))}
                >
                  <option value="uses">Number of uses</option>
                  <option value="time">Days active</option>
                </select>
              </label>
              {discountCodeForm.limit_type === "uses" ? (
                <label>
                  Max Uses
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={discountCodeForm.max_uses}
                    onChange={(event) => setDiscountCodeForm((prev) => ({ ...prev, max_uses: event.target.value }))}
                    required
                  />
                </label>
              ) : (
                <label>
                  Active Days
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={discountCodeForm.valid_days}
                    onChange={(event) => setDiscountCodeForm((prev) => ({ ...prev, valid_days: event.target.value }))}
                    required
                  />
                </label>
              )}
              <button type="submit" className="button primary" disabled={isSavingDiscountCode}>
                {isSavingDiscountCode ? "Creating..." : "Create Discount Code"}
              </button>
            </form>

            {discountCodeStatus ? <p className="form-note">{discountCodeStatus}</p> : null}

            {discountCodes.length === 0 ? (
              <p className="form-note">No discount codes created yet.</p>
            ) : (
              <div className="discount-code-list">
                {discountCodes.map((code) => {
                  const usedCount = Number(code?.used_count || 0);
                  const maxUses = code?.max_uses;
                  const limitLabel = String(code?.limit_type || "uses") === "time"
                    ? `Expires: ${String(code?.expires_at || "-").slice(0, 10) || "-"}`
                    : `Uses: ${usedCount}${maxUses ? ` / ${maxUses}` : ""}`;

                  return (
                    <article key={String(code?.id || code?.code)} className="discount-code-card">
                      <div>
                        <p className="discount-code-title">{code?.name || code?.code}</p>
                        <p className="discount-code-meta">{code?.code} • {Number(code?.discount_percent || 0)}% off</p>
                      </div>
                      <div className="discount-code-card-right">
                        <span className={`discount-code-status ${code?.is_active_now ? "is-active" : "is-inactive"}`}>
                          {code?.is_active_now ? "Active" : "Inactive"}
                        </span>
                        <span className="discount-code-limit">{limitLabel}</span>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>

          <div className="panel-section">
            <h3>Customers</h3>
            <div className="customer-list-tabs" role="tablist" aria-label="Customer categories">
              {CUSTOMER_LIST_TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={customerListTab === tab.key}
                  className={`customer-list-tab ${customerListTab === tab.key ? "active" : ""}`}
                  onClick={() => setCustomerListTab(tab.key)}
                >
                  <span>{tab.label}</span>
                  <span className="customer-list-tab-count">{customerCountsByCategory[tab.key] || 0}</span>
                </button>
              ))}
            </div>
            <div className="customer-list-search-row">
              <input
                type="search"
                className="customer-list-search"
                value={customerSearch}
                onChange={(event) => setCustomerSearch(event.target.value)}
                placeholder="Search name, email, phone"
                aria-label="Search customers"
              />
              {customerSearch ? (
                <button
                  type="button"
                  className="button"
                  onClick={() => setCustomerSearch("")}
                >
                  Clear
                </button>
              ) : null}
            </div>
            {filteredCustomers.length === 0 ? (
              <p className="form-note">No customers found.</p>
            ) : (
              <div className="admin-table-wrap">
                <table className="admin-table customer-admin-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Phone</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedCustomers.map((c) => (
                      <tr key={c.id}>
                        <td className="customer-actions-cell">
                          {c.first_name} {c.last_name}
                        </td>
                        <td>{c.email}</td>
                        <td>{c.phone || "-"}</td>
                        <td style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                          <button
                            type="button"
                            className="button"
                            onClick={() => openCustomerEditModal(c)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="button"
                            title={`Email ${c.email}`}
                            onClick={() => window.open(`https://mail.hostinger.com/v2/compose?to=${encodeURIComponent(c.email || '')}`, '_blank', 'noopener,noreferrer')}
                          >
                            Email
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {renderSectionPagination(customersPage, totalCustomersPages, setCustomersPage)}
          </div>

          <div className="panel-section digital-recovery-section">
            <h3>Digital Download Recovery</h3>
            <p className="form-note">Auto-listed Stripe checkout sessions that include digital downloads. Recover purchase or resend email without manually entering session IDs.</p>
            <div className="digital-recovery-search-row">
              <input
                className="digital-recovery-search"
                type="search"
                value={digitalSessionEmailSearch}
                onChange={(event) => setDigitalSessionEmailSearch(event.target.value)}
                placeholder="Search by customer email"
              />
              {digitalSessionEmailSearch ? (
                <button
                  type="button"
                  className="button"
                  onClick={() => setDigitalSessionEmailSearch("")}
                >
                  Clear
                </button>
              ) : null}
            </div>
            {checkoutRecoveryStatus ? <p className="form-note digital-recovery-note">{checkoutRecoveryStatus}</p> : null}
            {isLoadingDigitalSessions ? (
              <p className="form-note">Loading digital checkout sessions...</p>
            ) : filteredDigitalCheckoutSessions.length === 0 ? (
              <p className="form-note">No digital checkout sessions found yet.</p>
            ) : (
              <>
                <div className="digital-recovery-table-wrap">
                <table className="product-table digital-recovery-table">
                  <thead>
                    <tr>
                      <th>Customer Email</th>
                      <th>Digital Items</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedDigitalCheckoutSessions.map((entry) => {
                      const sessionId = String(entry?.session_id || "").trim();
                      const itemNames = Array.isArray(entry?.digital_items)
                        ? entry.digital_items.map((item) => String(item?.title || "Digital item").trim()).filter(Boolean)
                        : [];
                      const itemPreview = itemNames[0] || "-";
                      const itemExtra = itemNames.length > 1 ? ` +${itemNames.length - 1} more` : "";
                      const status = String(entry?.status || "pending").toLowerCase();
                      const statusClass = status === "paid" || status === "processed"
                        ? "is-complete"
                        : status === "pending"
                          ? "is-pending"
                          : "is-other";
                      const isRecoveringRow = activeRecoverySessionId === sessionId;
                      const isResendingRow = activeResendSessionId === sessionId;
                      const isDeletingRow = activeDeleteRecoverySessionId === sessionId;
                      const rowBusy = isRecoveringRow || isResendingRow || isDeletingRow;
                      return (
                        <tr key={sessionId || `${entry?.customer_id}-${entry?.created_at}`}>
                          <td className="digital-recovery-cell-email">{entry?.customer_email || "-"}</td>
                          <td className="digital-recovery-cell-items" title={itemNames.join(", ") || ""}>{itemPreview}{itemExtra}</td>
                          <td className="digital-recovery-cell-status">
                            <span className={`digital-recovery-status ${statusClass}`}>{status}</span>
                          </td>
                          <td className="digital-recovery-cell-actions">
                            <div className="digital-recovery-actions">
                              <button
                                type="button"
                                className="button primary digital-recovery-button digital-recovery-button-primary"
                                disabled={!sessionId || rowBusy}
                                onClick={() => handleRecoverCheckoutSession(sessionId)}
                              >
                                {isRecoveringRow ? "Recovering..." : "Recover Purchase"}
                              </button>
                              <button
                                type="button"
                                className="button digital-recovery-button digital-recovery-button-secondary"
                                disabled={!sessionId || rowBusy}
                                onClick={() => handleResendCheckoutDownloadEmail(sessionId)}
                              >
                                {isResendingRow ? "Sending..." : "Send Email"}
                              </button>
                              <button
                                type="button"
                                className="button danger digital-recovery-button digital-recovery-button-delete"
                                disabled={!sessionId || rowBusy}
                                onClick={() => handleDeleteCheckoutRecovery(entry)}
                                aria-label={isDeletingRow ? "Deleting recovery row" : "Delete recovery row"}
                                title="Delete recovery row"
                              >
                                {isDeletingRow ? (
                                  "..."
                                ) : (
                                  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                                    <path d="M9 3h6" />
                                    <path d="M4 6h16" />
                                    <path d="M7 6l1 13h8l1-13" />
                                    <path d="M10 10v6" />
                                    <path d="M14 10v6" />
                                  </svg>
                                )}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                </div>
                {renderSectionPagination(digitalSessionsPage, totalDigitalSessionsPages, setDigitalSessionsPage)}
              </>
            )}
          </div>
        </div>
      )}

      <div className="dashboard-content">
        {activeTab === "products" && (
          <div className="tab-panel">
            {/* <AddEtsyListingForm onAddItem={onAddItem} /> */}

            <div className="panel-section">
              <h3>Add Product</h3>
              {/* <p className="form-note">Add products that are not listed on Etsy</p> */}
              <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                <button
                  className="button primary"
                  type="button"
                  onClick={() => {
                    setProductType("stainedGlassPanels");
                    setManualProduct({
                      ...createEmptyManualProduct(),
                      category: [PRODUCT_TYPE_LABEL_BY_KEY.stainedGlassPanels],
                    });
                    setQuantityManuallyEdited(false);
                    setUnifiedTemplate(createEmptyUnifiedTemplate());
                    setRelatedTemplateUpload(createEmptyRelatedTemplateUpload());
                    setRelatedGalleryUpload(createEmptyRelatedGalleryUpload());
                    setCategoryInput("");
                    setMaterialInput("");
                    setImagePreviews([]);
                    setEditingProduct(null);
                    setProductModePhysical(true);
                    setProductModePattern(false);
                    setProductModeTemplate(false);
                    clearManualProductStatus();
                    loadManualProductLinkOptions();
                    setShowManualProductModal(true);
                  }}
                >
                  Add Product
                </button>
              </div>
            </div>

            {/* Linked Products Section - Etsy integration disabled */}
            {/*
            <div className="panel-section">
              <h3>Linked Products ({items.length})</h3>
              {items.length === 0 ? (
                <div className="empty-state">No products linked yet.</div>
              ) : (
                <div className="product-list">
                  {items.map((item) => (
                    <div key={item.id} className="product-row">
                      <div className="product-thumb">
                        {item.image_url ? (
                          <img
                            src={item.image_url}
                            alt={item.title || "Product"}
                          />
                        ) : (
                          <div className="thumb-placeholder">No image</div>
                        )}
                      </div>
                      <div className="product-details">
                        <h4>{item.title || "Untitled"}</h4>
                        <p className="product-meta">
                          {item.price_amount &&
                            `${item.price_amount} ${item.price_currency || ""}`}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            */}

            <div className="panel-section">
              <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
                <h3 style={{ margin: 0 }}>
                  {activeManualProductsTabLabel} ({filteredManualProducts.length})
                  <span className="form-note" style={{ marginLeft: "0.6rem" }}>
                    Home Carousel: {homeFeaturedProductsCount}/{MAX_HOME_FEATURED_PRODUCTS}
                  </span>
                </h3>
                <div style={{ display: "flex", gap: "0.55rem", alignItems: "center", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="button"
                    onClick={handlePrintListedProducts}
                    disabled={activeManualProductsCount === 0}
                  >
                    Print Product Listing
                  </button>
                  <button
                    type="button"
                    className="button"
                    onClick={handleRefreshCatalog}
                    disabled={isRefreshingCatalog}
                  >
                    {isRefreshingCatalog ? "Refreshing..." : "Refresh Catalog"}
                  </button>
                </div>
              </div>
              <div className="customer-list-tabs" role="tablist" aria-label="Manual product list filters" style={{ marginTop: "0.75rem" }}>
                {MANUAL_PRODUCT_LIST_TABS.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    role="tab"
                    aria-selected={manualProductsListTab === tab.key}
                    className={`customer-list-tab ${manualProductsListTab === tab.key ? "active" : ""}`}
                    onClick={() => setManualProductsListTab(tab.key)}
                  >
                    <span>{tab.label}</span>
                    <span className="customer-list-tab-count">{manualProductListTabCounts[tab.key] || 0}</span>
                  </button>
                ))}
              </div>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "8px",
                  margin: "0.5rem 0 0.85rem",
                }}
              >
                <button
                  type="button"
                  className={`button ${manualProductTypeFilter === "all" ? "primary" : ""}`}
                  onClick={() => setManualProductTypeFilter("all")}
                >
                  All
                </button>
                {PRODUCT_TYPE_CONFIG.map((typeEntry) => (
                  <button
                    key={typeEntry.key}
                    type="button"
                    className={`button ${manualProductTypeFilter === typeEntry.key ? "primary" : ""}`}
                    onClick={() => setManualProductTypeFilter(typeEntry.key)}
                  >
                    {typeEntry.label}
                  </button>
                ))}
                <button
                  type="button"
                  className={`button ${manualProductTypeFilter === "patterns" ? "primary" : ""}`}
                  onClick={() => setManualProductTypeFilter("patterns")}
                >
                  Patterns
                </button>
              </div>
              <div className="search-box-container">
                <input
                  type="text"
                  placeholder="Search products by name, category, or materials..."
                  value={manualProductSearch}
                  onChange={(e) => setManualProductSearch(e.target.value)}
                  className="search-input"
                />
              </div>
              {status ? (
                <p
                  className={`form-note manual-product-status${manualProductStatusTone === "error" ? " is-error" : ""}`}
                  role="status"
                  aria-live="polite"
                >
                  {status}
                </p>
              ) : null}
              {manualProductTypeFilter === "patterns" && (
                <div className="pattern-template-convert-section">
                  <h4>Convert Pattern to Template</h4>
                  <p className="form-note">
                    Select one pattern to create a template with the same name. Related pattern, physical product, and photo gallery links are synced automatically.
                  </p>
                  <div className="pattern-template-convert-controls">
                    <select
                      value={patternToTemplateSelection}
                      onChange={(event) => {
                        setPatternToTemplateSelection(event.target.value);
                        setPatternToTemplateStatus("");
                      }}
                      disabled={isConvertingPatternToTemplate || filteredPatternProducts.length === 0}
                    >
                      <option value="">Select a pattern...</option>
                      {filteredPatternProducts.map((pattern) => (
                        <option key={pattern.id} value={pattern.id}>
                          {String(pattern.name || `Pattern #${pattern.id}`).trim()}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="button primary"
                      onClick={handleConvertPatternToTemplate}
                      disabled={isConvertingPatternToTemplate || !patternToTemplateSelection}
                    >
                      {isConvertingPatternToTemplate ? "Converting..." : "Create Template From Pattern"}
                    </button>
                  </div>
                  {patternToTemplateStatus ? (
                    <p className="form-note pattern-template-convert-status">{patternToTemplateStatus}</p>
                  ) : null}
                </div>
              )}
              {normalizedManualProducts.filter((product) => product.is_active).length === 0 ? (
                <div className="empty-state">
                  No active products. Move products here by activating them from the Deactivated tab.
                </div>
              ) : filteredManualProducts.length === 0 ? (
                <div className="empty-state">
                  No products match your search.
                </div>
              ) : (
                <>
                  <div className="product-list">
                    {pagedManualProducts.map((product) => (
                      <div key={product.id} className="product-row">
                        <div className="product-thumb">
                          {(() => {
                            const thumbnailCandidates = getProductDisplayThumbnailCandidates(
                              product,
                              linkedTemplatePreviewUrls[String(product?.related_links?.template_id || "").trim()] || "",
                            );
                            const firstVideo = ensureArray(product.images).find((entry) => String(entry?.media_type || "").toLowerCase() === "video") || null;

                            if (thumbnailCandidates.length > 0) {
                              return (
                                <>
                                  <img
                                    src={thumbnailCandidates[0]}
                                    alt={product.name}
                                    loading="lazy"
                                    decoding="async"
                                    fetchPriority="low"
                                    onLoad={(event) => {
                                      event.currentTarget.style.display = "block";
                                      const sibling = event.currentTarget.nextElementSibling;
                                      if (sibling) sibling.style.display = "none";
                                    }}
                                    onError={(event) => {
                                      const fallbackIndex = Number(event.currentTarget.dataset.fallbackIndex || "0") + 1;
                                      if (fallbackIndex < thumbnailCandidates.length) {
                                        event.currentTarget.dataset.fallbackIndex = String(fallbackIndex);
                                        event.currentTarget.src = thumbnailCandidates[fallbackIndex];
                                        return;
                                      }
                                      event.currentTarget.style.display = "none";
                                      const sibling = event.currentTarget.nextElementSibling;
                                      if (sibling) sibling.style.display = "flex";
                                    }}
                                  />
                                  <div className="thumb-placeholder" style={{ display: "none" }}>No image</div>
                                </>
                              );
                            }

                            if (firstVideo) {
                              return (
                                <video
                                  src={resolveMediaUrl(firstVideo.image_url)}
                                  className="thumb-placeholder"
                                  muted
                                  playsInline
                                />
                              );
                            }

                            return <div className="thumb-placeholder">No image</div>;
                          })()}
                        </div>
                        <div className="product-details">
                          <h4>
                            {product.name}
                            {(product.is_featured === 1 ||
                              product.is_featured === true) && (
                              <span className="featured-badge">★ Featured</span>
                            )}
                            {(product.is_home_featured === 1 ||
                              product.is_home_featured === true) && (
                              <span className="featured-badge">🏠 Home Carousel</span>
                            )}
                            {!product.is_digital_download && Number(product.quantity || 0) <= 0 && (
                              <span className="inactive-badge">Sold out</span>
                            )}
                          </h4>
                          {(() => {
                            const dimensionsLabel = getProductDimensionsLabel(product);
                            return dimensionsLabel
                              ? <p className="product-dimensions-hint">{dimensionsLabel}</p>
                              : null;
                          })()}
                          <p className="product-meta">
                            {formatListingPriceLabel(product)}
                            {product.is_digital_download ? " · Digital download" : ` · Qty: ${product.quantity}`}
                            {toDisplayList(product.category) &&
                              ` · ${toDisplayList(product.category)}`}
                            {toDisplayList(product.materials) &&
                              ` · ${toDisplayList(product.materials)}`}
                          </p>
                        </div>
                        <div className="product-actions">
                          <button
                            className="button-icon edit"
                            onClick={() => {
                              closeProductActionMenu();
                              handleEditProduct(product);
                            }}
                            title="Edit product"
                          >
                            ✎
                          </button>
                          <button
                            className={`button-icon featured-toggle ${(product.is_featured === 1 || product.is_featured === true) ? "active" : ""}`}
                            onClick={() => {
                              closeProductActionMenu();
                              handleToggleProductFeatured(product);
                            }}
                            title={(product.is_featured === 1 || product.is_featured === true) ? "Remove featured" : "Mark as featured"}
                            disabled={activeProductFeaturedId === String(product.id)}
                          >
                            {activeProductFeaturedId === String(product.id)
                              ? "..."
                              : (product.is_featured === 1 || product.is_featured === true)
                                ? "★"
                                : "☆"}
                          </button>
                          <button
                            className={`button-icon home-carousel-toggle ${(product.is_home_featured === 1 || product.is_home_featured === true) ? "active" : ""}`}
                            onClick={() => {
                              closeProductActionMenu();
                              handleToggleProductHomeFeatured(product);
                            }}
                            title={(product.is_home_featured === 1 || product.is_home_featured === true) ? "Remove from home carousel" : "Add to home carousel"}
                            disabled={activeProductHomeFeaturedId === String(product.id)}
                          >
                            {activeProductHomeFeaturedId === String(product.id)
                              ? "..."
                              : (product.is_home_featured === 1 || product.is_home_featured === true)
                                ? "🏠"
                                : "⌂"}
                          </button>
                          <div className="product-actions-menu-wrap" ref={openProductActionMenuId === String(product.id) ? productActionMenuRef : null}>
                            <button
                              type="button"
                              className="button-icon actions-menu-toggle"
                              onClick={() => setOpenProductActionMenuId((prev) => (prev === String(product.id) ? "" : String(product.id)))}
                              title="More actions"
                              aria-label="More actions"
                            >
                              ☰
                            </button>
                            {openProductActionMenuId === String(product.id) && (
                              <div className="product-actions-menu" role="menu" aria-label="More product actions">
                                <button
                                  type="button"
                                  className={`product-actions-menu-item ${product.is_active ? "" : "inactive"}`}
                                  onClick={() => {
                                    setOpenProductActionMenuId("");
                                    handleToggleProductActive(product);
                                  }}
                                >
                                  {product.is_active ? "Hide" : "Show"}
                                </button>
                                <button
                                  type="button"
                                  className={`product-actions-menu-item ${facebookPostedProductIds[String(product.id)] ? "posted" : ""}`}
                                  onClick={() => {
                                    setOpenProductActionMenuId("");
                                    handleShareProductToFacebook(product);
                                  }}
                                >
                                  {facebookPostedProductIds[String(product.id)] ? "Posted to Facebook" : "Post to Facebook"}
                                </button>
                                <button
                                  type="button"
                                  className="product-actions-menu-item danger"
                                  onClick={() => {
                                    setOpenProductActionMenuId("");
                                    handleDeleteProduct(product);
                                  }}
                                >
                                  Delete
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {filteredManualProducts.length > MANUAL_PRODUCTS_PER_PAGE && (
                    <div style={{ display: "flex", gap: "0.45rem", alignItems: "center", justifyContent: "center", flexWrap: "wrap", marginTop: "0.9rem" }}>
                      <button
                        type="button"
                        className="button"
                        disabled={currentManualProductsPage <= 1}
                        onClick={() => setManualProductsPage((prev) => Math.max(1, prev - 1))}
                      >
                        Prev
                      </button>

                      {Array.from({ length: totalManualProductPages }, (_, index) => index + 1).map((pageNumber) => (
                        <button
                          key={`manual-page-${pageNumber}`}
                          type="button"
                          className={`button ${currentManualProductsPage === pageNumber ? "primary" : ""}`}
                          onClick={() => setManualProductsPage(pageNumber)}
                        >
                          {pageNumber}
                        </button>
                      ))}

                      <button
                        type="button"
                        className="button"
                        disabled={currentManualProductsPage >= totalManualProductPages}
                        onClick={() => setManualProductsPage((prev) => Math.min(totalManualProductPages, prev + 1))}
                      >
                        Next
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {activeTab === "deactivated-products" && (
          <div className="tab-panel">
            <div className="panel-section">
              <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
                <h3 style={{ margin: 0 }}>Deactivated Products ({filteredDeactivatedProducts.length})</h3>
                <button
                  type="button"
                  className="button"
                  onClick={handleRefreshCatalog}
                  disabled={isRefreshingCatalog}
                >
                  {isRefreshingCatalog ? "Refreshing..." : "Refresh Catalog"}
                </button>
              </div>

              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "8px",
                  margin: "0.5rem 0 0.85rem",
                }}
              >
                <button
                  type="button"
                  className={`button ${manualProductTypeFilter === "all" ? "primary" : ""}`}
                  onClick={() => setManualProductTypeFilter("all")}
                >
                  All
                </button>
                {PRODUCT_TYPE_CONFIG.map((typeEntry) => (
                  <button
                    key={`deactivated-${typeEntry.key}`}
                    type="button"
                    className={`button ${manualProductTypeFilter === typeEntry.key ? "primary" : ""}`}
                    onClick={() => setManualProductTypeFilter(typeEntry.key)}
                  >
                    {typeEntry.label}
                  </button>
                ))}
                <button
                  type="button"
                  className={`button ${manualProductTypeFilter === "patterns" ? "primary" : ""}`}
                  onClick={() => setManualProductTypeFilter("patterns")}
                >
                  Patterns
                </button>
              </div>

              <div className="search-box-container">
                <input
                  type="text"
                  placeholder="Search deactivated products by name, category, or materials..."
                  value={deactivatedProductSearch}
                  onChange={(e) => setDeactivatedProductSearch(e.target.value)}
                  className="search-input"
                />
              </div>

              {normalizedManualProducts.filter((product) => !product.is_active).length === 0 ? (
                <div className="empty-state">
                  No deactivated products.
                </div>
              ) : filteredDeactivatedProducts.length === 0 ? (
                <div className="empty-state">
                  No deactivated products match your search.
                </div>
              ) : (
                <>
                  <div className="product-list">
                    {pagedDeactivatedProducts.map((product) => (
                      <div key={`deactivated-${product.id}`} className="product-row product-row-inactive">
                        <div className="product-thumb">
                          {(() => {
                            const thumbnailCandidates = getProductDisplayThumbnailCandidates(
                              product,
                              linkedTemplatePreviewUrls[String(product?.related_links?.template_id || "").trim()] || "",
                            );
                            const firstVideo = ensureArray(product.images).find((entry) => String(entry?.media_type || "").toLowerCase() === "video") || null;

                            if (thumbnailCandidates.length > 0) {
                              return (
                                <>
                                  <img
                                    src={thumbnailCandidates[0]}
                                    alt={product.name}
                                    loading="lazy"
                                    decoding="async"
                                    fetchPriority="low"
                                    onLoad={(event) => {
                                      event.currentTarget.style.display = "block";
                                      const sibling = event.currentTarget.nextElementSibling;
                                      if (sibling) sibling.style.display = "none";
                                    }}
                                    onError={(event) => {
                                      const fallbackIndex = Number(event.currentTarget.dataset.fallbackIndex || "0") + 1;
                                      if (fallbackIndex < thumbnailCandidates.length) {
                                        event.currentTarget.dataset.fallbackIndex = String(fallbackIndex);
                                        event.currentTarget.src = thumbnailCandidates[fallbackIndex];
                                        return;
                                      }
                                      event.currentTarget.style.display = "none";
                                      const sibling = event.currentTarget.nextElementSibling;
                                      if (sibling) sibling.style.display = "flex";
                                    }}
                                  />
                                  <div className="thumb-placeholder" style={{ display: "none" }}>No image</div>
                                </>
                              );
                            }

                            if (firstVideo) {
                              return (
                                <video
                                  src={resolveMediaUrl(firstVideo.image_url)}
                                  className="thumb-placeholder"
                                  muted
                                  playsInline
                                />
                              );
                            }

                            return <div className="thumb-placeholder">No image</div>;
                          })()}
                        </div>
                        <div className="product-details">
                          <h4>
                            {product.name}
                            <span className="inactive-badge">Inactive</span>
                            {!product.is_digital_download && Number(product.quantity || 0) <= 0 && (
                              <span className="inactive-badge">Sold out</span>
                            )}
                          </h4>
                          {(() => {
                            const dimensionsLabel = getProductDimensionsLabel(product);
                            return dimensionsLabel
                              ? <p className="product-dimensions-hint">{dimensionsLabel}</p>
                              : null;
                          })()}
                          <p className="product-meta">
                            {formatListingPriceLabel(product)}
                            {product.is_digital_download ? " · Digital download" : ` · Qty: ${product.quantity}`}
                            {toDisplayList(product.category) &&
                              ` · ${toDisplayList(product.category)}`}
                            {toDisplayList(product.materials) &&
                              ` · ${toDisplayList(product.materials)}`}
                          </p>
                        </div>
                        <div className="product-actions">
                          <button
                            className="button-icon edit"
                            onClick={() => {
                              closeProductActionMenu();
                              handleEditProduct(product);
                            }}
                            title="Edit product"
                          >
                            ✎
                          </button>
                          <button
                            className={`button-icon featured-toggle ${(product.is_featured === 1 || product.is_featured === true) ? "active" : ""}`}
                            onClick={() => {
                              closeProductActionMenu();
                              handleToggleProductFeatured(product);
                            }}
                            title={(product.is_featured === 1 || product.is_featured === true) ? "Remove featured" : "Mark as featured"}
                            disabled={activeProductFeaturedId === String(product.id)}
                          >
                            {activeProductFeaturedId === String(product.id)
                              ? "..."
                              : (product.is_featured === 1 || product.is_featured === true)
                                ? "★"
                                : "☆"}
                          </button>
                          <button
                            className={`button-icon home-carousel-toggle ${(product.is_home_featured === 1 || product.is_home_featured === true) ? "active" : ""}`}
                            onClick={() => {
                              closeProductActionMenu();
                              handleToggleProductHomeFeatured(product);
                            }}
                            title={(product.is_home_featured === 1 || product.is_home_featured === true) ? "Remove from home carousel" : "Add to home carousel"}
                            disabled={activeProductHomeFeaturedId === String(product.id)}
                          >
                            {activeProductHomeFeaturedId === String(product.id)
                              ? "..."
                              : (product.is_home_featured === 1 || product.is_home_featured === true)
                                ? "🏠"
                                : "⌂"}
                          </button>
                          <div className="product-actions-menu-wrap" ref={openProductActionMenuId === String(product.id) ? productActionMenuRef : null}>
                            <button
                              type="button"
                              className="button-icon actions-menu-toggle"
                              onClick={() => setOpenProductActionMenuId((prev) => (prev === String(product.id) ? "" : String(product.id)))}
                              title="More actions"
                              aria-label="More actions"
                            >
                              ☰
                            </button>
                            {openProductActionMenuId === String(product.id) && (
                              <div className="product-actions-menu" role="menu" aria-label="More product actions">
                                <button
                                  type="button"
                                  className="product-actions-menu-item inactive"
                                  onClick={() => {
                                    setOpenProductActionMenuId("");
                                    handleToggleProductActive(product);
                                  }}
                                >
                                  Show
                                </button>
                                <button
                                  type="button"
                                  className={`product-actions-menu-item ${facebookPostedProductIds[String(product.id)] ? "posted" : ""}`}
                                  onClick={() => {
                                    setOpenProductActionMenuId("");
                                    handleShareProductToFacebook(product);
                                  }}
                                >
                                  {facebookPostedProductIds[String(product.id)] ? "Posted to Facebook" : "Post to Facebook"}
                                </button>
                                <button
                                  type="button"
                                  className="product-actions-menu-item danger"
                                  onClick={() => {
                                    setOpenProductActionMenuId("");
                                    handleDeleteProduct(product);
                                  }}
                                >
                                  Delete
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {filteredDeactivatedProducts.length > MANUAL_PRODUCTS_PER_PAGE && (
                    <div style={{ display: "flex", gap: "0.45rem", alignItems: "center", justifyContent: "center", flexWrap: "wrap", marginTop: "0.9rem" }}>
                      <button
                        type="button"
                        className="button"
                        disabled={currentDeactivatedProductsPage <= 1}
                        onClick={() => setDeactivatedProductsPage((prev) => Math.max(1, prev - 1))}
                      >
                        Prev
                      </button>

                      {Array.from({ length: totalDeactivatedProductPages }, (_, index) => index + 1).map((pageNumber) => (
                        <button
                          key={`deactivated-page-${pageNumber}`}
                          type="button"
                          className={`button ${currentDeactivatedProductsPage === pageNumber ? "primary" : ""}`}
                          onClick={() => setDeactivatedProductsPage(pageNumber)}
                        >
                          {pageNumber}
                        </button>
                      ))}

                      <button
                        type="button"
                        className="button"
                        disabled={currentDeactivatedProductsPage >= totalDeactivatedProductPages}
                        onClick={() => setDeactivatedProductsPage((prev) => Math.min(totalDeactivatedProductPages, prev + 1))}
                      >
                        Next
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {activeTab === "reviews" && (
          <div className="tab-panel">
            <div className="panel-section">
              <h3>Review Management</h3>
              <form
                className="review-invite-form"
                onSubmit={handleCreateAdminReview}
                onPaste={handleCreateAdminReviewPhotoPaste}
                style={{ marginTop: "1rem" }}
              >
                <h4>Add Etsy Review / Testimonial</h4>
                <p className="form-note" style={{ marginTop: 0 }}>
                  Create a review manually using the same fields as the customer review flow.
                </p>
                <div className="review-invite-grid">
                  <label>
                    <span>Reviewer Name</span>
                    <input
                      type="text"
                      value={adminReviewCreateForm.name}
                      onChange={(event) => setAdminReviewCreateForm((prev) => ({ ...prev, name: event.target.value }))}
                      placeholder="Customer name"
                      required
                    />
                  </label>
                  <label>
                    <span>Rating</span>
                    <select
                      value={adminReviewCreateForm.rating}
                      onChange={(event) => setAdminReviewCreateForm((prev) => ({ ...prev, rating: Number(event.target.value) }))}
                    >
                      <option value={5}>5 - Excellent</option>
                      <option value={4}>4 - Good</option>
                      <option value={3}>3 - Average</option>
                      <option value={2}>2 - Fair</option>
                      <option value={1}>1 - Poor</option>
                    </select>
                  </label>
                </div>
                <label className="review-invite-note">
                  <span>Title</span>
                  <input
                    type="text"
                    value={adminReviewCreateForm.title}
                    onChange={(event) => setAdminReviewCreateForm((prev) => ({ ...prev, title: event.target.value }))}
                    placeholder="Optional review title"
                  />
                </label>
                <label className="review-invite-note">
                  <span>Review Body</span>
                  <textarea
                    value={adminReviewCreateForm.body}
                    onChange={(event) => setAdminReviewCreateForm((prev) => ({ ...prev, body: event.target.value }))}
                    placeholder="Paste the review text here"
                    rows={4}
                    required
                  />
                </label>
                <div className="review-invite-grid">
                  <label>
                    <span>Purchased At</span>
                    <input
                      type="text"
                      value={adminReviewCreateForm.purchased_at}
                      onChange={(event) => setAdminReviewCreateForm((prev) => ({ ...prev, purchased_at: event.target.value }))}
                      onBlur={(event) => {
                        const parsed = parseDateInput(event.target.value);
                        if (parsed) {
                          setAdminReviewCreateForm((prev) => ({ ...prev, purchased_at: parsed }));
                        }
                      }}
                      placeholder="MM/YYYY or just YYYY"
                      required
                    />
                  </label>
                  <label>
                    <span>Purchase Source</span>
                    <select
                      value={adminReviewCreateForm.purchase_source}
                      onChange={(event) => setAdminReviewCreateForm((prev) => ({ ...prev, purchase_source: event.target.value }))}
                    >
                      <option value="etsy">Etsy</option>
                      <option value="sgcg">SGCG ART</option>
                      <option value="ebay">eBay</option>
                      <option value="facebook">Facebook</option>
                      <option value="amazon">Amazon</option>
                      <option value="other">Other</option>
                    </select>
                  </label>
                </div>
                {adminReviewCreateForm.purchase_source === "other" ? (
                  <label className="review-invite-note">
                    <span>Where did it come from?</span>
                    <input
                      type="text"
                      value={adminReviewCreateForm.purchase_source_other}
                      onChange={(event) => setAdminReviewCreateForm((prev) => ({ ...prev, purchase_source_other: event.target.value }))}
                      placeholder="Enter source"
                      required
                    />
                  </label>
                ) : null}
                <div className="review-invite-grid">
                  <label>
                    <span>Visibility</span>
                    <select
                      value={adminReviewCreateForm.status}
                      onChange={(event) => setAdminReviewCreateForm((prev) => ({ ...prev, status: event.target.value }))}
                    >
                      <option value="approved">Show on review page</option>
                      <option value="pending">Pending</option>
                      <option value="hidden">Hidden</option>
                      <option value="rejected">Rejected</option>
                    </select>
                  </label>
                  <label>
                    <span>Photo (optional)</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(event) => setAdminReviewCreateForm((prev) => ({ ...prev, photo: event.target.files?.[0] || null }))}
                    />
                    <input
                      type="text"
                      className="review-photo-paste-target"
                      value="Click here, then right-click → Paste or press Ctrl+V to paste an image"
                      aria-label="Paste review photo from clipboard"
                      onChange={() => {}}
                      onKeyDown={(e) => { if (!((e.ctrlKey || e.metaKey) && e.key === 'v')) e.preventDefault(); }}
                      onPaste={handleCreateAdminReviewPhotoPaste}
                    />
                    {adminReviewCreateForm.photo ? (
                      <>
                        <span className="form-note">Attached photo: {adminReviewCreateForm.photo.name || "clipboard-image"}</span>
                        <button
                          type="button"
                          className="button button-secondary"
                          onClick={() => setAdminReviewCreateForm((prev) => ({ ...prev, photo: null }))}
                        >
                          Remove Photo
                        </button>
                      </>
                    ) : null}
                  </label>
                </div>
                <button type="submit" className="button" disabled={isCreatingAdminReview}>
                  {isCreatingAdminReview ? "Adding Review..." : "Add Review"}
                </button>
              </form>

              {adminReviewCreateStatus ? <p className="form-note">{adminReviewCreateStatus}</p> : null}

              <div className="review-management-toolbar">
                <label htmlFor="review-status-filter">Status</label>
                <select
                  id="review-status-filter"
                  value={adminReviewStatusFilter}
                  onChange={(event) => setAdminReviewStatusFilter(event.target.value)}
                >
                  <option value="all">All</option>
                  <option value="approved">Show on review page</option>
                  <option value="hidden">Hidden</option>
                  <option value="pending">Pending</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>
              {adminReviewStatus ? <p className="form-note">{adminReviewStatus}</p> : null}
              <div className="review-list-container">
                <div className="review-list-header">
                  <h4>Review List</h4>
                  <span className="form-note">{adminReviews.length} total • 10 per page</span>
                </div>
                {adminReviews.length === 0 ? (
                  <p className="form-note">No reviews found.</p>
                ) : (
                  <>
                    <div className="review-management-list">
                      {pagedAdminReviews.map((review) => {
                    const reviewId = String(review.id || "");
                    const reviewName = `${(review.first_name || "").trim()} ${(review.last_name || "").trim()}`.trim() || "Unknown reviewer";
                    const reviewSourceLabel = review.product_type === "invite"
                      ? `Linked to ${String(review.product_id || "").toUpperCase()}`
                      : review.product_type === "testimonial"
                        ? "Etsy testimonial"
                        : `${review.product_type} #${review.product_id}`;
                    const currentSnapshot = buildReviewSnapshot(review);
                    const savedSnapshot = adminReviewSnapshots[reviewId];
                    const isDirty = Boolean(savedSnapshot) && JSON.stringify(savedSnapshot) !== JSON.stringify(currentSnapshot);
                    const isPending = String(review.status || "pending").toLowerCase() === "pending";
                    const needsAction = isPending || isDirty;
                    const isExpanded = String(expandedAdminReviewId || "") === reviewId;
                    const pendingPhoto = adminReviewPhotoFiles[reviewId] || null;
                    const pendingPhotoDelete = Boolean(adminReviewPhotoDeletes[reviewId]);
                    const resolvedReviewImage = resolveMediaUrl(review.review_image_url);

                        return (
                          <article key={review.id} className={`review-row${needsAction ? " review-row-needs-action" : ""}${isExpanded ? " review-row-open" : ""}`}>
                        <div className="review-row-summary">
                          <button
                            type="button"
                            className="review-row-toggle"
                            onClick={() => setExpandedAdminReviewId((prev) => (String(prev || "") === reviewId ? null : review.id))}
                            aria-expanded={isExpanded}
                          >
                            <span className="review-row-caret" aria-hidden="true">{isExpanded ? "▾" : "▸"}</span>
                            <span className="review-row-title">{reviewName} · {reviewSourceLabel}</span>
                          </button>
                          <div className="review-row-summary-right">
                            <span className="review-row-rating">{Number(review.rating || 0)}/5</span>
                            <span className={`review-row-status review-row-status-${String(review.status || "pending").toLowerCase()}`}>
                              {String(review.status || "pending").toLowerCase()}
                            </span>
                            {isPending ? <span className="review-row-flag">Needs approval</span> : null}
                            {isDirty ? <span className="review-row-flag review-row-flag-dirty">Unsaved changes</span> : null}
                          </div>
                        </div>

                        {isExpanded ? (
                          <>
                            <div className="review-row-fields">
                              <label className="review-field review-field-rating">
                                <span>Rating</span>
                                <div className="admin-star-rating" role="radiogroup" aria-label="Select rating">
                                  {STAR_SCALE.map((value) => {
                                    const isActive = Number(review.rating || 0) >= value;
                                    return (
                                      <button
                                        key={`${review.id}-star-${value}`}
                                        type="button"
                                        role="radio"
                                        aria-checked={isActive}
                                        className={`admin-star-button ${isActive ? "active" : ""}`}
                                        onClick={() => handleAdminReviewFieldChange(review.id, "rating", value)}
                                      >
                                        ★
                                      </button>
                                    );
                                  })}
                                </div>
                              </label>

                              <label className="review-field review-field-title">
                                <span>Title</span>
                                <input
                                  type="text"
                                  value={review.title || ""}
                                  onChange={(event) => handleAdminReviewFieldChange(review.id, "title", event.target.value)}
                                />
                              </label>

                              <label className="review-field review-field-visibility">
                                <span>Visibility</span>
                                <select
                                  value={review.status || "pending"}
                                  onChange={(event) => handleAdminReviewFieldChange(review.id, "status", event.target.value)}
                                >
                                  <option value="approved">Show on review page</option>
                                  <option value="hidden">Hidden</option>
                                  <option value="pending">Pending</option>
                                  <option value="rejected">Rejected</option>
                                </select>
                              </label>

                              <label className="review-field review-field-body">
                                <span>Body</span>
                                <textarea
                                  value={review.body || ""}
                                  onChange={(event) => handleAdminReviewFieldChange(review.id, "body", event.target.value)}
                                  rows={2}
                                />
                              </label>

                              <label className="review-field review-field-admin-comment">
                                <span>Admin Comment</span>
                                <textarea
                                  value={review.admin_comment || ""}
                                  onChange={(event) => handleAdminReviewFieldChange(review.id, "admin_comment", event.target.value)}
                                  rows={3}
                                  placeholder="Add a reply to the customer"
                                />
                              </label>

                              <div className="review-field review-field-photo">
                                <span>Review Photo</span>
                                <input
                                  type="file"
                                  accept="image/*"
                                  onChange={(event) => handleAdminReviewPhotoChange(review.id, event.target.files?.[0] || null)}
                                />
                                <input
                                  type="text"
                                  className="review-photo-paste-target"
                                  value="Click here, then right-click → Paste or press Ctrl+V to paste an image"
                                  aria-label="Paste review photo from clipboard"
                                  onChange={() => {}}
                                  onKeyDown={(e) => { if (!((e.ctrlKey || e.metaKey) && e.key === 'v')) e.preventDefault(); }}
                                  onPaste={(event) => {
                                    const items = event.clipboardData?.items;
                                    if (!items) return;
                                    for (let index = 0; index < items.length; index += 1) {
                                      const item = items[index];
                                      if (item.kind === "file" && item.type.startsWith("image/")) {
                                        const file = item.getAsFile();
                                        if (file) {
                                          event.preventDefault();
                                          handleAdminReviewPhotoChange(review.id, file);
                                        }
                                        break;
                                      }
                                    }
                                  }}
                                />
                                {pendingPhoto ? (
                                  <span className="form-note">Pending upload: {pendingPhoto.name || "clipboard-image"}</span>
                                ) : null}
                                {pendingPhotoDelete ? (
                                  <span className="form-note">Photo will be removed when you save.</span>
                                ) : null}
                                <div className="review-photo-actions">
                                  {resolvedReviewImage && !pendingPhotoDelete ? (
                                    <button
                                      type="button"
                                      className="button button-secondary"
                                      onClick={() => handleAdminReviewPhotoDelete(review.id)}
                                    >
                                      Remove Current Photo
                                    </button>
                                  ) : null}
                                  {pendingPhotoDelete ? (
                                    <button
                                      type="button"
                                      className="button button-secondary"
                                      onClick={() => handleAdminReviewPhotoRestore(review.id)}
                                    >
                                      Keep Current Photo
                                    </button>
                                  ) : null}
                                </div>
                                {!pendingPhoto && !pendingPhotoDelete && resolvedReviewImage ? (
                                  <img
                                    src={resolvedReviewImage}
                                    alt="Current review"
                                    className="review-edit-photo-preview"
                                    onLoad={(event) => {
                                      const img = event.currentTarget;
                                      if (img.naturalWidth <= 1 && img.naturalHeight <= 1) {
                                        img.style.display = "none";
                                      }
                                    }}
                                    onError={(event) => {
                                      event.currentTarget.style.display = "none";
                                    }}
                                  />
                                ) : null}
                              </div>
                            </div>

                            <div className="review-row-actions">
                              <button type="button" className="button" onClick={() => handleSaveAdminReview(review)}>
                                Save
                              </button>
                              <button
                                type="button"
                                className="button"
                                onClick={() => handleDeleteAdminReview(review.id)}
                              >
                                Delete
                              </button>
                            </div>
                          </>
                        ) : null}
                          </article>
                        );
                      })}
                    </div>
                    {renderSectionPagination(reviewsPage, totalReviewsPages, setReviewsPage)}
                  </>
                )}
              </div>

              <form className="review-invite-form" onSubmit={handleGenerateUnlimitedReviewCode} style={{ marginTop: "1.25rem" }}>
                <h4>Create Unlimited Code</h4>
                <div className="review-invite-grid" style={{ gridTemplateColumns: "1fr auto" }}>
                  <label style={{ marginBottom: 0 }}>
                    <span>Code Name</span>
                    <input
                      type="text"
                      value={unlimitedReviewCodeName}
                      onChange={(event) => setUnlimitedReviewCodeName(event.target.value.toUpperCase())}
                      placeholder="Enter code name"
                    />
                  </label>
                  <button type="submit" className="button" style={{ alignSelf: "end" }}>
                    Create Unlimited Code
                  </button>
                </div>
              </form>

              <form className="review-invite-form" onSubmit={handleGenerateReviewCode} style={{ marginTop: "1.25rem" }}>
                <h4>Create Customer Review Code</h4>
                <div className="review-invite-grid">
                  <label>
                    <span>Platform</span>
                    <select
                      value={reviewInviteForm.platform}
                      onChange={(event) => setReviewInviteForm((prev) => ({ ...prev, platform: event.target.value }))}
                    >
                      <option value="etsy">Etsy</option>
                      <option value="facebook">Facebook</option>
                      <option value="ebay">eBay</option>
                      <option value="other">Other</option>
                    </select>
                  </label>
                  <label>
                    <span>Product Name</span>
                    <input
                      type="text"
                      value={reviewInviteForm.product_name}
                      onChange={(event) => setReviewInviteForm((prev) => ({ ...prev, product_name: event.target.value }))}
                      placeholder="Optional product name"
                    />
                  </label>
                </div>
                <label className="review-invite-note">
                  <span>Customer Email</span>
                  <input
                    type="email"
                    value={reviewInviteForm.customer_email}
                    onChange={(event) => setReviewInviteForm((prev) => ({ ...prev, customer_email: event.target.value }))}
                    placeholder="customer@email.com"
                  />
                </label>
                <label className="review-invite-note">
                  <span>Internal Note</span>
                  <input
                    type="text"
                    value={reviewInviteForm.note}
                    onChange={(event) => setReviewInviteForm((prev) => ({ ...prev, note: event.target.value }))}
                    placeholder="Optional customer/order note"
                  />
                </label>
                <button type="submit" className="button">Generate Code</button>
              </form>

              {reviewInviteStatus ? <p className="form-note">{reviewInviteStatus}</p> : null}

              {lastGeneratedReviewCode ? (
                <div className="review-invite-latest">
                  <strong>Latest Code: {lastGeneratedReviewCode}</strong>
                  <button
                    type="button"
                    className="button"
                    onClick={() => handleCopyReviewCode(lastGeneratedReviewCode)}
                  >
                    Copy Latest
                  </button>
                </div>
              ) : null}

              <div className="code-list-container">
                <div className="code-list-header">
                  <h4>Code List</h4>
                  <span className="form-note">{reviewInviteCodes.length} total</span>
                </div>
                {reviewInviteCodes.length > 0 ? (
                  <>
                    <div className="review-invite-list">
                      {pagedReviewInviteCodes.map((invite) => (
                        <div key={invite.id} className="review-invite-item">
                          <div>
                            <strong>
                              ({invite.platform || invite.product_type || 'unknown'})
                              {invite.product_name ? ` ${invite.product_name}` : ''}
                            </strong>
                            <p className="form-note" style={{ margin: 0 }}>
                              Uses: {invite.used_count}{invite.max_uses == null ? " (unlimited)" : `/${invite.max_uses}`}
                              {invite.max_uses == null ? "" : ` · Remaining: ${invite.remaining_uses}`}
                              {invite.note ? ` · Internal Note: ${invite.note}` : ""}
                              {invite.expires_at ? ` · Expires: ${new Date(invite.expires_at).toLocaleDateString()}` : ""}
                            </p>
                          </div>
                          <div className="review-invite-actions">
                            {invite.max_uses == null ? null : (
                              <button
                                type="button"
                                className="button"
                                onClick={() => handleRecopyReviewCode(invite)}
                              >
                                Re-copy Code
                              </button>
                            )}
                            {invite.max_uses == null ? null : (
                              <button
                                type="button"
                                className="button"
                                onClick={() => handleResendReviewCode(invite)}
                              >
                                Resend Code
                              </button>
                            )}
                            <button
                              type="button"
                              className="button"
                              onClick={() => handleDeleteReviewCode(invite.id)}
                            >
                              Delete Code
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    {renderSectionPagination(reviewCodesPage, totalReviewCodesPages, setReviewCodesPage)}
                  </>
                ) : (
                  <p className="form-note">No review codes found.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/*
        {activeTab === 'etsy' && (
          <div className="tab-panel">
            <div className="panel-section">
              <h3>Etsy Store Analytics</h3>
              <div className="stats-grid">
                <div className="stat-card">
                  <p className="stat-label">Views</p>
                  <p className="stat-value">Coming soon</p>
                </div>
                <div className="stat-card">
                  <p className="stat-label">Favorites</p>
                  <p className="stat-value">Coming soon</p>
                </div>
                <div className="stat-card">
                  <p className="stat-label">Orders</p>
                  <p className="stat-value">Coming soon</p>
                </div>
              </div>
              <p className="form-note">
                Connect Etsy OAuth to pull real-time shop analytics. Rate limit: 5 QPS, 5K QPD.
              </p>
            </div>
          </div>
        )}
        */}

        {activeTab === "templates" && (
          <div className="tab-panel">
            <TemplateManagement />
          </div>
        )}

        {activeTab === "glass-types" && (
          <div className="tab-panel">
            <GlassTypeManagement />
          </div>
        )}

        {activeTab === "work-orders" && (
          <div className="tab-panel">
            <WorkOrderDashboard />
          </div>
        )}

        {activeTab === "gallery" && (
          <div className="tab-panel">
            <GalleryManagement />
          </div>
        )}
      </div>

      <div
        className={`product-form-wrapper product-form-${PRODUCT_TYPE_CONFIG.find((entry) => entry.key === productType)?.theme || "stainedGlass"}`}
      >
        {showManualProductModal && (
          <div className="modal-overlay">
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>
                  {editingProduct
                    ? "Edit Product"
                    : "Add Product"}
                </h2>
                <button
                  className="modal-close"
                  onClick={handleCloseModal}
                  aria-label="Close"
                >
                  ×
                </button>
              </div>
              <form className="modal-form" onSubmit={handleManualProductSubmit}>
                {/* ── UNIFIED PRODUCT FORM ───────────────────────────────── */}
                <div className="ap-section ap-section-1">

                {/* ── Product Mode Toggles ─── */}
                <div className="multi-select-wrapper" style={{ marginBottom: "1rem" }}>
                  <div className="multi-select-row" style={{ gap: "1rem", alignItems: "center", flexWrap: "wrap" }}>
                    <label className="checkbox-label" style={{ marginBottom: 0 }}>
                      <input
                        type="checkbox"
                        checked={productModePhysical}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          applyProductModeSelection({
                            physical: checked,
                            pattern: productModePattern,
                            template: productModeTemplate,
                          });
                        }}
                      />
                      <span>Physical</span>
                    </label>
                    <label className="checkbox-label" style={{ marginBottom: 0 }}>
                      <input
                        type="checkbox"
                        checked={productModePattern}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          applyProductModeSelection({
                            physical: productModePhysical,
                            pattern: checked,
                            template: productModeTemplate,
                          });
                        }}
                      />
                      <span>Patterns</span>
                    </label>
                    <label className="checkbox-label" style={{ marginBottom: 0 }}>
                      <input
                        type="checkbox"
                        checked={productModeTemplate}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          applyProductModeSelection({
                            physical: productModePhysical,
                            pattern: productModePattern,
                            template: checked,
                          });
                        }}
                      />
                      <span>Template</span>
                    </label>

                    <fieldset style={{ display: "flex", alignItems: "center", gap: "0.5rem", border: "1px solid #d7dbe4", borderRadius: "6px", padding: "0.25rem 0.5rem", margin: 0 }}>
                      <legend style={{ fontSize: "0.75rem", fontWeight: 600, color: "#2f3b52", padding: "0 0.25rem" }}>Watermark</legend>
                      <input
                        type="checkbox"
                        checked={enableWatermark}
                        onChange={(e) => setEnableWatermark(e.target.checked)}
                        style={{ width: "14px", height: "14px", cursor: "pointer", accentColor: "#1f4ea1" }}
                      />
                      {enableWatermark && (
                        <input
                          type="text"
                          value={watermarkText}
                          onChange={(e) => setWatermarkText(e.target.value)}
                          placeholder="Watermark text"
                          style={{ flex: 1, padding: "0.2rem 0.4rem", fontSize: "0.82rem", border: "1px solid #ccc", borderRadius: "4px", width: "auto", minWidth: "120px" }}
                        />
                      )}
                    </fieldset>
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: "0.75rem" }}>
                  <span style={{ whiteSpace: "nowrap", fontWeight: 600, color: "#2f3b52", fontSize: "0.95rem" }}>Product Name:</span>
                  <input
                    type="text"
                    value={manualProduct.name}
                    onChange={(e) =>
                      setManualProduct({
                        ...manualProduct,
                        name: e.target.value,
                      })
                    }
                    placeholder="Enter product name"
                    style={{ flex: 1, width: "auto" }}
                  />
                </div>

                <label>
                  <span style={{ fontWeight: 600 }}>Product Description</span>
                  <textarea
                    value={manualProduct.description}
                    onChange={(e) =>
                      setManualProduct({
                        ...manualProduct,
                        description: e.target.value,
                      })
                    }
                    placeholder="Enter product description"
                    rows="4"
                    style={{ width: "100%" }}
                  />
                </label>

                <label>
                  Product Type
                  <div className="multi-select-wrapper">
                    <div className="multi-select-inner">
                      <div className="multi-select-row">
                        {PRODUCT_TYPE_CONFIG.map((typeEntry) => (
                          <label
                            key={typeEntry.key}
                            className="checkbox-label"
                            style={{ marginBottom: 0 }}
                          >
                            <input
                              type="checkbox"
                              checked={selectedTypeCategory === typeEntry.key}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setProductType(typeEntry.key);
                                  setPrimaryTypeCategory(typeEntry.key);
                                }
                              }}
                            />
                            <span>{typeEntry.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                </label>

                <div className="admin-triple-row">
                  <label className="admin-half-field">
                    Style
                    <div className="multi-select-wrapper">
                      <div className="multi-select-inner">
                        <div className="multi-select-row admin-category-stack">
                          {STYLE_FILTER_OPTIONS.map((option) => (
                            <label key={option} className="checkbox-label" style={{ marginBottom: 0 }}>
                              <input
                                type="checkbox"
                                checked={isManualProductCategoryOptionSelected(option)}
                                onChange={(event) =>
                                  toggleManualProductCategoryOption(option, event.target.checked)
                                }
                              />
                              <span>{option}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                  </label>

                  <label className="admin-half-field">
                    Shape
                    <div className="multi-select-wrapper">
                      <div className="multi-select-inner">
                        <div className="multi-select-row admin-category-stack">
                          {SHAPE_FILTER_OPTIONS.map((option) => (
                            <label key={option} className="checkbox-label" style={{ marginBottom: 0 }}>
                              <input
                                type="checkbox"
                                checked={isManualProductCategoryOptionSelected(option)}
                                onChange={(event) =>
                                  toggleManualProductCategoryOption(option, event.target.checked)
                                }
                              />
                              <span>{option}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                  </label>

                  <label className="admin-half-field">
                    Color
                    <div className="multi-select-wrapper">
                      <div className="multi-select-inner">
                        <div className="multi-select-row admin-category-stack">
                          {COLOR_FILTER_OPTIONS.map((option) => (
                            <label key={option} className="checkbox-label" style={{ marginBottom: 0 }}>
                              <input
                                type="checkbox"
                                checked={isManualProductCategoryOptionSelected(option)}
                                onChange={(event) =>
                                  toggleManualProductCategoryOption(option, event.target.checked)
                                }
                              />
                              <span>{option}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                  </label>
                </div>

                <div className="admin-half-row">
                  <label className="admin-half-field">
                    Tags
                    <div className="multi-select-wrapper">
                      <div className="multi-select-inner">
                        <div className="multi-select-row">
                          <div
                            className="custom-dropdown-container"
                            ref={categoryDropdownRef}
                          >
                            <button
                              type="button"
                              className="custom-dropdown-trigger"
                              onClick={() => {
                                setShowMaterialDropdown(false);
                                setShowCategoryDropdown((prev) => !prev);
                              }}
                            >
                              Select a favorite tag...
                              <span className="dropdown-arrow">▼</span>
                            </button>
                            {showCategoryDropdown &&
                              activeFavoriteCategories.length > 0 && (
                                <div
                                  className="custom-dropdown-menu"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {activeFavoriteCategories.map((cat) => (
                                    <div
                                      key={cat}
                                      className="custom-dropdown-item"
                                    >
                                      <button
                                        type="button"
                                        className="dropdown-item-text"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          if (
                                            !manualProduct.category.includes(cat)
                                          ) {
                                            setManualProduct({
                                              ...manualProduct,
                                              category: [
                                                ...manualProduct.category,
                                                cat,
                                              ],
                                            });
                                          }
                                          closeFavoriteDropdowns();
                                        }}
                                      >
                                        {cat}
                                      </button>
                                      <button
                                        type="button"
                                        className="dropdown-item-delete"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          removeFavoriteCategoryForActiveType(
                                            cat,
                                          );
                                        }}
                                        title="Remove from favorites"
                                      >
                                        ✕
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}
                          </div>
                          <div className="input-button-row">
                            <input
                              id="category-input"
                              name="category-input"
                              type="text"
                              value={categoryInput}
                              onChange={(e) => setCategoryInput(e.target.value)}
                              onKeyPress={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  if (
                                    categoryInput.trim() &&
                                    !manualProduct.category.includes(
                                      categoryInput.trim(),
                                    )
                                  ) {
                                    setManualProduct({
                                      ...manualProduct,
                                      category: [
                                        ...manualProduct.category,
                                        categoryInput.trim(),
                                      ],
                                    });
                                    if (
                                      !activeFavoriteCategories.includes(
                                        categoryInput.trim(),
                                      )
                                    ) {
                                      addFavoriteCategoryForActiveType(
                                        categoryInput.trim(),
                                      );
                                    }
                                    setCategoryInput("");
                                  }
                                }
                              }}
                              placeholder="Type category to add"
                              className="multi-select-input"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                if (
                                  categoryInput.trim() &&
                                  !manualProduct.category.includes(
                                    categoryInput.trim(),
                                  )
                                ) {
                                  setManualProduct({
                                    ...manualProduct,
                                    category: [
                                      ...manualProduct.category,
                                      categoryInput.trim(),
                                    ],
                                  });
                                  if (
                                    !activeFavoriteCategories.includes(
                                      categoryInput.trim(),
                                    )
                                  ) {
                                    addFavoriteCategoryForActiveType(
                                      categoryInput.trim(),
                                    );
                                  }
                                  setCategoryInput("");
                                }
                              }}
                              title="Add category"
                              className="multi-select-add-btn"
                            >
                              + Add
                            </button>
                          </div>
                        </div>
                        {visibleCategoryTags.length > 0 && (
                          <div className="multi-select-tags">
                            {visibleCategoryTags.map((cat) => (
                              <div key={cat} className="category-tag">
                                {cat}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setManualProduct({
                                      ...manualProduct,
                                      category: manualProduct.category.filter(
                                        (c) => c !== cat,
                                      ),
                                    });
                                  }}
                                  className="category-tag-remove"
                                >
                                  ✕
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </label>

                  <label className="admin-half-field">
                    Materials
                    <div className="multi-select-wrapper">
                      <div className="multi-select-inner">
                        <div className="multi-select-row">
                          <div
                            className="custom-dropdown-container"
                            ref={materialDropdownRef}
                          >
                            <button
                              type="button"
                              className="custom-dropdown-trigger"
                              onClick={() => {
                                setShowCategoryDropdown(false);
                                setShowMaterialDropdown((prev) => !prev);
                              }}
                            >
                              Select a favorite material...
                              <span className="dropdown-arrow">▼</span>
                            </button>
                            {showMaterialDropdown &&
                              activeFavoriteMaterials.length > 0 && (
                                <div
                                  className="custom-dropdown-menu"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {activeFavoriteMaterials.map((mat) => (
                                    <div
                                      key={mat}
                                      className="custom-dropdown-item"
                                    >
                                      <button
                                        type="button"
                                        className="dropdown-item-text"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          if (
                                            !manualProduct.materials.includes(mat)
                                          ) {
                                            setManualProduct({
                                              ...manualProduct,
                                              materials: [
                                                ...manualProduct.materials,
                                                mat,
                                              ],
                                            });
                                          }
                                          closeFavoriteDropdowns();
                                        }}
                                      >
                                        {mat}
                                      </button>
                                      <button
                                        type="button"
                                        className="dropdown-item-delete"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          removeFavoriteMaterialForActiveType(
                                            mat,
                                          );
                                        }}
                                        title="Remove from favorites"
                                      >
                                        ✕
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}
                          </div>
                          <div className="input-button-row">
                            <input
                              id="material-input"
                              name="material-input"
                              type="text"
                              value={materialInput}
                              onChange={(e) => setMaterialInput(e.target.value)}
                              onKeyPress={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  if (
                                    materialInput.trim() &&
                                    !manualProduct.materials.includes(
                                      materialInput.trim(),
                                    )
                                  ) {
                                    setManualProduct({
                                      ...manualProduct,
                                      materials: [
                                        ...manualProduct.materials,
                                        materialInput.trim(),
                                      ],
                                    });
                                    if (
                                      !activeFavoriteMaterials.includes(
                                        materialInput.trim(),
                                      )
                                    ) {
                                      addFavoriteMaterialForActiveType(
                                        materialInput.trim(),
                                      );
                                    }
                                    setMaterialInput("");
                                  }
                                }
                              }}
                              placeholder="Type material to add"
                              className="multi-select-input"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                if (
                                  materialInput.trim() &&
                                  !manualProduct.materials.includes(
                                    materialInput.trim(),
                                  )
                                ) {
                                  setManualProduct({
                                    ...manualProduct,
                                    materials: [
                                      ...manualProduct.materials,
                                      materialInput.trim(),
                                    ],
                                  });
                                  if (
                                    !activeFavoriteMaterials.includes(
                                      materialInput.trim(),
                                    )
                                  ) {
                                    addFavoriteMaterialForActiveType(
                                      materialInput.trim(),
                                    );
                                  }
                                  setMaterialInput("");
                                }
                              }}
                              title="Add material"
                              className="multi-select-add-btn"
                            >
                              + Add
                            </button>
                          </div>
                        </div>
                        {manualProduct.materials.length > 0 && (
                          <div className="multi-select-tags">
                            {manualProduct.materials.map((mat) => (
                              <div key={mat} className="material-tag">
                                {mat}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setManualProduct({
                                      ...manualProduct,
                                      materials: manualProduct.materials.filter(
                                        (m) => m !== mat,
                                      ),
                                    });
                                  }}
                                  className="material-tag-remove"
                                >
                                  ✕
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </label>
                </div>

                <div className="size-inputs">
                  <label>
                    Width (inches)
                    <input
                      type="text"
                      value={manualProduct.width}
                      onChange={(e) =>
                        setManualProduct({
                          ...manualProduct,
                          width: e.target.value,
                        })
                      }
                      placeholder="48 3/8 or 25.25"
                      style={{ width: "130px" }}
                    />
                  </label>
                  <label>
                    Height (inches)
                    <input
                      type="text"
                      value={manualProduct.height}
                      onChange={(e) =>
                        setManualProduct({
                          ...manualProduct,
                          height: e.target.value,
                        })
                      }
                      placeholder="48 3/8 or 25.25"
                      style={{ width: "130px" }}
                    />
                  </label>
                  <label>
                    Depth (inches)
                    <input
                      type="text"
                      value={manualProduct.depth}
                      onChange={(e) =>
                        setManualProduct({
                          ...manualProduct,
                          depth: e.target.value,
                        })
                      }
                      placeholder="48 3/8 or 25.25"
                      style={{ width: "130px" }}
                    />
                  </label>
                </div>
                <p className="form-note">Dimensions accept decimals or fractions, for example 25.25, 3/8, or 48 3/8 inch.</p>

                <div className={`price-quantity-inputs ${productModePhysical ? "price-quarter-row" : "price-triple-row"}`}>
                  <label>
                    Price (regular)
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={manualProduct.price}
                      onChange={(e) =>
                        setManualProduct({
                          ...manualProduct,
                          price: e.target.value,
                        })
                      }
                      placeholder="0.00"
                    />
                  </label>
                  <label>
                    Discount %
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={manualProduct.discount_percent || ""}
                      onChange={(e) =>
                        setManualProduct({
                          ...manualProduct,
                          discount_percent: e.target.value,
                        })
                      }
                      placeholder="0"
                    />
                  </label>
                  <label>
                    Sale Price (auto)
                    <input
                      type="text"
                      value={(() => {
                        const base = Number(manualProduct.price || 0);
                        const discount = Number(manualProduct.discount_percent || 0);
                        if (!Number.isFinite(base) || base <= 0) return "";
                        const bounded = Number.isFinite(discount) ? Math.min(100, Math.max(0, discount)) : 0;
                        const sale = base * (1 - bounded / 100);
                        return sale > 0 ? sale.toFixed(2) : "0.00";
                      })()}
                      placeholder="0.00"
                      readOnly
                    />
                  </label>
                  {productModePhysical && (
                    <label>
                      Quantity
                      <input
                        type="number"
                        min="0"
                        value={manualProduct.quantity}
                        onChange={(e) => {
                          setQuantityManuallyEdited(true);
                          setManualProduct({
                            ...manualProduct,
                            quantity: e.target.value,
                          });
                        }}
                        placeholder="0"
                      />
                    </label>
                  )}
                </div>

                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={manualProduct.is_featured}
                    onChange={(e) =>
                      setManualProduct({
                        ...manualProduct,
                        is_featured: e.target.checked,
                      })
                    }
                  />
                  <span>Regular featured product</span>
                </label>

                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={manualProduct.is_home_featured}
                    onChange={(e) => {
                      setManualProduct({
                        ...manualProduct,
                        is_home_featured: e.target.checked,
                      });
                    }}
                  />
                  <span>Show in home page carousel (max 20)</span>
                </label>

                {/* ── Conditional: Difficulty + Digital Price (pattern only) ── */}
                {productModePattern && (
                  <>
                    <div className="price-quantity-inputs">
                      <label>
                        Difficulty
                        <select
                          value={unifiedTemplate.difficulty}
                          onChange={(e) =>
                            setUnifiedTemplate((prev) => ({
                              ...prev,
                              difficulty: e.target.value,
                            }))
                          }
                        >
                          {TEMPLATE_DIFFICULTY_OPTIONS.map((level) => (
                            <option key={level} value={level}>
                              {level}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Digital Price (USD)
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={unifiedTemplate.price_amount}
                          onChange={(e) =>
                            setUnifiedTemplate((prev) => ({
                              ...prev,
                              price_amount: e.target.value,
                              is_digital_download: Number(e.target.value) > 0,
                            }))
                          }
                          placeholder="0.00"
                        />
                      </label>
                      <label>
                        Dimensions
                        <input
                          type="text"
                          value={unifiedTemplate.dimensions}
                          onChange={(e) =>
                            setUnifiedTemplate((prev) => ({
                              ...prev,
                              dimensions: e.target.value,
                            }))
                          }
                          placeholder='Examples: 12" x 18", Letter'
                        />
                      </label>
                    </div>
                  </>
                )}

                {shouldShowProductMediaSection && (
                  <>
                    {/* ── Photos & Video ─────────────────────────── */}
                    <h4 className="ap-section-title" style={{ marginTop: "1.25rem" }}>Photos &amp; Video</h4>
                    <p className="form-note">
                      Add up to 10 photos and 1 video for the product listing.
                    </p>
                    <div className="image-upload-input">
                      <input
                        type="file"
                        id="image-input"
                        accept="image/*,video/*,.mp4,.m4v,.mov,.webm,.avi,.mkv,.mpeg,.mpg,.ogv,.wmv"
                        multiple
                        onChange={(e) => handleAddImages(e.target.files)}
                        style={{ display: "none" }}
                      />
                      <label htmlFor="image-input" className="upload-button">
                        + Add Images / Video
                      </label>
                    </div>

                    {imagePreviews.length > 0 && (
                      <div className="image-gallery">
                        <h4>Added Images ({imagePreviews.length})</h4>
                        <div className="image-grid">
                          {imagePreviews.map((preview) => (
                            <div
                              key={preview.id}
                              className="image-item"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="image-media-frame">
                                {preview.type === "video" ? (
                                  <video src={preview.src} className="image-preview" />
                                ) : (
                                  <img src={preview.src} alt="Preview" className="image-preview" />
                                )}
                                <button
                                  type="button"
                                  className="remove-image-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRemoveImage(preview.id);
                                  }}
                                  title="Remove image"
                                >
                                  ✕
                                </button>
                                {preview.type === "video" && (
                                  <span className="media-badge">Video</span>
                                )}
                              </div>
                              <button
                                type="button"
                                className="button image-download-btn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDownloadPreviewImage(preview, {
                                    fileName: `${sanitizeDownloadBaseName(editingProduct?.name || manualProduct?.name || "product-image")}-${preview.id}`,
                                  });
                                }}
                              >
                                Download
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <label className="checkbox-label" style={{ marginTop: "0.5rem" }}>
                      <input
                        type="checkbox"
                        checked={addImagesToGallery}
                        onChange={(e) => setAddImagesToGallery(e.target.checked)}
                      />
                      <span>Add first product photo to gallery when submitted</span>
                    </label>
                  </>
                )}

                {/* ── Conditional: Pattern/Template file upload ── */}
                {isPatternOrTemplate && (
                  <>
                    <hr className="ap-section-divider" />
                    <p className="form-note">Upload the {productModePattern && productModeTemplate ? "pattern/template" : productModePattern ? "pattern" : "template"} file and up to 3 reference photos.</p>
                    <label>
                      {productModePattern && productModeTemplate ? "Upload Pattern/Template File" : productModePattern ? "Upload Pattern File" : "Upload Template File"}
                      <input
                        type="file"
                        accept=".svg,.pdf,.jpg,.jpeg,.png"
                        onChange={(e) => {
                          const nextFile = e.target.files?.[0] || null;
                          setUnifiedTemplate((prev) => ({
                            ...prev,
                            upload_file: nextFile,
                            existing_upload_preview: nextFile ? null : prev.existing_upload_preview,
                          }));
                        }}
                      />
                    </label>
                    {unifiedTemplate.upload_file ? (
                      <div className="form-note">
                        Selected file: {unifiedTemplate.upload_file.name}
                      </div>
                    ) : null}
                    {!unifiedTemplate.upload_file && unifiedTemplate.existing_upload_preview ? (
                      <div className="image-gallery" style={{ marginTop: "0.5rem" }}>
                        <h4>Current Pattern Image</h4>
                        <div className="image-grid">
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              alignItems: "stretch",
                              gap: "0.5rem",
                              maxWidth: "140px",
                            }}
                          >
                            <div className="image-item">
                              {unifiedTemplate.existing_upload_preview.media_type === "video" ? (
                                <video src={unifiedTemplate.existing_upload_preview.url} className="image-preview" />
                              ) : (
                                <img
                                  src={unifiedTemplate.existing_upload_preview.url}
                                  alt={unifiedTemplate.existing_upload_preview.name || "Current pattern image"}
                                  className="image-preview"
                                />
                              )}
                            </div>
                            <button
                              type="button"
                              style={{
                                width: "100%",
                                padding: 0,
                                border: "none",
                                background: "transparent",
                                color: "#1f5fa6",
                                textAlign: "left",
                                textDecoration: "underline",
                                cursor: "pointer",
                                font: "inherit",
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDownloadPatternCustomerCopy();
                              }}
                            >
                              Download Customer Copy
                            </button>
                          </div>
                        </div>
                        <span className="form-note">Current saved pattern asset. Upload a new file above to replace it.</span>
                      </div>
                    ) : null}
                    <div className="image-upload-input" style={{ marginTop: "0.5rem" }}>
                      <input
                        type="file"
                        id="template-ref-input"
                        accept="image/*"
                        multiple
                        onChange={(e) => {
                          const files = Array.from(e.target.files || []);
                          const toAdd = files.slice(0, 3 - templateRefPhotos.length);
                          const newPreviews = toAdd.map((file) => ({
                            id: `${file.name}-${Date.now()}-${Math.random()}`,
                            src: URL.createObjectURL(file),
                            file,
                          }));
                          setTemplateRefPhotos((prev) => [...prev, ...newPreviews]);
                          e.target.value = "";
                        }}
                        style={{ display: "none" }}
                        disabled={templateRefPhotos.length >= 3}
                      />
                      <label
                        htmlFor="template-ref-input"
                        className="upload-button"
                        style={templateRefPhotos.length >= 3 ? { opacity: 0.5, cursor: "not-allowed" } : {}}
                      >
                        + Add Reference Photos ({templateRefPhotos.length}/3)
                      </label>
                      <span className="form-note">Reference photos help customers visualize the pattern.</span>
                    </div>
                    {templateRefPhotos.length > 0 && (
                      <div className="image-gallery">
                        <div className="image-grid">
                          {templateRefPhotos.map((photo) => (
                            <div
                              key={photo.id}
                              className="image-item"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="image-media-frame">
                                <img src={photo.src} alt="Ref" className="image-preview" />
                                <button
                                  type="button"
                                  className="remove-image-btn"
                                  style={{ opacity: 1 }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setTemplateRefPhotos((prev) =>
                                      prev.filter((p) => p.id !== photo.id),
                                    );
                                  }}
                                  title="Remove photo"
                                  aria-label="Remove reference photo"
                                >
                                  ✕
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}

                </div>



                        {/* ── SECTION 5: RELATED CUSTOMER LINKS ────────── */}
                        <div className="ap-section ap-section-5">
                          <h4 className="ap-section-title">🔗 Section 5 — Related Customer Links</h4>
                          <p className="form-note">
                            Link this listing to existing templates, patterns, products, or gallery entries.
                          </p>
                          <p className="form-note">
                            Blank fields auto-match by name. Manual selections stay locked, including "None".
                          </p>

                          <label>
                            {`Linked Template (${templateOptionCount})`}
                            <select
                              value={manualProduct.related_links?.template_id || ""}
                              onChange={(e) => {
                                const nextId = e.target.value;
                                const selectedTemplate = productTemplateOptions.find(
                                  (entry) => String(entry.id) === String(nextId),
                                );
                                setManualProduct((prev) => ({
                                  ...prev,
                                  related_links: applyRelatedLinkSelection(
                                    prev.related_links,
                                    "template_id",
                                    { id: nextId, name: selectedTemplate?.name || "" },
                                    { markManual: true },
                                  ),
                                }));
                              }}
                            >
                              <option value="">None</option>
                              {productTemplateOptions.map((template) => (
                                <option key={template.id} value={template.id}>
                                  {template.name}
                                </option>
                              ))}
                            </select>
                            {(() => {
                              const selId = String(manualProduct.related_links?.template_id || "");
                              if (!selId) return null;
                              const sel = productTemplateOptions.find((e) => String(e.id) === selId);
                              const thumb = resolveMediaUrl(sel?.thumbnail_url || "");
                              return thumb ? (
                                <img
                                  src={thumb}
                                  alt={sel?.name || "Template preview"}
                                  style={{ width: "80px", height: "80px", objectFit: "cover", borderRadius: "4px", marginTop: "6px", display: "block" }}
                                />
                              ) : null;
                            })()}
                          </label>

                          <label>
                            {`Linked Pattern Product (${patternOptionCount})`}
                            <select
                              value={manualProduct.related_links?.pattern_product_id || ""}
                              onChange={(e) => {
                                const nextId = e.target.value;
                                const selectedPattern = patternProductOptions.find(
                                  (entry) => String(entry.id) === String(nextId),
                                );
                                setManualProduct((prev) => ({
                                  ...prev,
                                  related_links: applyRelatedLinkSelection(
                                    prev.related_links,
                                    "pattern_product_id",
                                    { id: nextId, name: selectedPattern?.name || "" },
                                    { markManual: true },
                                  ),
                                }));
                              }}
                            >
                              <option value="">None</option>
                              {patternProductOptions.map((pattern) => (
                                <option key={pattern.id} value={pattern.id}>
                                  {pattern.name}
                                </option>
                              ))}
                            </select>
                            {(() => {
                              const selId = String(manualProduct.related_links?.pattern_product_id || "");
                              if (!selId) return null;
                              const sel = patternProductOptions.find((e) => String(e.id) === selId);
                              const thumb = resolveMediaUrl(sel?.image_url || "");
                              return thumb ? (
                                <img
                                  src={thumb}
                                  alt={sel?.name || "Pattern preview"}
                                  style={{ width: "80px", height: "80px", objectFit: "cover", borderRadius: "4px", marginTop: "6px", display: "block" }}
                                />
                              ) : null;
                            })()}
                          </label>

                          <label>
                            {`Linked Product (${linkedProductOptionCount})`}
                            <select
                              value={manualProduct.related_links?.linked_product_id || ""}
                              onChange={(e) => {
                                const nextId = e.target.value;
                                const selectedProduct = linkedProductOptions.find(
                                  (entry) => String(entry.id) === String(nextId),
                                );
                                setManualProduct((prev) => ({
                                  ...prev,
                                  related_links: applyRelatedLinkSelection(
                                    prev.related_links,
                                    "linked_product_id",
                                    { id: nextId, name: selectedProduct?.name || "" },
                                    { markManual: true },
                                  ),
                                }));
                              }}
                            >
                              <option value="">None</option>
                              {linkedProductOptions.map((entry) => (
                                <option key={entry.id} value={entry.id}>
                                  {entry.name}
                                </option>
                              ))}
                            </select>
                            {(() => {
                              const selId = String(manualProduct.related_links?.linked_product_id || "");
                              if (!selId) return null;
                              const sel = linkedProductOptions.find((e) => String(e.id) === selId);
                              const thumb = resolveMediaUrl(sel?.image_url || "");
                              return thumb ? (
                                <img
                                  src={thumb}
                                  alt={sel?.name || "Product preview"}
                                  style={{ width: "80px", height: "80px", objectFit: "cover", borderRadius: "4px", marginTop: "6px", display: "block" }}
                                />
                              ) : null;
                            })()}
                          </label>

                          <label>
                            {`Linked Photo Gallery Entry (${galleryOptionCount})`}
                            <select
                              value={manualProduct.related_links?.gallery_photo_id || ""}
                              onChange={(e) => {
                                const nextId = e.target.value;
                                const selectedPhoto = productGalleryOptions.find(
                                  (entry) => String(entry.id) === String(nextId),
                                );
                                setManualProduct((prev) => ({
                                  ...prev,
                                  related_links: applyRelatedLinkSelection(
                                    prev.related_links,
                                    "gallery_photo_id",
                                    {
                                      id: nextId,
                                      name: selectedPhoto?.panel_name || "",
                                      template_id: selectedPhoto?.template_id
                                        ? String(selectedPhoto.template_id)
                                        : "",
                                    },
                                    { markManual: true },
                                  ),
                                }));
                              }}
                            >
                              <option value="">None</option>
                              {productGalleryOptions.map((photo) => (
                                <option key={photo.id} value={photo.id}>
                                  {photo.panel_name || `Photo #${photo.id}`}
                                </option>
                              ))}
                            </select>
                            {(() => {
                              const selId = String(manualProduct.related_links?.gallery_photo_id || "");
                              if (!selId) return null;
                              const sel = productGalleryOptions.find((e) => String(e.id) === selId);
                              const thumb = resolveMediaUrl(sel?.image_url || "");
                              return thumb ? (
                                <img
                                  src={thumb}
                                  alt={sel?.panel_name || "Gallery preview"}
                                  style={{ width: "80px", height: "80px", objectFit: "cover", borderRadius: "4px", marginTop: "6px", display: "block" }}
                                />
                              ) : null;
                            })()}
                          </label>
                        </div>

                        {status ? (
                          <p
                            className={`form-note manual-product-status${manualProductStatusTone === "error" ? " is-error" : ""}`}
                            role="status"
                            aria-live="polite"
                          >
                            {status}
                          </p>
                        ) : null}

                        <div className="modal-actions">
                          <button
                            type="button"
                            className="button"
                            onClick={handleCloseModal}
                          >
                            Cancel
                          </button>
                          <button type="submit" className="button primary">
                            {editingProduct
                              ? "Update Product"
                              : isPatternOrTemplate
                                ? "Save Product + Template"
                                : "Add Listing"}
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
                )}
              </div>

              {editingCustomer && (
                <div className="modal-overlay">
                  <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                    <div className="modal-header">
                      <h2>Edit Customer</h2>
                      <button className="modal-close" onClick={closeCustomerEditModal} aria-label="Close">
                        ×
                      </button>
                    </div>
                    <form className="modal-form" onSubmit={handleCustomerSave}>
                      <div className="panel-section" style={{ padding: "1rem", marginTop: "0.15rem" }}>
                        <h3 style={{ marginBottom: "0.75rem", fontSize: "1.05rem" }}>Send Template to Customer</h3>
                        <label>
                          Template
                          <select
                            value={sendTemplateForm.template_id}
                            onChange={(e) =>
                              setSendTemplateForm((prev) => ({
                                ...prev,
                                template_id: e.target.value,
                                uploaded_file: e.target.value ? null : prev.uploaded_file,
                              }))
                            }
                          >
                            <option value="">Select template...</option>
                            {adminTemplateOptions.map((template) => (
                              <option key={template.id} value={template.id}>
                                {template.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Or Upload New Template
                          <input
                            type="file"
                            accept=".jpg,.jpeg,.png,.gif,.webp"
                            onChange={(e) => {
                              const nextFile = e.target.files?.[0] || null;
                              setSendTemplateForm((prev) => ({
                                ...prev,
                                template_id: nextFile ? "" : prev.template_id,
                                uploaded_file: nextFile,
                                new_template_name:
                                  prev.new_template_name
                                  || (nextFile ? nextFile.name.replace(/\.[^.]+$/, "") : ""),
                              }));
                            }}
                          />
                        </label>
                {sendTemplateForm.uploaded_file && (
                  <>
                    <div className="form-note">Selected file: {sendTemplateForm.uploaded_file.name}</div>
                    <div className="form-note">If upload is too large, reduce file size (max 50 MB).</div>
                  </>
                )}
                <label>
                  New Template Name (required for upload)
                  <input
                    type="text"
                    value={sendTemplateForm.new_template_name}
                    onChange={(e) =>
                      setSendTemplateForm((prev) => ({ ...prev, new_template_name: e.target.value }))
                    }
                    placeholder="Enter template name"
                  />
                </label>
                <label>
                  New Template Category (optional)
                  <input
                    type="text"
                    value={sendTemplateForm.new_template_category}
                    onChange={(e) =>
                      setSendTemplateForm((prev) => ({ ...prev, new_template_category: e.target.value }))
                    }
                    placeholder="Defaults to Direct Message"
                  />
                </label>
                <label>
                  Project Name (optional)
                  <input
                    type="text"
                    value={sendTemplateForm.project_name}
                    onChange={(e) =>
                      setSendTemplateForm((prev) => ({ ...prev, project_name: e.target.value }))
                    }
                    placeholder="Custom project title for customer"
                  />
                </label>
                <label>
                  Direct Message to Customer
                  <textarea
                    rows={3}
                    value={sendTemplateForm.message}
                    onChange={(e) =>
                      setSendTemplateForm((prev) => ({ ...prev, message: e.target.value }))
                    }
                    placeholder="Add instructions for the customer before they open Designer"
                  />
                </label>
                <div style={{ display: "flex", gap: "0.6rem", alignItems: "center", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="button primary"
                    onClick={handleSendTemplateToCustomer}
                    disabled={isSendingTemplate}
                  >
                    {isSendingTemplate ? "Sending..." : "Send Template"}
                  </button>
                  {sendTemplateStatus && <span className="form-note">{sendTemplateStatus}</span>}
                </div>
              </div>

              <label>
                First Name
                <input
                  type="text"
                  value={customerForm.first_name}
                  onChange={(e) =>
                    setCustomerForm((prev) => ({ ...prev, first_name: e.target.value }))
                  }
                />
              </label>

              <label>
                Last Name
                <input
                  type="text"
                  value={customerForm.last_name}
                  onChange={(e) =>
                    setCustomerForm((prev) => ({ ...prev, last_name: e.target.value }))
                  }
                />
              </label>

              <label>
                Email *
                <input
                  type="text"
                  value={customerForm.email}
                  required
                  onChange={(e) =>
                    setCustomerForm((prev) => ({ ...prev, email: e.target.value }))
                  }
                />
              </label>

              <label>
                Phone
                <input
                  type="text"
                  value={customerForm.phone}
                  onChange={(e) =>
                    setCustomerForm((prev) => ({ ...prev, phone: e.target.value }))
                  }
                />
              </label>

              <div className="panel-section" style={{ padding: "1rem", marginTop: "0.25rem" }}>
                <h3 style={{ marginBottom: "0.75rem", fontSize: "1.05rem" }}>Address</h3>
                <label>
                  Address Label
                  <input
                    type="text"
                    value={customerForm.address.label}
                    onChange={(e) =>
                      setCustomerForm((prev) => ({
                        ...prev,
                        address: { ...prev.address, label: e.target.value },
                      }))
                    }
                  />
                </label>
                <label>
                  Address Line 1
                  <input
                    type="text"
                    value={customerForm.address.line1}
                    onChange={(e) =>
                      setCustomerForm((prev) => ({
                        ...prev,
                        address: { ...prev.address, line1: e.target.value },
                      }))
                    }
                  />
                </label>
                <label>
                  Address Line 2
                  <input
                    type="text"
                    value={customerForm.address.line2}
                    onChange={(e) =>
                      setCustomerForm((prev) => ({
                        ...prev,
                        address: { ...prev.address, line2: e.target.value },
                      }))
                    }
                  />
                </label>
                <div className="price-quantity-inputs">
                  <label>
                    City
                    <input
                      type="text"
                      value={customerForm.address.city}
                      onChange={(e) =>
                        setCustomerForm((prev) => ({
                          ...prev,
                          address: { ...prev.address, city: e.target.value },
                        }))
                      }
                    />
                  </label>
                  <label>
                    State
                    <input
                      type="text"
                      value={customerForm.address.state}
                      onChange={(e) =>
                        setCustomerForm((prev) => ({
                          ...prev,
                          address: { ...prev.address, state: e.target.value },
                        }))
                      }
                    />
                  </label>
                </div>
                <div className="price-quantity-inputs">
                  <label>
                    Postal Code
                    <input
                      type="text"
                      value={customerForm.address.postal_code}
                      onChange={(e) =>
                        setCustomerForm((prev) => ({
                          ...prev,
                          address: { ...prev.address, postal_code: e.target.value },
                        }))
                      }
                    />
                  </label>
                  <label>
                    Country
                    <input
                      type="text"
                      value={customerForm.address.country}
                      onChange={(e) =>
                        setCustomerForm((prev) => ({
                          ...prev,
                          address: { ...prev.address, country: e.target.value },
                        }))
                      }
                    />
                  </label>
                </div>
              </div>

              <div className="panel-section" style={{ padding: "1rem", marginTop: "0.25rem" }}>
                <h3 style={{ marginBottom: "0.75rem", fontSize: "1.05rem" }}>Customer Details</h3>
                <p className="form-note">ID: {editingCustomer.id}</p>
                <p className="form-note">
                  Created: {editingCustomer.created_at || "-"}
                </p>
                <p className="form-note">
                  Last Login: {editingCustomer.last_login_at || "-"}
                </p>
                <p className="form-note">
                  Updated: {editingCustomer.updated_at || "-"}
                </p>
              </div>

              <div className="panel-section" style={{ padding: "1rem", marginTop: "0.25rem" }}>
                <h3 style={{ marginBottom: "0.75rem", fontSize: "1.05rem" }}>Admin Notes (Private)</h3>
                <label>
                  Notes for Admin Only
                  <textarea
                    rows={4}
                    value={customerForm.admin_notes || ""}
                    onChange={(e) =>
                      setCustomerForm((prev) => ({ ...prev, admin_notes: e.target.value }))
                    }
                    placeholder="Add internal notes about this customer. Only admins can view this."
                  />
                </label>
              </div>

              {customerStatus && <p className="status-text">{customerStatus}</p>}

              <div className="modal-actions">
                <button type="button" className="button" onClick={closeCustomerEditModal}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="button"
                  onClick={handleDeleteCustomer}
                  disabled={isDeletingCustomer || isSavingCustomer}
                >
                  {isDeletingCustomer ? "Deleting..." : "Delete Customer"}
                </button>
                <button type="submit" className="button primary" disabled={isSavingCustomer}>
                  {isSavingCustomer ? "Saving..." : "Save Customer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
