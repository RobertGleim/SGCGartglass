// Canonical product-attribute option lists — the single source of truth shared by
// the admin product form (checkboxes) and the storefront item-number generator.
// Keep these labels byte-for-byte identical to what the admin form writes into a
// product's `category` array, otherwise classification below will miss them.
export const STYLE_OPTIONS = [
  "Transom",
  "Contemporary",
  "Modern",
  "Victorian",
  "Geometric",
  "Animals / Landscape",
];
export const SHAPE_OPTIONS = ["Rectangular", "Square", "Oval", "Circle", "Other"];
export const COLOR_OPTIONS = ["Blue", "Green", "Red", "Amber", "Clear", "Multicolor"];

// lowercase + strip non-alphanumerics, so free-form category tags match option labels
// regardless of spacing/punctuation (mirrors normalizeCategoryTagValue in AdminDashboard).
export const normalizeTag = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

// Parse a dimension that may be a decimal ("20.5"), a mixed fraction ("48 3/8"),
// or a pure fraction ("3/8"). Returns a Number, or null when unparseable.
export const parseDimensionToNumber = (value) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;

  const raw = String(value ?? "")
    .replace(/inches?|inch|in\.?/gi, "")
    .replace(/["']/g, "")
    .replace(/,/g, "")
    .trim();
  if (!raw) return null;

  // mixed fraction: "48 3/8" or "48-3/8"
  const mixed = raw.match(/^(\d+)[\s-]+(\d+)\/(\d+)$/);
  if (mixed) {
    const den = Number(mixed[3]);
    if (!den) return null;
    return Number(mixed[1]) + Number(mixed[2]) / den;
  }

  // pure fraction: "3/8"
  const frac = raw.match(/^(\d+)\/(\d+)$/);
  if (frac) {
    const den = Number(frac[2]);
    if (!den) return null;
    return Number(frac[1]) / den;
  }

  // decimal or integer
  if (/^\d+(?:\.\d+)?$/.test(raw)) return Number(raw);

  return null;
};

const coerceCategoryArray = (category) => {
  if (Array.isArray(category)) return category;
  if (typeof category === "string") {
    const trimmed = category.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed;
      } catch {
        // not JSON — fall through to comma split
      }
    }
    return trimmed
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return [];
};

// Floor a dimension to its integer part (22 1/4 / 22.25 -> "22"); "" when unparseable.
const floorDimensionDigits = (value) => {
  const num = parseDimensionToNumber(value);
  if (num === null) return "";
  return String(Math.floor(num));
};

// Build the item number from a product's category tags + width/height.
// Format: [Shape][colors][size][STYLE], e.g. "Rbg2020GEO" or "Cr1236TRA".
// Segments are omitted when their source attribute is missing (partial codes).
export const buildItemNumber = ({ category, width, height } = {}) => {
  // Category entries are kept in the order the admin checked them (the form appends
  // each new selection to the end), so this preserves selection order.
  const orderedTags = coerceCategoryArray(category).map(normalizeTag);
  const normalizedTags = new Set(orderedTags);

  // Shape — first matching option (canonical order), first letter uppercase.
  const shape = SHAPE_OPTIONS.find((option) => normalizedTags.has(normalizeTag(option)));
  const shapeSeg = shape ? shape.charAt(0).toUpperCase() : "";

  // Colors — each matching option in canonical order, first letter lowercase.
  const colorSeg = COLOR_OPTIONS
    .filter((option) => normalizedTags.has(normalizeTag(option)))
    .map((option) => option.charAt(0).toLowerCase())
    .join("");

  // Size — floor(width) then floor(height), concatenated with no separator.
  const sizeSeg = `${floorDimensionDigits(width)}${floorDimensionDigits(height)}`;

  // Style — the FIRST style the admin checked (selection order, not canonical),
  // first 3 letters uppercase. e.g. checking Animals / Landscape first yields "ANI"
  // even if Contemporary/Modern are checked afterward.
  const styleByTag = new Map(STYLE_OPTIONS.map((option) => [normalizeTag(option), option]));
  const firstStyleTag = orderedTags.find((tag) => styleByTag.has(tag));
  const style = firstStyleTag ? styleByTag.get(firstStyleTag) : "";
  const styleSeg = style
    ? style.replace(/[^a-zA-Z]/g, "").slice(0, 3).toUpperCase()
    : "";

  return `${shapeSeg}${colorSeg}${sizeSeg}${styleSeg}`;
};

const pickDimension = (sources, keys) => {
  for (const source of sources) {
    if (!source || typeof source !== "object") continue;
    for (const key of keys) {
      if (key in source && source[key] !== "" && source[key] != null) {
        return source[key];
      }
    }
  }
  return undefined;
};

// Convenience wrapper for storefront components: derive the item number straight
// from a normalized product object (mirrors getProductDimensionsLabel's sources).
export const getProductItemNumber = (product) => {
  if (!product) return "";
  const sources = [product, product.originalData, product.manualProductDetails];
  const category =
    product.category ??
    product.originalData?.category ??
    product.manualProductDetails?.category;
  const width = pickDimension(sources, ["width", "width_inches", "width_in", "widthInches"]);
  const height = pickDimension(sources, ["height", "height_inches", "height_in", "heightInches"]);
  return buildItemNumber({ category, width, height });
};
