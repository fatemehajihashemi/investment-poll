// تنها منبع رنگ برای همه‌ی نمودارهای گزارش و داشبورد.
//
// قانون اصلی: رنگ هر گزینه فقط به «هویت» همان گزینه بستگی دارد
// (نام دارایی، یا جایگاه گزینه در فهرست اصلی گزینه‌های سوال) و هرگز به رتبه یا
// ترتیب نمایش آن در نمودار وابسته نیست. به همین دلیل برش نمودار، نقطه‌ی راهنما و
// tooltip همیشه هم‌رنگ‌اند و با تغییر تعداد رای‌ها (گزارش زنده) هم رنگ‌ها جابه‌جا نمی‌شوند.

export const ASSET_COLORS: Record<string, string> = {
  'بورس': '#2563eb',
  'سهام': '#2563eb',
  'طلا': '#f59e0b',
  'درآمد ثابت': '#06b6d4',
  'گواهی سپرده کالایی': '#10b981',
  'کاورد کال': '#8b5cf6',
}

// گزینه‌های «بی‌تغییر / خنثی» مثل «حفظ ترکیب فعلی پرتفوی»: رنگ دارایی نمی‌گیرند.
export const NEUTRAL_COLOR = '#94a3b8'

// رنگ گزینه‌هایی که نام دارایی ندارند (مثلاً سطح ریسک).
const FALLBACK_COLORS = ['#2563eb', '#f59e0b', '#10b981', '#8b5cf6', '#ef4444', '#06b6d4']

// یکسان‌سازی حروف عربی/فارسی و حذف علائم، برای تطبیق دقیق «کلمه‌به‌کلمه».
function normalize(text: string): string {
  return ` ${text
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[‌«»"'()\[\]{}،؛؟:.,\-–—/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()} `
}

// نام‌های دارایی، طولانی‌ترین اول (تا «درآمد ثابت» قبل از اسم‌های کوتاه‌تر تطبیق داده شود)
const ASSET_NAMES = Object.keys(ASSET_COLORS).sort((a, b) => b.length - a.length)

/**
 * رنگ یک گزینه.
 * @param label        متن گزینه، مثل «سهام» یا «افزایش وزن طلا»
 * @param optionIndex  جایگاه گزینه در فهرست «اصلی» گزینه‌های سوال
 *                     (قبل از هر مرتب‌سازی؛ نه جایگاه در نمودار)
 */
export function getOptionColor(label: string, optionIndex: number): string {
  if (ASSET_COLORS[label]) return ASSET_COLORS[label]

  const padded = normalize(label)

  // تطبیق کلمه‌به‌کلمه، نه زیررشته (تا مثلاً «اطلاعات» به‌خاطر «طلا» رنگ طلا نگیرد)
  for (const asset of ASSET_NAMES) {
    if (padded.includes(normalize(asset))) return ASSET_COLORS[asset]
  }

  if (padded.includes(' حفظ ')) return NEUTRAL_COLOR

  return FALLBACK_COLORS[(optionIndex + 3) % FALLBACK_COLORS.length]
}

// ---------------------------------------------------------------------------
// سوال‌های «ترتیبی» (مثل سطح ریسک: بسیار پایین ← بسیار بالا)
// گزینه‌هایشان ترتیب طبیعی دارد، پس رنگ باید معنای «کم ← زیاد» را فوری منتقل کند:
// سبز تیره ← سبز روشن ← زرد ← نارنجی ← قرمز تیره.
// نکته‌ی دسترسی‌پذیری: سبز/قرمز برای بعضی افراد کوررنگ فقط با رنگ قابل‌تشخیص نیست؛
// به همین دلیل ترتیب برش‌ها (ساعت‌گرد از بالا) همیشه از کم به زیاد است و راهنما هم با همان ترتیب و با نام
// هر سطح کنار رنگ نوشته می‌شود، پس رنگ تنها حامل معنی نیست.
// ترتیب نمایش هم همان ترتیب طبیعی است، نه ترتیب درصد.
// ---------------------------------------------------------------------------
export const ORDINAL_RAMP = ['#15803d', '#4ade80', '#facc15', '#f97316', '#b91c1c']

const ORDINAL_SCALES: string[][] = [
  ['بسیار پایین', 'پایین', 'متوسط', 'بالا', 'بسیار بالا'],
  ['بسیار کم', 'کم', 'متوسط', 'زیاد', 'بسیار زیاد'],
  ['خیلی کم', 'کم', 'متوسط', 'زیاد', 'خیلی زیاد'],
]

function plain(text: string): string {
  return normalize(text).trim()
}

/**
 * اگر همه‌ی گزینه‌ها از یک مقیاس ترتیبی شناخته‌شده باشند، برای هر گزینه «سطح» (۰ تا ۴) برمی‌گرداند؛ وگرنه null.
 */
export function getOrdinalLevels(options: string[]): number[] | null {
  if (!Array.isArray(options) || options.length < 2) return null
  const norm = options.map((o) => plain(String(o)))
  for (const scale of ORDINAL_SCALES) {
    const scaleNorm = scale.map(plain)
    if (norm.every((o) => scaleNorm.includes(o))) return norm.map((o) => scaleNorm.indexOf(o))
  }
  return null
}

/** رنگ متن روی یک رنگ زمینه (سفید روی تیره، تیره روی روشن) تا خوانا بماند. */
export function textOn(hex: string): string {
  const h = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
  const lum = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
  return lum > 0.4 ? '#0f172a' : '#ffffff'
}
