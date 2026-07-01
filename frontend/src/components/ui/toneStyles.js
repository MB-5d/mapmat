export const UI_TONE_STYLES = Object.freeze([
  'sky',
  'teal',
  'blue',
  'indigo',
  'violet',
  'yellow',
  'amber',
  'orange',
  'red',
  'rose',
  'green',
  'slate',
]);

const UI_TONE_STYLE_SET = new Set(UI_TONE_STYLES);

export const isUiToneStyle = (tone) => UI_TONE_STYLE_SET.has(tone);
