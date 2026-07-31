'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

type Session = {
  id: string
  title: string
  is_active: boolean
  created_at: string
  teams: { name: string } | null
}

type Team = { id: string; name: string }
type QuestionSet = { id: string; title: string }

export default function AdminPage() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [questionSets, setQuestionSets] = useState<QuestionSet[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  const [newTitle, setNewTitle] = useState('')
  const [newTeamId, setNewTeamId] = useState('')
  const [newQuestionSetId, setNewQuestionSetId] = useState('')

  const loadAll = useCallback(async () => {
    const { data: sessionData } = await supabase
      .from('sessions')
      .select('id, title, is_active, created_at, teams(name)')
      .order('created_at', { ascending: false })

    const { data: teamData } = await supabase.from('teams').select('id, name')
    const { data: qsData } = await supabase.from('question_sets').select('id, title')

    setSessions((sessionData as unknown as Session[]) || [])
    setTeams(teamData || [])
    setQuestionSets(qsData || [])

    if (teamData && teamData.length > 0 && !newTeamId) setNewTeamId(teamData[0].id)
    if (qsData && qsData.length > 0 && !newQuestionSetId) setNewQuestionSetId(qsData[0].id)

    setLoading(false)
  }, [newTeamId, newQuestionSetId])

  useEffect(() => {
    loadAll()
  }, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!newTitle.trim() || !newTeamId || !newQuestionSetId) return
    setError('')
    setCreating(true)

    // اول همه‌ی جلسات فعال رو غیرفعال کن
    await supabase.from('sessions').update({ is_active: false }).eq('is_active', true)

    const { error: insertError } = await supabase.from('sessions').insert({
      title: newTitle.trim(),
      team_id: newTeamId,
      question_set_id: newQuestionSetId,
      is_active: true,
    })

    if (insertError) {
      setError('خطا در ساخت جلسه')
      setCreating(false)
      return
    }

    setNewTitle('')
    setCreating(false)
    loadAll()
  }

  async function toggleActive(session: Session) {
    if (!session.is_active) {
      // فعال‌کردن این یکی یعنی بقیه رو غیرفعال کنیم
      await supabase.from('sessions').update({ is_active: false }).eq('is_active', true)
      await supabase.from('sessions').update({ is_active: true }).eq('id', session.id)
    } else {
      await supabase.from('sessions').update({ is_active: false }).eq('id', session.id)
    }
    loadAll()
  }

  function copyLink(path: string) {
    const url = `${window.location.origin}${path}`
    navigator.clipboard.writeText(url)
    alert('لینک کپی شد ✅')
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" dir="rtl">
        <p className="text-gray-400">در حال بارگذاری...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 px-6 py-8" dir="rtl">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">پنل مدیریت جلسات</h1>

        {/* فرم ساخت جلسه جدید */}
        <div className="bg-white rounded-2xl shadow-sm p-6 mb-8">
          <h2 className="font-bold text-gray-800 mb-4">ساخت جلسه‌ی جدید</h2>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">عنوان جلسه</label>
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                required
                placeholder="مثلاً جلسه کمیته سرمایه‌گذاری - شهریور ۱۴۰۵"
                className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1">تیم</label>
                <select
                  value={newTeamId}
                  onChange={(e) => setNewTeamId(e.target.value)}
                  className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 focus:border-blue-500 focus:outline-none"
                >
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">بسته سوالات</label>
                <select
                  value={newQuestionSetId}
                  onChange={(e) => setNewQuestionSetId(e.target.value)}
                  className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 focus:border-blue-500 focus:outline-none"
                >
                  {questionSets.map((qs) => (
                    <option key={qs.id} value={qs.id}>
                      {qs.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={creating}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-xl font-medium disabled:opacity-50"
            >
              {creating ? 'در حال ساخت...' : '+ ساخت جلسه (و فعال‌سازی آن)'}
            </button>
          </form>
        </div>

        {/* لیست جلسات */}
        <h2 className="font-bold text-gray-800 mb-3">جلسات موجود</h2>
        <div className="space-y-3">
          {sessions.map((s) => (
            <div
              key={s.id}
              className={`bg-white rounded-xl shadow-sm p-4 flex items-center justify-between ${
                s.is_active ? 'ring-2 ring-green-400' : ''
              }`}
            >
              <div>
                <p className="font-medium text-gray-900">
                  {s.title}
                  {s.is_active && (
                    <span className="mr-2 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                      فعال
                    </span>
                  )}
                </p>
                <p className="text-xs text-gray-400">{s.teams?.name}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => copyLink('/')}
                  className="text-xs text-blue-600 hover:underline"
                >
                  کپی لینک ثبت‌نام
                </button>
                <button
                  onClick={() => copyLink('/dashboard')}
                  className="text-xs text-blue-600 hover:underline"
                >
                  کپی لینک داشبورد
                </button>
                <button
                  onClick={() => toggleActive(s)}
                  className={`text-xs px-3 py-1.5 rounded-lg font-medium ${
                    s.is_active
                      ? 'bg-red-50 text-red-600 hover:bg-red-100'
                      : 'bg-green-50 text-green-600 hover:bg-green-100'
                  }`}
                >
                  {s.is_active ? 'غیرفعال کن' : 'فعال کن'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}