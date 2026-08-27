'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '../../lib/supabase'

type Team = { id: string; name: string }
type QuestionSet = { id: string; title: string }

const DURATION_OPTIONS = [
  { label: '۱۵ دقیقه', value: 15 },
  { label: '۳۰ دقیقه', value: 30 },
  { label: '۶۰ دقیقه', value: 60 },
  { label: '۱۲۰ دقیقه', value: 120 },
  { label: '۲۴۰ دقیقه (۴ ساعت)', value: 240 },
]

export default function NewSessionPage() {
  const router = useRouter()
  const [teams, setTeams] = useState<Team[]>([])
  const [questionSets, setQuestionSets] = useState<QuestionSet[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  const [title, setTitle] = useState('')
  const [teamId, setTeamId] = useState('')
  const [questionSetId, setQuestionSetId] = useState('')
  const [expectedParticipants, setExpectedParticipants] = useState(5)
  const [duration, setDuration] = useState(60)

  useEffect(() => {
    async function load() {
      const { data: teamData } = await supabase.from('teams').select('id, name')
      const { data: qsData } = await supabase
        .from('question_sets')
        .select('id, title')
        .order('created_at', { ascending: false })
      setTeams(teamData || [])
      setQuestionSets(qsData || [])
      if (teamData && teamData.length > 0) setTeamId(teamData[0].id)
      if (qsData && qsData.length > 0) setQuestionSetId(qsData[0].id)
      setLoading(false)
    }
    load()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !teamId || !questionSetId) return
    setError('')
    setCreating(true)

    const now = new Date()
    const expiresAt = new Date(now.getTime() + duration * 60000)

    const { data, error: insertError } = await supabase
      .from('sessions')
      .insert({
        title: title.trim(),
        team_id: teamId,
        question_set_id: questionSetId,
        expected_participants: expectedParticipants,
        duration_minutes: duration,
        expires_at: expiresAt.toISOString(),
        is_active: true,
      })
      .select()
      .single()

    if (insertError || !data) {
      setError('خطا در ساخت جلسه')
      setCreating(false)
      return
    }

    router.push(`/reports/${data.id}`)
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
      <div className="max-w-md mx-auto">
        <Link href="/admin" className="text-xs text-slate-400 hover:text-slate-600 mb-4 inline-block">
          ← بازگشت
        </Link>
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <h1 className="text-lg font-bold text-slate-900 mb-1">ایجاد جلسه‌ی جدید</h1>
          <p className="text-xs text-slate-500 mb-6">اطلاعات جلسه و پرسشنامه را وارد کنید</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">عنوان جلسه</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                placeholder="مثلاً جلسه کمیته سرمایه‌گذاری - شهریور ۱۴۰۵"
                className="w-full border border-slate-200 rounded-md px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">تیم</label>
              <select
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
                className="w-full border border-slate-200 rounded-md px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400"
              >
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">بسته سوالات</label>
              <select
                value={questionSetId}
                onChange={(e) => setQuestionSetId(e.target.value)}
                className="w-full border border-slate-200 rounded-md px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400"
              >
                {questionSets.map((qs) => (
                  <option key={qs.id} value={qs.id}>{qs.title}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">تعداد اعضا</label>
                <input
                  type="number"
                  min={1}
                  value={expectedParticipants}
                  onChange={(e) => setExpectedParticipants(Number(e.target.value))}
                  className="w-full border border-slate-200 rounded-md px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">مدت فعال بودن</label>
                <select
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                  className="w-full border border-slate-200 rounded-md px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400"
                >
                  {DURATION_OPTIONS.map((d) => (
                    <option key={d.value} value={d.value}>{d.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {error && <p className="text-xs text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={creating}
              className="w-full bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium py-2.5 rounded-md disabled:opacity-50 transition"
            >
              {creating ? 'در حال ساخت...' : 'ایجاد جلسه'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
