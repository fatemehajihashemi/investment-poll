import Link from 'next/link'

export default function AdminHomePage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4" dir="rtl">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <p className="text-xs font-medium text-slate-400 tracking-wide mb-1">پنل مدیریت</p>
          <h1 className="text-xl font-bold text-slate-900">کمیته سرمایه‌گذاری</h1>
        </div>

        <div className="space-y-3">
          <MenuCard
            href="/admin/new"
            title="ایجاد جلسه‌ی جدید"
            description="ساخت پرسشنامه با تنظیمات دلخواه"
            icon="＋"
          />
          <MenuCard
            href="/reports"
            title="گزارش جلسات"
            description="مشاهده‌ی همه‌ی جلسات و نتایج آن‌ها"
            icon="◫"
          />
        </div>

        <Link
          href="/"
          className="block text-center text-xs text-slate-400 hover:text-slate-600 mt-6"
        >
          بازگشت به صفحه‌ی اصلی
        </Link>
      </div>
    </div>
  )
}

function MenuCard({
  href,
  title,
  description,
  icon,
}: {
  href: string
  title: string
  description: string
  icon: string
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-4 bg-white border border-slate-200 rounded-xl p-5 hover:border-slate-300 hover:shadow-sm transition group"
    >
      <span className="shrink-0 w-11 h-11 rounded-lg bg-slate-900 text-white flex items-center justify-center text-lg">
        {icon}
      </span>
      <div className="flex-1">
        <p className="text-sm font-bold text-slate-900">{title}</p>
        <p className="text-xs text-slate-500 mt-0.5">{description}</p>
      </div>
      <span className="text-slate-300 group-hover:text-slate-400 transition">←</span>
    </Link>
  )
}
