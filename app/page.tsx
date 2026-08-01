import Link from 'next/link'

export default function HomePage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4" dir="rtl">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <p className="text-xs font-medium text-slate-400 tracking-wide mb-1">
            سامانه نظرسنجی زنده
          </p>
          <h1 className="text-xl font-bold text-slate-900">کمیته سرمایه‌گذاری</h1>
        </div>

        <div className="space-y-3">
          <RoleCard
            href="/admin"
            title="ورود به عنوان مدیر"
            description="ایجاد جلسه‌ی جدید و مشاهده‌ی گزارش‌ها"
            icon="◆"
          />
          <RoleCard
            href="/join"
            title="ورود به عنوان شرکت‌کننده"
            description="شرکت در پرسشنامه و مشاهده‌ی گزارش‌ها"
            icon="●"
          />
        </div>
      </div>
    </div>
  )
}

function RoleCard({
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
