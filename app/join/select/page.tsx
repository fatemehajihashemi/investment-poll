'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '../../lib/supabase'

type Session = {
  id: string
  title: string
  expires_at: string
  teams: { name: string } | null
}

export default function SelectSessionPage() {
  const router = useRouter()
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Session | null>(null)
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const submittingRef = useRef(false) // جلوگیری از ثبت‌نام دوباره با چند کلیک پشت‌سرهم (state دیرتر از کلیک دوم به‌روز می‌شود)
  const [formError, setFormError] = useState('')

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('sessions')
        .select('id, title, expires_at, teams(name)')
        .order('created_at', { ascending: false })

      setSessions((data as unknown as Session[]) || [])
      setLoading(false)
    }
    load()
  }, [])

  function isActive(session: Session) {
    return new Date(session.expires_at).getTime() > Date.now()
  }

  // فرم ورود داخل خود صفحه است (نه prompt مرورگر)؛ prompt در مرورگرهای داخل برنامه‌ها (تلگرام، اینستاگرام و ...) کار نمی‌کند.
  function openForm(s: Session) {
    setSelected(s)
    setFullName('')
    setRole('')
    setFormError('')
  }

  function closeForm() {
    if (submitting) return
    setSelected(null)
    setFormError('')
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    if (!selected || submittingRef.current) return

    const name = fullName.trim()
    if (name.length < 2) {
      setFormError('نام و نام خانوادگی را وارد کنید.')
      return
    }
    if (!isActive(selected)) {
      setFormError('زمان این جلسه به پایان رسیده است.')
      return
    }

    submittingRef.current = true
    setSubmitting(true)
    setFormError('')

    const { data, error } = await supabase
      .from('participants')
      .insert({
        session_id: selected.id,
        full_name: name,
        role: role.trim() || null,
      })
      .select()
      .single()

    if (error || !data) {
      setFormError('خطا در ثبت‌نام. لطفاً دوباره تلاش کنید.')
      submittingRef.current = false
      setSubmitting(false)
      return
    }

    sessionStorage.setItem('participant_id', data.id)
    sessionStorage.setItem('session_id', selected.id)
    router.push('/questions')
  }

  const activeSessions = sessions.filter(isActive)
  const inactiveSessions = sessions.filter((s) => !isActive(s))

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50" dir="rtl">
        <p className="text-slate-400 text-sm">در حال بارگذاری...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10" dir="rtl">
      <div className="max-w-md mx-auto">
        <Link href="/join" className="text-xs text-slate-400 hover:text-slate-600 mb-4 inline-block">
          ← بازگشت
        </Link>
        <h1 className="text-lg font-bold text-slate-900 mb-1">انتخاب جلسه</h1>
        <p className="text-xs text-slate-500 mb-6">جلسه‌ی فعال خود را انتخاب کنید</p>

        {activeSessions.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-10">در حال حاضر هیچ جلسه‌ی فعالی وجود ندارد</p>
        )}

        <div className="space-y-2.5">
          {activeSessions.map((s) => (
            <button
              key={s.id}
              onClick={() => openForm(s)}
              className="w-full text-right bg-white border border-slate-200 rounded-xl p-4 hover:border-slate-900 transition flex items-center justify-between"
            >
              <div>
                <p className="text-sm font-bold text-slate-900">{s.title}</p>
                <p className="text-xs text-slate-500 mt-0.5">{s.teams?.name}</p>
              </div>
              <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-1 rounded-full">
                فعال
              </span>
            </button>
          ))}

          {inactiveSessions.map((s) => (
            <div
              key={s.id}
              className="w-full text-right bg-slate-50 border border-slate-100 rounded-xl p-4 flex items-center justify-between opacity-60 cursor-not-allowed"
            >
              <div>
                <p className="text-sm font-bold text-slate-500">{s.title}</p>
                <p className="text-xs text-slate-400 mt-0.5">{s.teams?.name}</p>
              </div>
              <span className="text-[10px] bg-slate-100 text-slate-400 border border-slate-200 px-2 py-1 rounded-full">
                غیرفعال
              </span>
            </div>
          ))}
        </div>
      </div>
      {selected && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/40 flex items-end sm:items-center justify-center p-4"
          onClick={closeForm}
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={handleJoin}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm bg-white rounded-xl border border-slate-200 p-5 shadow-lg"
          >
            <h2 className="text-sm font-bold text-slate-900 mb-0.5">ورود به جلسه</h2>
            <p className="text-xs text-slate-500 mb-4">{selected.title}</p>

            <label className="block text-xs font-medium text-slate-600 mb-1.5" htmlFor="full_name">
              نام و نام خانوادگی
            </label>
            <input
              id="full_name"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              autoFocus
              autoComplete="name"
              maxLength={100}
              className="w-full border border-slate-200 rounded-md px-3.5 py-2.5 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400"
            />

            <label className="block text-xs font-medium text-slate-600 mb-1.5" htmlFor="role">
              سمت <span className="text-slate-400 font-normal">(اختیاری)</span>
            </label>
            <input
              id="role"
              type="text"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              maxLength={100}
              className="w-full border border-slate-200 rounded-md px-3.5 py-2.5 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400"
            />

            {formError && <p className="text-xs text-red-600 mb-3">{formError}</p>}

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium py-2.5 rounded-md disabled:opacity-50 transition"
              >
                {submitting ? 'در حال ورود...' : 'ورود و شروع پرسشنامه'}
              </button>
              <button
                type="button"
                onClick={closeForm}
                disabled={submitting}
                className="px-4 text-sm text-slate-500 hover:text-slate-900 border border-slate-200 rounded-md disabled:opacity-50 transition"
              >
                انصراف
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
