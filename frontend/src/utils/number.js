// Number formatting utilities
export function formatNumber(value, options = {}) {
  const { style = 'decimal', minimumFractionDigits, maximumFractionDigits } = options;
  try {
    return new Intl.NumberFormat(undefined, {
      style,
      minimumFractionDigits,
      maximumFractionDigits,
    }).format(Number(value || 0));
  } catch {
    return String(value);
  }
}
