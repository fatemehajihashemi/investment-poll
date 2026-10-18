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
