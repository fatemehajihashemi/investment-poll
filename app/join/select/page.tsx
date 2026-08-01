'use client'

import { useState, useEffect } from 'react'
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

  async function handleJoin(sessionId: string) {
    const fullName = prompt('نام و نام خانوادگی خود را وارد کنید:')
    if (!fullName || !fullName.trim()) return

    const role = prompt('سمت شما (اختیاری):') || null

    const { data, error } = await supabase
      .from('participants')
      .insert({
        session_id: sessionId,
        full_name: fullName.trim(),
        role: role?.trim() || null,
      })
      .select()
      .single()

    if (error || !data) {
      alert('خطا در ثبت‌نام. لطفاً دوباره تلاش کنید.')
      return
    }

    sessionStorage.setItem('participant_id', data.id)
    sessionStorage.setItem('session_id', sessionId)
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
              onClick={() => handleJoin(s.id)}
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
    </div>
  )
}
