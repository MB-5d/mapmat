export const BUTTON_TYPES = ['primary', 'secondary', 'ghost', 'link'];
export const BUTTON_STYLES = ['brand', 'mono', 'danger'];
export const BUTTON_SIZES = ['sm', 'md', 'lg'];
export const ICON_BUTTON_SIZES = ['sm', 'md', 'lg', 'xl', 'xxl'];

const VISUAL_BUTTON_TYPES = new Set(BUTTON_TYPES);
const HTML_BUTTON_TYPES = new Set(['button', 'submit', 'reset']);
const VALID_BUTTON_STYLES = new Set(BUTTON_STYLES);

const DEFAULT_STYLE_BY_TYPE = {
  primary: 'brand',
  secondary: 'brand',
  ghost: 'mono',
  link: 'brand',
};

export const BUTTON_VARIANT_MAP = {
  primary: { type: 'primary', style: 'brand' },
  secondary: { type: 'secondary', style: 'brand' },
  ghost: { type: 'ghost', style: 'mono' },
  danger: { type: 'primary', style: 'danger' },
};

export const ICON_BUTTON_VARIANT_MAP = {
  primary: { type: 'primary', style: 'brand' },
  danger: { type: 'primary', style: 'danger' },
  ghost: { type: 'ghost', style: 'mono' },
  default: { type: 'ghost', style: 'mono' },
};

const resolveNativeType = (typeProp, htmlTypeProp) => {
  if (HTML_BUTTON_TYPES.has(htmlTypeProp)) return htmlTypeProp;
  if (HTML_BUTTON_TYPES.has(typeProp)) return typeProp;
  return 'button';
};

const resolveVisualModel = ({ typeProp, styleProp, variantProp, variantMap, defaultVariant }) => {
  const fallbackModel = variantMap[variantProp] || variantMap[defaultVariant];
  const resolvedType = VISUAL_BUTTON_TYPES.has(typeProp)
    ? typeProp
    : fallbackModel.type;
  const resolvedStyle = VALID_BUTTON_STYLES.has(styleProp)
    ? styleProp
    : (VISUAL_BUTTON_TYPES.has(typeProp) ? DEFAULT_STYLE_BY_TYPE[resolvedType] : fallbackModel.style);

  return {
    type: resolvedType,
    style: resolvedStyle,
  };
};

export const resolveButtonModel = ({
  type,
  style,
  htmlType,
  variant = 'primary',
  defaultVariant = 'primary',
  size = 'md',
  variantMap = BUTTON_VARIANT_MAP,
  validSizes = BUTTON_SIZES,
  fallbackSize = 'md',
}) => ({
  nativeType: resolveNativeType(type, htmlType),
  visual: resolveVisualModel({
    typeProp: type,
    styleProp: style,
    variantProp: variant,
    variantMap,
    defaultVariant,
  }),
  size: new Set(validSizes).has(size) ? size : fallbackSize,
  legacyVariantClass: Object.prototype.hasOwnProperty.call(variantMap, variant) ? variant : null,
});
