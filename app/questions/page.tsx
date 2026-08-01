'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../lib/supabase'

type Question = {
  id: string
  order_num: number
  question_text: string
  question_type: 'single' | 'multi' | 'slider' | 'allocation'
  options: any
  max_select: number
}

export default function QuestionsPage() {
  const router = useRouter()
  const [questions, setQuestions] = useState<Question[]>([])
  const [current, setCurrent] = useState(0)
  const [answers, setAnswers] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [finishing, setFinishing] = useState(false)
  const [done, setDone] = useState(false)

  const participantId = typeof window !== 'undefined' ? sessionStorage.getItem('participant_id') : null
  const sessionId = typeof window !== 'undefined' ? sessionStorage.getItem('session_id') : null

  useEffect(() => {
    if (!participantId || !sessionId) {
      router.push('/')
      return
    }

    async function loadQuestions() {
      const { data: sessionData, error: sessionError } = await supabase
        .from('sessions')
        .select('question_set_id')
        .eq('id', sessionId)
        .single()

      if (sessionError || !sessionData) {
        setError('خطا در دریافت اطلاعات جلسه')
        setLoading(false)
        return
      }

      const { data: questionData, error: questionError } = await supabase
        .from('questions')
        .select('*')
        .eq('question_set_id', sessionData.question_set_id)
        .order('order_num', { ascending: true })

      if (questionError || !questionData) {
        setError('خطا در دریافت سوالات')
      } else {
        setQuestions(questionData as Question[])
      }
      setLoading(false)
    }
    loadQuestions()
  }, [])

  function setAnswer(questionId: string, value: any) {
    setAnswers((prev) => ({ ...prev, [questionId]: value }))
  }

  function isAnswered(q: Question) {
    const val = answers[q.id]
    if (q.question_type === 'multi') return Array.isArray(val) && val.length > 0
    if (q.question_type === 'allocation') {
      if (!val) return false
      const sum = Object.values(val).reduce((a: number, b: any) => a + Number(b || 0), 0)
      return sum === 100
    }
    return val !== undefined && val !== null && val !== ''
  }

  async function handleNext() {
    const q = questions[current]
    if (!isAnswered(q)) {
      setError('لطفاً قبل از ادامه، به این سوال پاسخ دهید.')
      return
    }
    setError('')

    if (current < questions.length - 1) {
      setCurrent(current + 1)
    } else {
      await submitAllAnswers()
    }
  }

  function handlePrev() {
    setError('')
    if (current > 0) setCurrent(current - 1)
  }

  async function submitAllAnswers() {
    setFinishing(true)
    const rows = questions.map((q) => ({
      session_id: sessionId,
      question_id: q.id,
      participant_id: participantId,
      answer: answers[q.id],
    }))

    const { error: insertError } = await supabase.from('responses').insert(rows)

    if (insertError) {
      setError('خطا در ثبت پاسخ‌ها. لطفاً دوباره تلاش کنید.')
      setFinishing(false)
      return
    }

    setDone(true)
    setFinishing(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-gray-50 to-gray-100" dir="rtl">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-400 text-sm">در حال بارگذاری سوالات...</p>
        </div>
      </div>
    )
  }
  
if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4" dir="rtl">
        <div className="text-center bg-white border border-slate-200 rounded-xl p-10 max-w-md w-full">
          <div className="w-12 h-12 bg-slate-900 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-xl text-white">✓</span>
          </div>
          <h1 className="text-lg font-bold text-slate-900 mb-1.5">پاسخ‌های شما ثبت شد</h1>
          <p className="text-sm text-slate-500 mb-6">از مشارکت شما در این پرسشنامه سپاسگزاریم.</p>
          <a href={`/reports/${sessionId}`} className="inline-block bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium px-6 py-2.5 rounded-md transition">مشاهده‌ی گزارش زنده</a>
        </div>
      </div>
    )
  }

  if (questions.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center" dir="rtl">
        <p className="text-red-600">{error || 'سوالی یافت نشد'}</p>
      </div>
    )
  }

  const q = questions[current]
  const progressPercent = ((current + 1) / questions.length) * 100

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-gray-50 to-gray-100 px-4 py-10" dir="rtl">
      <div className="w-full max-w-lg">
        {/* نوار پیشرفت */}
        <div className="mb-4">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs font-medium text-gray-500">
              سوال {current + 1} از {questions.length}
            </span>
            <span className="text-xs font-medium text-blue-600">
              {Math.round(progressPercent)}٪
            </span>
          </div>
          <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-600 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* کارت سوال */}
        <div
          key={q.id}
          className="bg-white rounded-3xl shadow-xl p-8 animate-[fadeIn_0.3s_ease-out]"
        >
          <h2 className="text-lg font-bold text-gray-900 mb-6 leading-relaxed">
            {q.question_text}
          </h2>

          {q.question_type === 'single' && (
            <div className="space-y-2">
              {q.options.map((opt: string) => (
                <label
                  key={opt}
                  className={`block border-2 rounded-xl px-4 py-3.5 cursor-pointer transition-all ${
                    answers[q.id] === opt
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="radio"
                    name={q.id}
                    className="ml-2 accent-blue-600"
                    checked={answers[q.id] === opt}
                    onChange={() => setAnswer(q.id, opt)}
                  />
                  {opt}
                </label>
              ))}
            </div>
          )}

          {q.question_type === 'multi' && (
            <div className="space-y-2">
              <p className="text-xs text-gray-400 mb-3">حداکثر {q.max_select} گزینه</p>
              {q.options.map((opt: string) => {
                const selected: string[] = answers[q.id] || []
                const checked = selected.includes(opt)
                return (
                  <label
                    key={opt}
                    className={`block border-2 rounded-xl px-4 py-3.5 cursor-pointer transition-all ${
                      checked ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="ml-2 accent-blue-600"
                      checked={checked}
                      onChange={() => {
                        if (checked) {
                          setAnswer(q.id, selected.filter((s) => s !== opt))
                        } else if (selected.length < q.max_select) {
                          setAnswer(q.id, [...selected, opt])
                        }
                      }}
                    />
                    {opt}
                  </label>
                )
              })}
            </div>
          )}

{q.question_type === 'slider' && (
            <div>
              {(() => {
                const val = answers[q.id] ?? Math.round((q.options.min + q.options.max) / 2)
                const percent = ((val - q.options.min) / (q.options.max - q.options.min)) * 100
                return (
                  <>
                    <div className="text-center mb-4">
                      <span className="inline-block bg-blue-50 text-blue-700 font-bold text-2xl px-5 py-2 rounded-2xl">
                        {val}
                        {q.options.unit}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={q.options.min}
                      max={q.options.max}
                      step={q.options.step}
                      value={val}
                      onChange={(e) => setAnswer(q.id, Number(e.target.value))}
                      className="w-full h-2 rounded-full appearance-none cursor-pointer accent-blue-600"
                      style={{
                        background: `linear-gradient(to left, #2563eb ${percent}%, #e5e7eb ${percent}%)`,
                      }}
                    />
                    <div className="flex justify-between mt-2 text-xs text-gray-400">
                      <span>
                        {q.options.max}
                        {q.options.unit}
                      </span>
                      <span>
                        {q.options.min}
                        {q.options.unit}
                      </span>
                    </div>
                  </>
                )
              })()}
            </div>
          )}

{q.question_type === 'allocation' && (
            <div>
              {(() => {
                const colors = ['#2563eb', '#f59e0b', '#10b981']
                const current = answers[q.id] || {}
                const sum = q.options.reduce(
                  (acc: number, label: string) => acc + Number(current[label] || 0),
                  0
                )
                const isValid = sum === 100

                return (
                  <>
                    {/* نوار بصری */}
                    <div className="w-full h-8 rounded-full overflow-hidden flex bg-gray-100 mb-5">
                      {q.options.map((label: string, i: number) => {
                        const val = Number(current[label] || 0)
                        const width = sum > 0 ? (val / Math.max(sum, 100)) * 100 : 0
                        return (
                          <div
                            key={label}
                            className="h-full transition-all duration-300 flex items-center justify-center text-xs text-white font-medium"
                            style={{ width: `${width}%`, backgroundColor: colors[i % colors.length] }}
                          >
                            {val > 8 ? `${val}٪` : ''}
                          </div>
                        )
                      })}
                    </div>

                    {/* ورودی‌ها */}
                    <div className="space-y-3">
                      {q.options.map((label: string, i: number) => (
                        <div key={label} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span
                              className="w-3 h-3 rounded-full inline-block"
                              style={{ backgroundColor: colors[i % colors.length] }}
                            />
                            <span className="text-sm">{label}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              min={0}
                              max={100}
                              value={current[label] ?? ''}
                              onChange={(e) =>
                                setAnswer(q.id, { ...current, [label]: Number(e.target.value) })
                              }
                              className="w-20 border-2 border-gray-200 rounded-xl px-2 py-1.5 text-center focus:border-blue-500 focus:outline-none"
                            />
                            <span className="text-xs text-gray-400">٪</span>
                          </div>
                        </div>
                      ))}
                    </div>

                    <p className={`text-xs mt-3 font-medium ${isValid ? 'text-green-600' : 'text-gray-400'}`}>
                      مجموع فعلی: {sum} از ۱۰۰ {isValid ? '✓' : ''}
                    </p>
                  </>
                )
              })()}
            </div>
          )}

          {error && <p className="text-sm text-red-600 mt-4">{error}</p>}

          <div className="flex justify-between mt-8">
            <button
              onClick={handlePrev}
              disabled={current === 0}
              className="px-4 py-2 rounded-xl text-gray-500 disabled:opacity-30 hover:bg-gray-50 transition"
            >
              قبلی
            </button>
            <button
              onClick={handleNext}
              disabled={finishing}
              className="bg-blue-600 hover:bg-blue-700 text-white px-7 py-2.5 rounded-xl font-medium shadow-md shadow-blue-200 disabled:opacity-50 transition"
            >
              {finishing ? 'در حال ثبت...' : current === questions.length - 1 ? 'پایان و ثبت نهایی' : 'بعدی'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}