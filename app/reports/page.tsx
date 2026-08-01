'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { supabase } from '../lib/supabase'

type Session = {
  id: string
  title: string
  created_at: string
  expires_at: string
  duration_minutes: number
  expected_participants: number | null
  teams: { name: string } | null
  question_sets: { title: string } | null
}

export default function ReportsListPage() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [participantCounts, setParticipantCounts] = useState<Record<string, number>>({})

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('sessions')
        .select('id, title, created_at, expires_at, duration_minutes, expected_participants, teams(name), question_sets(title)')
        .order('created_at', { ascending: false })

      const list = (data as unknown as Session[]) || []
      setSessions(list)

      const counts: Record<string, number> = {}
      await Promise.all(
        list.map(async (s) => {
          const { count } = await supabase
            .from('participants')
            .select('*', { count: 'exact', head: true })
            .eq('session_id', s.id)
          counts[s.id] = count || 0
        })
      )
      setParticipantCounts(counts)
      setLoading(false)
    }
    load()
  }, [])

  function isActive(session: Session) {
    return new Date(session.expires_at).getTime() > Date.now()
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('fa-IR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50" dir="rtl">
        <p className="text-slate-400 text-sm">در حال بارگذاری...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10" dir="rtl">
      <div className="max-w-2xl mx-auto">
        <Link href="/" className="text-xs text-slate-400 hover:text-slate-600 mb-4 inline-block">
          ← بازگشت به صفحه‌ی اصلی
        </Link>
        <h1 className="text-lg font-bold text-slate-900 mb-1">گزارش جلسات</h1>
        <p className="text-xs text-slate-500 mb-6">فهرست تمام جلسات برگزارشده</p>

        {sessions.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-10">هنوز جلسه‌ای ایجاد نشده است</p>
        )}

        <div className="space-y-2.5">
          {sessions.map((s) => {
            const active = isActive(s)
            return (
              <Link
                key={s.id}
                href={`/reports/${s.id}`}
                className="block bg-white border border-slate-200 rounded-xl p-4 hover:border-slate-300 hover:shadow-sm transition"
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <p className="text-sm font-bold text-slate-900">{s.title}</p>
                  <span
                    className={`shrink-0 text-[10px] px-2 py-1 rounded-full border ${
                      active
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                        : 'bg-slate-50 text-slate-400 border-slate-200'
                    }`}
                  >
                    {active ? 'فعال' : 'غیرفعال'}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mb-3">
                  {s.teams?.name} · {s.question_sets?.title}
                </p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-400">
                  <span>تاریخ ایجاد: {formatDate(s.created_at)}</span>
                  <span>مدت: {s.duration_minutes} دقیقه</span>
                  <span>
                    شرکت‌کننده: {participantCounts[s.id] ?? 0}
                    {s.expected_participants ? ` از ${s.expected_participants}` : ''}
                  </span>
                </div>
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}
