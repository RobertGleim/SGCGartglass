import { useState, useEffect, useMemo, useRef } from "react";
// import AddEtsyListingForm from "../../components/forms/AddEtsyListingForm";
import {
  createAdminTemplate,
  deleteAdminReview,
  deleteCustomer,
  fetchAdminReviews,
  fetchAdminReviewInviteCodes,
  getAdminGalleryPhotos,
  fetchCustomers,
  getCustomerDetails,
  publishManualProductToFacebook,
  getTemplates,
  sendTemplateToCustomerWorkOrder,
  uploadAdminTemplateImage,
  updateAdminReview,
  createAdminReviewInviteCode,
  deleteAdminReviewInviteCode,
  fetchAdminDigitalCheckoutSessions,
  recoverAdminCheckoutSession,
  resendAdminCheckoutDownloadEmail,
  submitGalleryPhoto,
  updateAdminTemplate,
  updateCustomer,
} from "../../services/api.js";
import TemplateManagement from "./TemplateManagement";
import GlassTypeManagement from "./GlassTypeManagement";
import WorkOrderDashboard from "./WorkOrderDashboard";
import GalleryManagement from "./GalleryManagement";
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

const normalizeCategory = (value) => String(value || "").trim().toLowerCase();

const isDirectMessageTemplate = (template) =>
  normalizeCategory(template?.category) === "direct message";

const canUseTemplateForCustomer = (template, customerId) => {
  if (!isDirectMessageTemplate(template)) return true;
  return Number(template?.assigned_customer_id || 0) === Number(customerId || 0);
};

const FACEBOOK_POSTED_STORAGE_KEY = "adminFbPostedManualProducts";
const STAR_SCALE = [1, 2, 3, 4, 5];
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

const createDefaultRelatedLinks = () => ({
  template_id: "",
  template_name: "",
  pattern_product_id: "",
  pattern_product_name: "",
  gallery_photo_id: "",
  gallery_panel_name: "",
  gallery_template_id: "",
});

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
  quantity: "",
  is_featured: false,
  is_digital_download: false,
  related_links: createDefaultRelatedLinks(),
});

const createEmptyUnifiedTemplate = () => ({
  name: "",
  category: "",
  difficulty: TEMPLATE_DIFFICULTY_OPTIONS[0],
  dimensions: "",
  is_digital_download: true,
  price_amount: "",
  upload_file: null,
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

const hasAnyRelatedLinkValue = (relatedLinks) => {
  if (!relatedLinks || typeof relatedLinks !== "object") return false;
  return [
    relatedLinks.template_id,
    relatedLinks.template_name,
    relatedLinks.pattern_product_id,
    relatedLinks.pattern_product_name,
    relatedLinks.gallery_photo_id,
    relatedLinks.gallery_panel_name,
    relatedLinks.gallery_template_id,
  ].some((entry) => String(entry || "").trim() !== "");
};

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
    related_links:
      value.related_links && typeof value.related_links === "object"
        ? value.related_links
        : createDefaultRelatedLinks(),
  };
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
  items = [],
  manualProducts = [],
  onRefreshCatalog,
  onAddItem,
  onAddManualProduct,
  onUpdateManualProduct,
  onDeleteManualProduct,
  onLogout,
}) {
  const PRODUCT_TYPE_CONFIG = [
    { key: "stainedGlassPanels", label: "Stained Glass Panels", theme: "stainedGlass" },
    { key: "fusedArt", label: "Fused Art", theme: "stainedGlass" },
    { key: "laserAndSandblasting", label: "Laser and Sandblasting", theme: "stainedGlass" },
    { key: "woodArt", label: "Wood Art", theme: "woodwork" },
  ];

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

  const createEmptyTypeBuckets = () =>
    PRODUCT_TYPE_CONFIG.reduce(
      (acc, entry) => ({ ...acc, [entry.key]: [] }),
      {},
    );

  const normalizedItems = useMemo(
    () => ensureArray(items).filter((entry) => entry && typeof entry === "object"),
    [items],
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
  const [reviewInviteForm, setReviewInviteForm] = useState({
    platform: "etsy",
    product_name: "",
    customer_email: "",
    note: "",
  });

  useEffect(() => {
    if (activeTab === "customers") {
      fetchCustomers()
        .then((res) => setCustomers(res))
        .catch(() => setCustomers([]));
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== "reviews") return;

    fetchAdminReviews({
      limit: 300,
      ...(adminReviewStatusFilter !== "all" ? { status: adminReviewStatusFilter } : {}),
    })
      .then((res) => setAdminReviews(Array.isArray(res) ? res : []))
      .catch(() => setAdminReviews([]));
  }, [activeTab, adminReviewStatusFilter]);

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

  const handleSaveAdminReview = async (review) => {
    setAdminReviewStatus("");
    try {
      await updateAdminReview(review.id, {
        rating: Number(review.rating),
        title: review.title || "",
        body: review.body || "",
        status: review.status || "pending",
      });
      setAdminReviewStatus("Review updated.");
    } catch (error) {
      setAdminReviewStatus(error?.response?.data?.error || error?.message || "Failed to update review.");
    }
  };

  const handleDeleteAdminReview = async (reviewId) => {
    setAdminReviewStatus("");
    try {
      await deleteAdminReview(reviewId);
      setAdminReviews((prev) => prev.filter((entry) => entry.id !== reviewId));
      setAdminReviewStatus("Review deleted.");
    } catch (error) {
      setAdminReviewStatus(error?.response?.data?.error || error?.message || "Failed to delete review.");
    }
  };

  const handleGenerateReviewCode = async (event) => {
    event.preventDefault();
    setReviewInviteStatus("");
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
    try {
      await deleteAdminReviewInviteCode(inviteId);
      setReviewInviteCodes((prev) => prev.filter((entry) => entry.id !== inviteId));
      setReviewInviteStatus("Review code deleted.");
    } catch (error) {
      setReviewInviteStatus(error?.response?.data?.error || error?.message || "Failed to delete review code.");
    }
  };

  const regenerateReviewCode = async (invite, options = {}) => {
    if (!invite) return;
    setReviewInviteStatus("");

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
    }
  };

  const handleRecopyReviewCode = async (invite) => {
    await regenerateReviewCode(invite, { copy: true, requireEmail: false });
  };

  const handleResendReviewCode = async (invite) => {
    await regenerateReviewCode(invite, { copy: false, requireEmail: true });
  };
  // eslint-disable-next-line no-unused-vars
  const [status, setStatus] = useState("");
  const [isRefreshingCatalog, setIsRefreshingCatalog] = useState(false);
  const [manualProductSearch, setManualProductSearch] = useState("");
  const [manualProductTypeFilter, setManualProductTypeFilter] = useState("all");
  const [manualProductsPage, setManualProductsPage] = useState(1);
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
            ? parsed.stainedGlassPanels
            : Array.isArray(parsed?.stainedGlass)
              ? parsed.stainedGlass
              : [],
          fusedArt: Array.isArray(parsed?.fusedArt) ? parsed.fusedArt : [],
          laserAndSandblasting: Array.isArray(parsed?.laserAndSandblasting)
            ? parsed.laserAndSandblasting
            : [],
          woodArt: Array.isArray(parsed?.woodArt)
            ? parsed.woodArt
            : Array.isArray(parsed?.woodwork)
              ? parsed.woodwork
              : [],
          patterns: Array.isArray(parsed?.patterns) ? parsed.patterns : [],
        };
      }

      const legacyCategories = readStoredJson("favoriteCategories", []);
      return {
        ...createEmptyTypeBuckets(),
        stainedGlassPanels: Array.isArray(legacyCategories) ? legacyCategories : [],
      };
    },
  );
  const [favoriteMaterialsByType, setFavoriteMaterialsByType] = useState(() => {
    const parsed = readStoredJson("favoriteMaterialsByType", null);
    if (parsed) {
      return {
        ...createEmptyTypeBuckets(),
        stainedGlassPanels: Array.isArray(parsed?.stainedGlassPanels)
          ? parsed.stainedGlassPanels
          : Array.isArray(parsed?.stainedGlass)
            ? parsed.stainedGlass
            : [],
        fusedArt: Array.isArray(parsed?.fusedArt) ? parsed.fusedArt : [],
        laserAndSandblasting: Array.isArray(parsed?.laserAndSandblasting)
          ? parsed.laserAndSandblasting
          : [],
        woodArt: Array.isArray(parsed?.woodArt)
          ? parsed.woodArt
          : Array.isArray(parsed?.woodwork)
            ? parsed.woodwork
            : [],
        patterns: Array.isArray(parsed?.patterns) ? parsed.patterns : [],
      };
    }

    const legacyMaterials = readStoredJson("favoriteMaterials", []);
    return {
      ...createEmptyTypeBuckets(),
      stainedGlassPanels: Array.isArray(legacyMaterials) ? legacyMaterials : [],
    };
  });
  const [manualProduct, setManualProduct] = useState(createEmptyManualProduct());
  const [unifiedTemplate, setUnifiedTemplate] = useState(createEmptyUnifiedTemplate());
  const [relatedTemplateUpload, setRelatedTemplateUpload] = useState(createEmptyRelatedTemplateUpload());
  const [relatedGalleryUpload, setRelatedGalleryUpload] = useState(createEmptyRelatedGalleryUpload());
  const [showRelatedLinksSection, setShowRelatedLinksSection] = useState(false);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [showMaterialDropdown, setShowMaterialDropdown] = useState(false);
  const categoryDropdownRef = useRef(null);
  const materialDropdownRef = useRef(null);
  const openingCustomerIdRef = useRef(null);
  const [categoryInput, setCategoryInput] = useState("");
  const [materialInput, setMaterialInput] = useState("");
  const [imagePreviews, setImagePreviews] = useState([]);
  const [enableWatermark, setEnableWatermark] = useState(true);
  const [watermarkText, setWatermarkText] = useState("SGCG ART GLASS");
  const [addImagesToGallery, setAddImagesToGallery] = useState(false);
  const [templateRefPhotos, setTemplateRefPhotos] = useState([]);
  const [templateNameManuallyEdited, setTemplateNameManuallyEdited] = useState(false);
  const [patternOnly, setPatternOnly] = useState(false);
  const [patternOnlyDescription, setPatternOnlyDescription] = useState("");
  const [isSavingManualProduct, setIsSavingManualProduct] = useState(false);

  const activeFavoriteCategories = favoriteCategoriesByType[productType] || [];
  const activeFavoriteMaterials = favoriteMaterialsByType[productType] || [];

  const addFavoriteCategoryForActiveType = (value) => {
    setFavoriteCategoriesByType((prev) => {
      const currentValues = prev[productType] || [];
      if (currentValues.includes(value)) {
        return prev;
      }

      return {
        ...prev,
        [productType]: [...currentValues, value],
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
        [productType]: [...currentValues, value],
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

  const inferProductType = (product) => {
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
  };

  const patternProductOptions = useMemo(() => {
    const inferred = normalizedManualProducts
      .filter((entry) => inferProductType(entry) === "patterns")
      .map((entry) => ({
        id: entry.id,
        name: (entry.name || `Pattern #${entry.id}`).trim(),
      }))
      .filter((entry) => entry.id);

    const source = inferred.length > 0
      ? inferred
      : normalizedManualProducts
        .map((entry) => ({
          id: entry.id,
          name: (entry.name || `Product #${entry.id}`).trim(),
        }))
        .filter((entry) => entry.id);

    const seen = new Set();
    return source.filter((entry) => {
      const key = String(entry.id);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [normalizedManualProducts]);

  const filteredManualProducts = useMemo(() => {
    const searchLower = manualProductSearch.toLowerCase();
    return normalizedManualProducts.filter((product) => {
      const name = toSearchableText(product.name);
      const description = toSearchableText(product.description);
      const category = toSearchableText(product.category);
      const materials = toSearchableText(product.materials);

      const matchesType =
        manualProductTypeFilter === "all"
        || inferProductType(product) === manualProductTypeFilter;

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
  }, [normalizedManualProducts, manualProductSearch, manualProductTypeFilter]);

  const totalManualProductPages = Math.max(
    1,
    Math.ceil(filteredManualProducts.length / MANUAL_PRODUCTS_PER_PAGE),
  );

  const currentManualProductsPage = Math.min(manualProductsPage, totalManualProductPages);

  const pagedManualProducts = useMemo(() => {
    const startIndex = (currentManualProductsPage - 1) * MANUAL_PRODUCTS_PER_PAGE;
    return filteredManualProducts.slice(startIndex, startIndex + MANUAL_PRODUCTS_PER_PAGE);
  }, [filteredManualProducts, currentManualProductsPage]);

  const pagedCustomers = useMemo(() => {
    const startIndex = (customersPage - 1) * SECTION_PAGE_SIZE;
    return customers.slice(startIndex, startIndex + SECTION_PAGE_SIZE);
  }, [customers, customersPage]);

  const totalCustomersPages = Math.max(1, Math.ceil(customers.length / SECTION_PAGE_SIZE));

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

  const isTypeCategory = (value) => Boolean(normalizeTypeFromCategory(value));

  const removeTypeCategories = (categories = []) => {
    return categories.filter((entry) => !isTypeCategory(entry));
  };

  const setPrimaryTypeCategory = (type) => {
    const label = PRODUCT_TYPE_LABEL_BY_KEY[type] || PRODUCT_TYPE_LABEL_BY_KEY.stainedGlassPanels;
    setManualProduct((prev) => ({
      ...prev,
      category: [label, ...removeTypeCategories(prev.category)],
      is_digital_download: type === "patterns" ? true : Boolean(prev.is_digital_download),
    }));
  };

  const visibleCategoryTags = removeTypeCategories(manualProduct.category);
  const selectedTypeCategory =
    manualProduct.category
      .map((entry) => normalizeTypeFromCategory(entry))
      .find(Boolean) || productType;
  const templateOptionCount = productTemplateOptions.length;
  const patternOptionCount = patternProductOptions.length;
  const galleryOptionCount = productGalleryOptions.length;
  const isProductSectionEnabled = true;
  const isTemplateSectionEnabled = true;
  const templateNameFilled = Boolean(String(unifiedTemplate.name || "").trim());
  const shouldRequireProductFields = isProductSectionEnabled && (editingProduct || !templateNameFilled);

  const closeFavoriteDropdowns = () => {
    setShowCategoryDropdown(false);
    setShowMaterialDropdown(false);
  };

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
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        closeFavoriteDropdowns();
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
    const incomingPhotoCount = incomingFiles.filter((file) => !file.type.startsWith("video")).length;
    const incomingVideoCount = incomingFiles.filter((file) => file.type.startsWith("video")).length;

    if (existingPhotoCount + incomingPhotoCount > MAX_MANUAL_UPLOAD_PHOTOS) {
      setStatus(`Upload is too large. Please reduce the number of photos to ${MAX_MANUAL_UPLOAD_PHOTOS} or fewer.`);
      return;
    }

    if (existingVideoCount + incomingVideoCount > MAX_MANUAL_UPLOAD_VIDEOS) {
      setStatus(`Only ${MAX_MANUAL_UPLOAD_VIDEOS} video is allowed per listing.`);
      return;
    }

    const invalidType = incomingFiles.find(
      (file) => !file.type.startsWith("image/") && !file.type.startsWith("video/"),
    );
    if (invalidType) {
      setStatus(`Unsupported file type: ${invalidType.name}`);
      return;
    }

    const tooLargeImage = incomingFiles.find(
      (file) => file.type.startsWith("image/") && file.size > MAX_MANUAL_IMAGE_BYTES,
    );
    if (tooLargeImage) {
      setStatus(`${tooLargeImage.name} is too large to upload. Please use a smaller image file.`);
      return;
    }

    const tooLargeVideo = incomingFiles.find(
      (file) => file.type.startsWith("video/") && file.size > MAX_MANUAL_VIDEO_BYTES,
    );
    if (tooLargeVideo) {
      setStatus(`${tooLargeVideo.name} is too large to upload. Please trim or compress the video.`);
      return;
    }

    const incomingTotalBytes = incomingFiles.reduce((sum, file) => sum + (file?.size || 0), 0);
    if (incomingTotalBytes > MAX_MANUAL_TOTAL_BYTES) {
      setStatus("This upload is too large. Please reduce the number of photos/videos or file sizes.");
      return;
    }

    const newPreviews = [];

    for (const file of incomingFiles) {
      // Skip watermark for videos
      const isVideo = file.type.startsWith("video");
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
          setStatus('');
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
      gallery_photo_id: relatedLinks.gallery_photo_id ? Number(relatedLinks.gallery_photo_id) : null,
      gallery_panel_name: relatedLinks.gallery_panel_name?.trim() || null,
      gallery_template_id: relatedLinks.gallery_template_id ? Number(relatedLinks.gallery_template_id) : null,
    };

    const hasValue = Object.values(payload).some((entry) => entry !== null && entry !== "");
    return hasValue ? payload : null;
  };

  const handleManualProductSubmit = async (event) => {
    event.preventDefault();
    if (isSavingManualProduct) {
      return;
    }

    const shouldCreateTemplate = !editingProduct && Boolean(unifiedTemplate.upload_file) && !patternOnly;
    const hasProductName = Boolean(String(manualProduct.name || "").trim());
    const shouldSaveProduct = isProductSectionEnabled && (editingProduct || hasProductName);
    const creatingTemplateOnly = !editingProduct && !shouldSaveProduct && shouldCreateTemplate;
    const creatingBoth = !editingProduct && shouldSaveProduct && shouldCreateTemplate;
    const shouldCreatePatternCopy =
      !editingProduct
      && (patternOnly || Boolean(manualProduct.is_digital_download))
      && selectedTypeCategory !== "patterns";
    const creatingPatternOnly = !editingProduct && !shouldSaveProduct && !shouldCreateTemplate && shouldCreatePatternCopy;

    if (!isProductSectionEnabled && !isTemplateSectionEnabled) {
      setStatus("Select at least one section to save.");
      return;
    }

    if (!editingProduct && !shouldSaveProduct && !shouldCreateTemplate && !shouldCreatePatternCopy) {
      setStatus("Add a product name, upload a template/pattern file, or enable Pattern only.");
      return;
    }

    if (
      unifiedTemplate.is_digital_download
      && (!String(unifiedTemplate.price_amount).trim() || Number(unifiedTemplate.price_amount) < 0.5)
    ) {
      setStatus("Digital downloads require a price of at least $0.50.");
      return;
    }

    if (shouldCreateTemplate) {
      if (!unifiedTemplate.name.trim()) {
        setStatus("Digital template name is required.");
        return;
      }
      if (!unifiedTemplate.upload_file) {
        setStatus("Upload an SVG, PDF, JPG, or PNG for the digital template.");
        return;
      }
      if (unifiedTemplate.upload_file.size > MAX_TEMPLATE_UPLOAD_BYTES) {
        setStatus("Digital template file is too large (max 50 MB).");
        return;
      }
    }

    setIsSavingManualProduct(true);
    setStatus(editingProduct ? "Updating product..." : "Saving listing in background...");
    if (!editingProduct) {
      handleCloseModal();
    }

    try {
      let createdTemplate = null;
      let templateCreatePayload = null;
      let savedProduct = null;
      let processedImages = [];
      let relatedLinks = {
        ...createDefaultRelatedLinks(),
        ...(manualProduct.related_links || {}),
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
      // Convert File objects to data URLs for images
        processedImages = [];

        for (const img of manualProduct.images || []) {
          if (img instanceof File) {
            const dataUrl = await new Promise((resolve) => {
              const reader = new FileReader();
              reader.onload = (e) => resolve(e.target.result);
              reader.readAsDataURL(img);
            });
            processedImages.push({
              url: dataUrl,
              type: img.type.startsWith("video") ? "video" : "image",
            });
          } else if (img.image_url) {
            processedImages.push({
              image_url: img.image_url,
              media_type: img.media_type || "image",
            });
          }
        }

        if (!createdTemplate?.id && relatedTemplateUpload.file) {
          if (relatedTemplateUpload.file.size > MAX_TEMPLATE_UPLOAD_BYTES) {
            throw new Error("Linked template upload is too large (max 50 MB).");
          }
          const linkedTemplateName = String(relatedTemplateUpload.name || "").trim()
            || getNameFromFile(relatedTemplateUpload.file)
            || "Linked Template";

          const uploadedFileName = String(relatedTemplateUpload.file?.name || "").toLowerCase();
          const isPdfUpload = uploadedFileName.endsWith(".pdf") || relatedTemplateUpload.file?.type === "application/pdf";
          const fileForUpload = isPdfUpload
            ? await pdfToPngFile(relatedTemplateUpload.file)
            : relatedTemplateUpload.file;
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

          const uploadedTemplate = await createAdminTemplate({
            name: linkedTemplateName,
            category: String(relatedTemplateUpload.category || "Patterns").trim() || "Patterns",
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
              return [{ id: uploadedTemplate.id, name: String(uploadedTemplate.name || "").trim() }, ...prev];
            });
            relatedLinks.template_id = String(uploadedTemplate.id);
            relatedLinks.template_name = String(uploadedTemplate.name || relatedTemplateUpload.name || "").trim();
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

        const productData = {
          // price field stores sale price when discount is present.
          name: manualProduct.name.trim(),
          description: manualProduct.description.trim(),
          category:
            manualProduct.category.length > 0 ? manualProduct.category : null,
          materials:
            manualProduct.materials.length > 0 ? manualProduct.materials : null,
          width: manualProduct.width ? parseFloat(manualProduct.width) : null,
          height: manualProduct.height ? parseFloat(manualProduct.height) : null,
          depth: manualProduct.depth ? parseFloat(manualProduct.depth) : null,
          price: (() => {
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
          quantity: parseInt(manualProduct.quantity, 10),
          is_featured: manualProduct.is_featured,
          is_digital_download: Boolean(unifiedTemplate.is_digital_download) || selectedTypeCategory === "patterns" || patternOnly,
          related_links: {
            template_id: relatedLinks.template_id
              ? Number(relatedLinks.template_id)
              : null,
            template_name: relatedLinks.template_name || null,
            pattern_product_id: relatedLinks.pattern_product_id
              ? Number(relatedLinks.pattern_product_id)
              : null,
            pattern_product_name: relatedLinks.pattern_product_name || null,
            gallery_photo_id: relatedLinks.gallery_photo_id
              ? Number(relatedLinks.gallery_photo_id)
              : null,
            gallery_panel_name: relatedLinks.gallery_panel_name || null,
            gallery_template_id: relatedLinks.gallery_template_id
              ? Number(relatedLinks.gallery_template_id)
              : null,
          },
          images: processedImages,
        };

        if (editingProduct) {
          savedProduct = await onUpdateManualProduct(editingProduct.id, productData);
          setStatus("Product updated successfully!");
        } else {
          savedProduct = await onAddManualProduct(productData);
        }
      }

      if (shouldCreatePatternCopy) {
        const patternTypeLabel = PRODUCT_TYPE_LABEL_BY_KEY.patterns || "Patterns";
        const nonTypeCategories = removeTypeCategories(manualProduct.category || []);
        const existingPatternId = relatedLinks.pattern_product_id
          ? Number(relatedLinks.pattern_product_id)
          : createdTemplate?.related_links?.pattern_product_id
            ? Number(createdTemplate.related_links.pattern_product_id)
            : null;

        const referenceImages = [];
        for (const entry of templateRefPhotos) {
          const file = entry?.file;
          if (!(file instanceof File) || !String(file.type || "").startsWith("image/")) {
            continue;
          }
          const dataUrl = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.readAsDataURL(file);
          });
          referenceImages.push({
            url: dataUrl,
            type: "image",
          });
        }

        const patternImages = referenceImages.length > 0
          ? referenceImages
          : processedImages.filter((entry) => {
            const mediaType = String(entry.media_type || entry.type || "").toLowerCase();
            return mediaType !== "video";
          });

        if (patternImages.length === 0 && unifiedTemplate.upload_file) {
          const uploadFile = (() => {
            const fileName = String(unifiedTemplate.upload_file?.name || "").toLowerCase();
            const isPdf = fileName.endsWith(".pdf") || unifiedTemplate.upload_file?.type === "application/pdf";
            return isPdf ? null : unifiedTemplate.upload_file;
          })();
          if (uploadFile && String(uploadFile.type || "").startsWith("image/")) {
            const dataUrl = await new Promise((resolve) => {
              const reader = new FileReader();
              reader.onload = (e) => resolve(e.target.result);
              reader.readAsDataURL(uploadFile);
            });
            patternImages.push({
              url: dataUrl,
              type: "image",
            });
          }
        }

        const resolvedPatternDescription = String(
          manualProduct.description || patternOnlyDescription || "",
        ).trim();
        if (!resolvedPatternDescription) {
          throw new Error("Pattern description is required.");
        }

        const patternProductData = {
          name: String(manualProduct.name || unifiedTemplate.name || "Pattern").trim(),
          description: resolvedPatternDescription,
          category: [patternTypeLabel, ...nonTypeCategories],
          materials: manualProduct.materials.length > 0 ? manualProduct.materials : null,
          width: manualProduct.width ? parseFloat(manualProduct.width) : null,
          height: manualProduct.height ? parseFloat(manualProduct.height) : null,
          depth: manualProduct.depth ? parseFloat(manualProduct.depth) : null,
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
          quantity: parseInt(manualProduct.quantity || "1", 10) || 1,
          is_featured: false,
          is_digital_download: true,
          related_links: {
            template_id: relatedLinks.template_id ? Number(relatedLinks.template_id) : (createdTemplate?.id || null),
            template_name: relatedLinks.template_name || (createdTemplate?.name || unifiedTemplate.name || null),
            pattern_product_id: existingPatternId,
            pattern_product_name: String(manualProduct.name || unifiedTemplate.name || "").trim() || null,
            gallery_photo_id: null,
            gallery_panel_name: null,
            gallery_template_id: null,
          },
          images: patternImages,
        };

        const savedPatternProduct = existingPatternId
          ? await onUpdateManualProduct(existingPatternId, patternProductData)
          : await onAddManualProduct(patternProductData);
        if (savedPatternProduct?.id) {
          relatedLinks.pattern_product_id = String(savedPatternProduct.id);
          relatedLinks.pattern_product_name = String(
            savedPatternProduct.name || patternProductData.name || "",
          ).trim();

          if (savedProduct?.id) {
            await onUpdateManualProduct(savedProduct.id, {
              related_links: {
                template_id: relatedLinks.template_id ? Number(relatedLinks.template_id) : null,
                template_name: relatedLinks.template_name || null,
                pattern_product_id: relatedLinks.pattern_product_id ? Number(relatedLinks.pattern_product_id) : null,
                pattern_product_name: relatedLinks.pattern_product_name || null,
                gallery_photo_id: relatedLinks.gallery_photo_id ? Number(relatedLinks.gallery_photo_id) : null,
                gallery_panel_name: relatedLinks.gallery_panel_name || null,
                gallery_template_id: relatedLinks.gallery_template_id ? Number(relatedLinks.gallery_template_id) : null,
              },
            });
          }
        }
      }

      if (addImagesToGallery && savedProduct?.id && Array.isArray(imagePreviews) && imagePreviews.length > 0) {
        const imageFiles = imagePreviews
          .filter((entry) => entry?.type !== "video" && entry?.file)
          .map((entry) => entry.file)
          .slice(0, MAX_MANUAL_UPLOAD_PHOTOS);

        if (imageFiles.length > 0) {
          const galleryPayload = new FormData();
          galleryPayload.append(
            "panel_name",
            String(savedProduct.name || manualProduct.name || "Product Gallery").trim(),
          );
          galleryPayload.append("description", String(manualProduct.description || "").trim());
          galleryPayload.append("category", String(selectedTypeCategory || "").trim());
          if (relatedLinks.template_id || createdTemplate?.id) {
            galleryPayload.append("template_id", String(relatedLinks.template_id || createdTemplate.id));
          }
          galleryPayload.append("display_name", "SGCG Art");
          galleryPayload.append("hide_submitter_name", "false");
          imageFiles.forEach((file) => {
            galleryPayload.append("photos", file);
          });

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
              firstCreated.panel_name || savedProduct.name || manualProduct.name || "Product Gallery",
            ).trim();
            const firstGalleryTemplateId = firstCreated.template_id
              ? Number(firstCreated.template_id)
              : relatedLinks.template_id
                ? Number(relatedLinks.template_id)
                : null;

            relatedLinks.gallery_photo_id = String(firstGalleryId);
            relatedLinks.gallery_panel_name = firstGalleryPanelName;
            relatedLinks.gallery_template_id = firstGalleryTemplateId ? String(firstGalleryTemplateId) : "";

            if (!editingProduct) {
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
                  gallery_photo_id: firstGalleryId,
                  gallery_panel_name: firstGalleryPanelName,
                  gallery_template_id: firstGalleryTemplateId,
                },
              });
            }

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

      // Close modal and reset state (for edit mode; create mode is already background-closed)
      if (editingProduct) {
        setShowManualProductModal(false);
        setEditingProduct(null);
        setManualProduct(createEmptyManualProduct());
        setUnifiedTemplate(createEmptyUnifiedTemplate());
        setRelatedTemplateUpload(createEmptyRelatedTemplateUpload());
        setRelatedGalleryUpload(createEmptyRelatedGalleryUpload());
        setShowRelatedLinksSection(false);
        setImagePreviews([]);
        setEnableWatermark(true); // Always reset to true after submission
        setWatermarkText("SGCG ART GLASS"); // Reset to default text
        setAddImagesToGallery(false);
        setTemplateRefPhotos([]);
        setTemplateNameManuallyEdited(false);
        setPatternOnly(false);
        setPatternOnlyDescription("");
      }
      await loadManualProductLinkOptions();
    } catch (error) {
      // Check if it's an authentication error
      if (
        error.message.includes("Unauthorized") ||
        error.message.includes("401")
      ) {
        setStatus("Session expired. Please log out and log back in.");
      } else {
        setStatus(
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

  const handleEditProduct = async (product) => {
    const inferredType = inferProductType(product);
    const existingCategories = Array.isArray(product.category)
      ? product.category
      : product.category
        ? [product.category]
        : [];
    const normalizedCategories = [
      PRODUCT_TYPE_LABEL_BY_KEY[inferredType] ||
        PRODUCT_TYPE_LABEL_BY_KEY.stainedGlassPanels,
      ...removeTypeCategories(existingCategories),
    ];

    await loadManualProductLinkOptions();
    setProductType(inferredType);
    setEditingProduct(product);
    const existingImages = (product.images || []).map((img, idx) => ({
      id: `existing-${idx}`,
      src: img.image_url,
      type: img.media_type === "video" ? "video" : "image",
      isExisting: true,
    }));
    setImagePreviews(existingImages);
    const existingRelatedLinks =
      product?.related_links && typeof product.related_links === "object"
        ? product.related_links
        : createDefaultRelatedLinks();

    setManualProduct({
      name: product.name || "",
      images: product.images || [],
      description: product.description || "",
      category: normalizedCategories,
      materials: Array.isArray(product.materials)
        ? product.materials
        : product.materials
          ? [product.materials]
          : [],
      width: product.width?.toString() || "",
      height: product.height?.toString() || "",
      depth: product.depth?.toString() || "",
      price: (() => {
        const regular = Number(product.old_price || product.price || 0);
        return Number.isFinite(regular) && regular > 0 ? regular.toString() : "";
      })(),
      discount_percent: (() => {
        const explicit = Number(product.discount_percent || 0);
        if (Number.isFinite(explicit) && explicit > 0) return explicit.toString();
        const regular = Number(product.old_price || 0);
        const sale = Number(product.price || 0);
        if (regular > 0 && sale > 0 && regular > sale) {
          return Number((((regular - sale) / regular) * 100).toFixed(2)).toString();
        }
        return "";
      })(),
      quantity: product.quantity?.toString() || "",
      is_featured: product.is_featured === 1 || product.is_featured === true,
      is_digital_download: Boolean(product.is_digital_download),
      related_links: {
        ...createDefaultRelatedLinks(),
        ...existingRelatedLinks,
        template_id: existingRelatedLinks?.template_id ? String(existingRelatedLinks.template_id) : "",
        pattern_product_id: existingRelatedLinks?.pattern_product_id ? String(existingRelatedLinks.pattern_product_id) : "",
        gallery_photo_id: existingRelatedLinks?.gallery_photo_id ? String(existingRelatedLinks.gallery_photo_id) : "",
        gallery_template_id: existingRelatedLinks?.gallery_template_id ? String(existingRelatedLinks.gallery_template_id) : "",
      },
    });
    setUnifiedTemplate(createEmptyUnifiedTemplate());
    setRelatedTemplateUpload(createEmptyRelatedTemplateUpload());
    setRelatedGalleryUpload(createEmptyRelatedGalleryUpload());
    setShowRelatedLinksSection(
      hasAnyRelatedLinkValue(existingRelatedLinks)
      || Boolean(existingRelatedLinks?.template_id)
      || Boolean(existingRelatedLinks?.pattern_product_id)
      || Boolean(existingRelatedLinks?.gallery_photo_id),
    );
    setCategoryInput("");
    setMaterialInput("");
    setShowManualProductModal(true);
    setTemplateNameManuallyEdited(false);
    setPatternOnly(false);
    setPatternOnlyDescription(String(product.description || ""));
  };

  const handleDeleteProduct = async (product) => {
    const confirmDelete = window.confirm(
      `⚠️ Delete Product?\n\nAre you sure you want to permanently delete "${product.name}"?\n\nThis action cannot be undone.`,
    );
    if (confirmDelete) {
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
      }
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
  }, [manualProductSearch, manualProductTypeFilter]);

  useEffect(() => {
    setCustomersPage(1);
  }, [customers.length]);

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
      <div style={{ display: "flex", gap: "0.45rem", alignItems: "center", justifyContent: "center", flexWrap: "wrap", marginTop: "0.8rem" }}>
        <button
          type="button"
          className="button"
          disabled={currentPage <= 1}
          onClick={() => setPage((prev) => Math.max(1, prev - 1))}
        >
          Prev
        </button>
        {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => (
          <button
            key={`section-page-${pageNumber}`}
            type="button"
            className={`button ${currentPage === pageNumber ? "primary" : ""}`}
            onClick={() => setPage(pageNumber)}
          >
            {pageNumber}
          </button>
        ))}
        <button
          type="button"
          className="button"
          disabled={currentPage >= totalPages}
          onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
        >
          Next
        </button>
      </div>
    );
  };

  const handleCloseModal = () => {
    setShowManualProductModal(false);
    setEditingProduct(null);
    setManualProduct(createEmptyManualProduct());
    setUnifiedTemplate(createEmptyUnifiedTemplate());
    setRelatedTemplateUpload(createEmptyRelatedTemplateUpload());
    setRelatedGalleryUpload(createEmptyRelatedGalleryUpload());
    setShowRelatedLinksSection(false);
    setCategoryInput("");
    setMaterialInput("");
    setImagePreviews([]);
    setEnableWatermark(true); // Always reset to true when modal closes
    setWatermarkText("SGCG ART GLASS"); // Reset to default text
    setAddImagesToGallery(false);
    setTemplateRefPhotos([]);
    setTemplateNameManuallyEdited(false);
    setPatternOnly(false);
    setPatternOnlyDescription("");
  };

  const openCustomerEditModal = async (customer) => {
    const customerId = customer.id;
    openingCustomerIdRef.current = customerId;
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

  return (
    <div className="admin-dashboard">
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
          <div className="panel-section">
            <h3>Customers</h3>
            {customers.length === 0 ? (
              <p className="form-note">No customers found.</p>
            ) : (
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
                                className="button primary"
                                disabled={!sessionId || isRecoveringRow || isResendingRow}
                                onClick={() => handleRecoverCheckoutSession(sessionId)}
                              >
                                {isRecoveringRow ? "Recovering..." : "Recover Purchase"}
                              </button>
                              <button
                                type="button"
                                className="button"
                                disabled={!sessionId || isRecoveringRow || isResendingRow}
                                onClick={() => handleResendCheckoutDownloadEmail(sessionId)}
                              >
                                {isResendingRow ? "Sending..." : "Send Email"}
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
                    setUnifiedTemplate(createEmptyUnifiedTemplate());
                    setRelatedTemplateUpload(createEmptyRelatedTemplateUpload());
                    setRelatedGalleryUpload(createEmptyRelatedGalleryUpload());
                    setShowRelatedLinksSection(false);
                    setCategoryInput("");
                    setMaterialInput("");
                    setImagePreviews([]);
                    setEditingProduct(null);
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
                <h3 style={{ margin: 0 }}>Manual Products ({manualProducts.length})</h3>
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
              {manualProducts.length === 0 ? (
                <div className="empty-state">
                  No manual products added yet.
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
                          {product.images && product.images.length > 0 ? (
                            product.images[0].media_type === "video" ? (
                              <video
                                src={product.images[0].image_url}
                                className="thumb-placeholder"
                              />
                            ) : (
                              <img
                                src={product.images[0].image_url}
                                alt={product.name}
                              />
                            )
                          ) : (
                            <div className="thumb-placeholder">No image</div>
                          )}
                        </div>
                        <div className="product-details">
                          <h4>
                            {product.name}
                            {(product.is_featured === 1 ||
                              product.is_featured === true) && (
                              <span className="featured-badge">★ Featured</span>
                            )}
                          </h4>
                          <p className="product-meta">
                            ${product.price} · Qty: {product.quantity}
                            {toDisplayList(product.category) &&
                              ` · ${toDisplayList(product.category)}`}
                            {toDisplayList(product.materials) &&
                              ` · ${toDisplayList(product.materials)}`}
                          </p>
                        </div>
                        <div className="product-actions">
                          <button
                            className="button-icon edit"
                            onClick={() => handleEditProduct(product)}
                            title="Edit product"
                          >
                            ✎
                          </button>
                          <button
                            className={`button-icon facebook ${facebookPostedProductIds[String(product.id)] ? "posted" : ""}`}
                            onClick={() => handleShareProductToFacebook(product)}
                            title={facebookPostedProductIds[String(product.id)] ? "Posted to Facebook" : "Post to Facebook"}
                            aria-label={facebookPostedProductIds[String(product.id)] ? "Posted to Facebook" : "Post to Facebook"}
                          >
                            {facebookPostedProductIds[String(product.id)] ? "✓" : "f"}
                          </button>
                          <button
                            className="button-icon delete"
                            onClick={() => handleDeleteProduct(product)}
                            title="Delete product"
                          >
                            🗑
                          </button>
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

        {activeTab === "reviews" && (
          <div className="tab-panel">
            <div className="panel-section">
              <h3>Review Management</h3>
              <form className="review-invite-form" onSubmit={handleGenerateReviewCode}>
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

              {reviewInviteCodes.length > 0 ? (
                <div className="review-invite-list">
                  {pagedReviewInviteCodes.map((invite) => (
                    <div key={invite.id} className="review-invite-item">
                      <div>
                        <strong>
                          ({invite.platform || invite.product_type || 'unknown'})
                          {invite.product_name ? ` ${invite.product_name}` : ''}
                        </strong>
                        <p className="form-note" style={{ margin: 0 }}>
                          Uses: {invite.used_count}/{invite.max_uses} · Remaining: {invite.remaining_uses}
                          {invite.note ? ` · Internal Note: ${invite.note}` : ""}
                          {invite.expires_at ? ` · Expires: ${new Date(invite.expires_at).toLocaleDateString()}` : ""}
                        </p>
                      </div>
                      <div className="review-invite-actions">
                        <button
                          type="button"
                          className="button"
                          onClick={() => handleRecopyReviewCode(invite)}
                        >
                          Re-copy Code
                        </button>
                        <button
                          type="button"
                          className="button"
                          onClick={() => handleResendReviewCode(invite)}
                        >
                          Resend Code
                        </button>
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
              ) : null}
              {renderSectionPagination(reviewCodesPage, totalReviewCodesPages, setReviewCodesPage)}

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
              {adminReviews.length === 0 ? (
                <p className="form-note">No reviews found.</p>
              ) : (
                <div className="review-management-list">
                  {pagedAdminReviews.map((review) => (
                    <article key={review.id} className="review-row">
                      <div className="review-row-header">
                        <h4 className="review-row-title">
                          {(review.first_name || "").trim()} {(review.last_name || "").trim()} · {review.product_type === 'invite' ? `Linked to ${String(review.product_id || '').toUpperCase()}` : `${review.product_type} #${review.product_id}`}
                        </h4>
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
                      </div>

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
                      </div>

                    </article>
                  ))}
                </div>
              )}
              {renderSectionPagination(reviewsPage, totalReviewsPages, setReviewsPage)}
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
                    : "Add Product / Digital Template"}
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
                {/* ── SECTION 1: PRODUCT ───────────────────────────────────── */}
                {isProductSectionEnabled && (
                  <div className="ap-section ap-section-1">
                    <h4 className="ap-section-title">🛍️ Section 1 — Product Listing</h4>
                <label>
                  Product Name {shouldRequireProductFields ? "*" : ""}
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
                    required={shouldRequireProductFields}
                  />
                </label>

                <label>
                  Description
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

                <label>
                  Categories
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
                            Select a favorite category...
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

                <label>
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

                <div className="size-inputs">
                  <label>
                    Width (inches)
                    <input
                      type="number"
                      step="0.01"
                      value={manualProduct.width}
                      onChange={(e) =>
                        setManualProduct({
                          ...manualProduct,
                          width: e.target.value,
                        })
                      }
                      placeholder="0.00"
                      style={{ width: "130px" }}
                    />
                  </label>
                  <label>
                    Height (inches)
                    <input
                      type="number"
                      step="0.01"
                      value={manualProduct.height}
                      onChange={(e) =>
                        setManualProduct({
                          ...manualProduct,
                          height: e.target.value,
                        })
                      }
                      placeholder="0.00"
                      style={{ width: "130px" }}
                    />
                  </label>
                  <label>
                    Depth (inches)
                    <input
                      type="number"
                      step="0.01"
                      value={manualProduct.depth}
                      onChange={(e) =>
                        setManualProduct({
                          ...manualProduct,
                          depth: e.target.value,
                        })
                      }
                      placeholder="0.00"
                      style={{ width: "130px" }}
                    />
                  </label>
                </div>

                <div className="price-quantity-inputs">
                  <label>
                    Price (regular) {shouldRequireProductFields ? "*" : ""}
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
                      style={{ width: "130px" }}
                      required={shouldRequireProductFields}
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
                  <label>
                    Quantity {shouldRequireProductFields ? "*" : ""}
                    <input
                      type="number"
                      min="0"
                      value={manualProduct.quantity}
                      onChange={(e) =>
                        setManualProduct({
                          ...manualProduct,
                          quantity: e.target.value,
                        })
                      }
                      placeholder="0"
                      required={shouldRequireProductFields}
                    />
                  </label>
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
                  <span>Feature this product on the home page</span>
                </label>

                  </div>
                )}

                {/* ── SECTION 2: DIGITAL TEMPLATE ─────────────── */}
                {isTemplateSectionEnabled && (
                  <div className="ap-section ap-section-2">
                    <h4 className="ap-section-title">📐 Section 2 — Digital Template</h4>
                    <p className="form-note">
                      {patternOnly
                        ? "Upload the pattern file — it saves to the Patterns tab only and auto-links to the new product."
                        : "Upload the digital template — it saves to Templates and auto-links to the new product."}
                    </p>

                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={patternOnly}
                        onChange={(e) => setPatternOnly(e.target.checked)}
                      />
                      <span>Pattern only (adds to Patterns tab only, not to Designer/Templates)</span>
                    </label>

                    {patternOnly && (
                      <label>
                        Pattern Description *
                        <textarea
                          rows="2"
                          value={patternOnlyDescription}
                          onChange={(e) => setPatternOnlyDescription(e.target.value)}
                          placeholder="Short description for the pattern-only listing"
                          required={patternOnly}
                        />
                      </label>
                    )}

                    <label>
                      Template Name *
                      <input
                        type="text"
                        value={unifiedTemplate.name}
                        onChange={(e) => {
                          setTemplateNameManuallyEdited(true);
                          setUnifiedTemplate((prev) => ({
                            ...prev,
                            name: e.target.value,
                          }));
                        }}
                        placeholder="Enter template name"
                        required={Boolean(unifiedTemplate.upload_file)}
                      />
                    </label>

                    <label>
                      Template Category
                      <input
                        type="text"
                        value={unifiedTemplate.category}
                        onChange={(e) =>
                          setUnifiedTemplate((prev) => ({
                            ...prev,
                            category: e.target.value,
                          }))
                        }
                        placeholder="Examples: Patterns, Floral, Geometric"
                      />
                    </label>

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

                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={Boolean(unifiedTemplate.is_digital_download)}
                        onChange={(e) =>
                          setUnifiedTemplate((prev) => ({
                            ...prev,
                            is_digital_download: e.target.checked,
                          }))
                        }
                      />
                      <span>Digital download (customers can purchase and download instantly)</span>
                    </label>

                    {unifiedTemplate.is_digital_download && (
                      <label>
                        Digital Price (USD) *
                        <input
                          type="number"
                          min="0.5"
                          step="0.01"
                          value={unifiedTemplate.price_amount}
                          onChange={(e) =>
                            setUnifiedTemplate((prev) => ({
                              ...prev,
                              price_amount: e.target.value,
                            }))
                          }
                          placeholder="0.00"
                          required={Boolean(unifiedTemplate.is_digital_download)}
                        />
                      </label>
                    )}

                  </div>
                )}

                {/* ── SECTION 3: IMAGES / VIDEO ─────────────── */}
                        <div className="ap-section ap-section-3">
                          <h4 className="ap-section-title">🖼️ Section 3 — Images / Video</h4>

                          <p className="form-note">
                            Add up to 10 photos and 1 video for the product listing.
                          </p>
                          <div className="image-upload-input">
                            <input
                              type="file"
                              id="image-input"
                              accept="image/*,video/*"
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
                            <span>Add product photos to gallery when submitted (auto-grouped)</span>
                          </label>

                          {isTemplateSectionEnabled && (
                            <>
                              <hr className="ap-section-divider" />
                              <p className="form-note">Upload the {patternOnly ? "pattern" : "template"} file and up to 3 reference photos.</p>
                              <label>
                                {patternOnly ? "Upload Pattern File *" : "Upload Template File *"}
                                <input
                                  type="file"
                                  accept=".svg,.pdf,.jpg,.jpeg,.png"
                                  onChange={(e) => {
                                    const nextFile = e.target.files?.[0] || null;
                                    setUnifiedTemplate((prev) => ({
                                      ...prev,
                                      upload_file: nextFile,
                                    }));
                                  }}
                                  required={false}
                                />
                              </label>
                              {unifiedTemplate.upload_file ? (
                                <div className="form-note">
                                  Selected template file: {unifiedTemplate.upload_file.name}
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
                                        <img src={photo.src} alt="Ref" className="image-preview" />
                                        <button
                                          type="button"
                                          className="remove-image-btn"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setTemplateRefPhotos((prev) =>
                                              prev.filter((p) => p.id !== photo.id),
                                            );
                                          }}
                                          title="Remove photo"
                                        >
                                          ✕
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </>
                          )}
                        </div>

                        {/* ── SECTION 4: WATERMARK ─────────────────────── */}
                        <div className="ap-section ap-section-4">
                          <h4 className="ap-section-title">💧 Section 4 — Watermark Settings</h4>
                          <label className="checkbox-label">
                            <input
                              type="checkbox"
                              checked={enableWatermark}
                              onChange={(e) => setEnableWatermark(e.target.checked)}
                            />
                            <span>Apply watermark to new images</span>
                          </label>
                          {enableWatermark && (
                            <div className="watermark-input-group">
                              <label>
                                Watermark Text
                                <input
                                  type="text"
                                  value={watermarkText}
                                  onChange={(e) => setWatermarkText(e.target.value)}
                                  placeholder="Enter watermark text"
                                />
                              </label>
                              <span className="form-note">Watermark will appear diagonally across the image.</span>
                            </div>
                          )}
                        </div>

                        {/* ── SECTION 5: RELATED CUSTOMER LINKS ────────── */}
                        <div className="ap-section ap-section-5">
                          <h4 className="ap-section-title">🔗 Section 5 — Related Customer Links</h4>
                          <p className="form-note">
                            Link this listing to existing templates, patterns, or gallery entries.
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
                                setManualProduct({
                                  ...manualProduct,
                                  related_links: {
                                    ...createDefaultRelatedLinks(),
                                    ...manualProduct.related_links,
                                    template_id: nextId,
                                    template_name: selectedTemplate?.name || "",
                                  },
                                });
                              }}
                            >
                              <option value="">None</option>
                              {productTemplateOptions.map((template) => (
                                <option key={template.id} value={template.id}>
                                  {template.name}
                                </option>
                              ))}
                            </select>
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
                                setManualProduct({
                                  ...manualProduct,
                                  related_links: {
                                    ...createDefaultRelatedLinks(),
                                    ...manualProduct.related_links,
                                    pattern_product_id: nextId,
                                    pattern_product_name: selectedPattern?.name || "",
                                  },
                                });
                              }}
                            >
                              <option value="">None</option>
                              {patternProductOptions.map((pattern) => (
                                <option key={pattern.id} value={pattern.id}>
                                  {pattern.name}
                                </option>
                              ))}
                            </select>
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
                                setManualProduct({
                                  ...manualProduct,
                                  related_links: {
                                    ...createDefaultRelatedLinks(),
                                    ...manualProduct.related_links,
                                    gallery_photo_id: nextId,
                                    gallery_panel_name: selectedPhoto?.panel_name || "",
                                    gallery_template_id: selectedPhoto?.template_id
                                      ? String(selectedPhoto.template_id)
                                      : "",
                                  },
                                });
                              }}
                            >
                              <option value="">None</option>
                              {productGalleryOptions.map((photo) => (
                                <option key={photo.id} value={photo.id}>
                                  {photo.panel_name || `Photo #${photo.id}`}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>

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
                              : isTemplateSectionEnabled && isProductSectionEnabled
                                ? "Save Product + Template"
                                : isTemplateSectionEnabled
                                  ? "Save Digital Template"
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
