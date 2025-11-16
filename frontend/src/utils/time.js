// Relative time utilities
export function formatRelativeTime(dateInput) {
  try {
    const d = typeof dateInput === 'string' || typeof dateInput === 'number' ? new Date(dateInput) : dateInput;
    const diffMs = Date.now() - d.getTime();
    const abs = Math.abs(diffMs);
    const units = [
      ['year', 365 * 24 * 60 * 60 * 1000],
      ['month', 30 * 24 * 60 * 60 * 1000],
      ['week', 7 * 24 * 60 * 60 * 1000],
      ['day', 24 * 60 * 60 * 1000],
      ['hour', 60 * 60 * 1000],
      ['minute', 60 * 1000],
      ['second', 1000],
    ];
    for (const [unit, ms] of units) {
      if (abs >= ms || unit === 'second') {
        const value = Math.round(abs / ms) * (diffMs < 0 ? -1 : 1);
        const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
        return rtf.format(value, unit);
      }
    }
  } catch (error) {
    console.error('Error formatting relative time:', error);
  }
  return '';
}
