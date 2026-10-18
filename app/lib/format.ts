// قالب‌بندی یکدست اعداد در گزارش‌ها: همه‌جا ارقام فارسی (۱۲، ۳۶٫۴٪)

const nf0to1 = new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 1 })
const nf1 = new Intl.NumberFormat('fa-IR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

// حداکثر یک رقم اعشار؛ عدد صحیح بدون اعشار (۵۰، ۳۶٫۴)
export const fa = (n: number) => nf0to1.format(n)

// همیشه یک رقم اعشار (۵٫۰، ۱۲٫۳)
export const fa1 = (n: number) => nf1.format(n)

export const round1 = (n: number) => Math.round(n * 10) / 10

// درصد با یک رقم اعشار؛ عدد نمایش‌داده‌شده همان نتیجه‌ی محاسبه است، بدون دستکاری برای رسیدن به جمع ۱۰۰.
export const fmtPct = (n: number) => `${fa(round1(n))}٪`
