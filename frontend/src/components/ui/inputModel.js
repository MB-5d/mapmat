export const INPUT_SIZES = ['sm', 'md', 'lg'];
export const INPUT_STYLES = ['brand', 'mono'];

const VALID_INPUT_SIZES = new Set(INPUT_SIZES);
const VALID_INPUT_STYLES = new Set(INPUT_STYLES);

export const resolveInputModel = ({
  size = 'md',
  inputStyle = 'mono',
}) => ({
  size: VALID_INPUT_SIZES.has(size) ? size : 'md',
  inputStyle: VALID_INPUT_STYLES.has(inputStyle) ? inputStyle : 'mono',
});
