export function normalizeIranMobile(value) {
  const digits = String(value)
    .replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 0x0660));
  const compact = digits.trim().replace(/[\s()-]/g, '');
  const national = compact.startsWith('+98')
    ? `0${compact.slice(3)}`
    : compact.startsWith('0098')
      ? `0${compact.slice(4)}`
      : compact.startsWith('98')
        ? `0${compact.slice(2)}`
        : compact;
  return /^09\d{9}$/.test(national) ? national : '';
}
