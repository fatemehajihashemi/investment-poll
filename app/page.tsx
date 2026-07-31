'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from './lib/supabase'

type SessionData = {
  id: string
  title: string
  teams: { name: string } | null
}

export default function RegisterPage() {
  const router = useRouter()
  const [session, setSession] = useState<SessionData | null>(null)
  const [loading, setLoading] = useState(true)
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    async function loadActiveSession() {
      const { data, error } = await supabase
        .from('sessions')
        .select('id, title, teams(name)')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (error) {
        setError('خطا در دریافت اطلاعات جلسه')
      } else if (!data) {
        setError('هیچ جلسه‌ی فعالی یافت نشد')
      } else {
        setSession(data as unknown as SessionData)
      }
      setLoading(false)
    }
    loadActiveSession()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!fullName.trim() || !session) return

    setSubmitting(true)
    const { data, error } = await supabase
      .from('participants')
      .insert({
        session_id: session.id,
        full_name: fullName.trim(),
        role: role.trim() || null,
      })
      .select()
      .single()

    if (error || !data) {
      setError('خطا در ثبت‌نام. لطفاً دوباره تلاش کنید.')
      setSubmitting(false)
      return
    }

    sessionStorage.setItem('participant_id', data.id)
    sessionStorage.setItem('session_id', session.id)
    router.push('/questions')
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" dir="rtl">
        <p className="text-gray-500">در حال بارگذاری...</p>
      </div>
    )
  }

  if (error && !session) {
    return (
      <div className="min-h-screen flex items-center justify-center" dir="rtl">
        <p className="text-red-600">{error}</p>
      </div>
    )
  }

  if (!session) return null

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4" dir="rtl">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8">
        <h1 className="text-xl font-bold text-gray-900 mb-1">{session.title}</h1>
        <p className="text-sm text-gray-500 mb-6">
          {session.teams?.name}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              نام و نام خانوادگی
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="مثلاً علی محمدی"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              سمت (اختیاری)
            </label>
            <input
              type="text"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="مثلاً مدیر سرمایه‌گذاری"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-lg transition disabled:opacity-50"
          >
            {submitting ? 'در حال ثبت...' : 'ورود به پرسشنامه'}
          </button>
        </form>
      </div>
    </div>
  )
}