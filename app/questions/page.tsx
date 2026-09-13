'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../lib/supabase'

type SliderAsset = { name: string; min: number; max: number; step: number }

type Question = {
  id: string
  order_num: number
  question_text: string
  question_type: 'single' | 'multi' | 'slider' | 'allocation' | 'slider_group'
  options: any
  max_select: number
}

// --- رنگ‌بندی دارایی‌محور (هماهنگ با گزارش) ---
const ASSET_COLOR_MAP: Record<string, string> = {
  'بورس': '#2563eb',
  'سهام': '#2563eb',
  'طلا': '#f59e0b',
  'درآمد ثابت': '#06b6d4',
  'گواهی سپرده کالایی': '#10b981',
  'کاورد کال': '#8b5cf6',
}
const FALLBACK_COLORS = ['#2563eb', '#f59e0b', '#10b981', '#8b5cf6', '#06b6d4']
function getAssetColor(name: string, index: number) {
  return ASSET_COLOR_MAP[name] || FALLBACK_COLORS[index % FALLBACK_COLORS.length]
}
// --- پایان رنگ‌بندی ---

// --- منطق تشخیص خودکار زنجیره‌ی «برنده / بازدهی‌ها / تخصیص نهایی» ---
// این تابع بدون وابستگی به شماره‌ی ثابت سوال، خودش تشخیص می‌ده کدوم سوال «برنده»،
// کدوم سوال «بازدهی‌های ادغام‌شده» (slider_group)، و کدوم سوال «تخصیص بلندمدت» هستن.
type ConsistencyBlock = {
  winnerQ: Question
  longTermAllocationQ: Question
  returnsQ: Question
}

function sameOptionSet(a: string[], b: string[]) {
  return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x) => b.includes(x))
}

function getConsistencyBlock(questions: Question[]): ConsistencyBlock | null {
  const allocationQs = questions.filter((q) => q.question_type === 'allocation')
  const singleQs = questions.filter((q) => q.question_type === 'single')
  const sliderGroupQs = questions.filter((q) => q.question_type === 'slider_group')

  for (const winnerQ of singleQs) {
    const winnerAssets: string[] = winnerQ.options
    if (!Array.isArray(winnerAssets) || winnerAssets.length === 0) continue

    // سوال «تخصیص بلندمدت»: همون گزینه‌های سوال برنده رو داره و بعد از اون میاد
    const matchingAllocations = allocationQs.filter((aq) => sameOptionSet(aq.options, winnerAssets))
    const longTermAllocationQ = matchingAllocations
      .filter((aq) => aq.order_num > winnerQ.order_num)
      .sort((a, b) => a.order_num - b.order_num)[0]
    if (!longTermAllocationQ) continue

    // سوال «بازدهی‌های ادغام‌شده»: دارایی‌هاش دقیقاً همون گزینه‌های سوال برنده هستن
    const returnsQ = sliderGroupQs.find((sq) => {
      const assetNames = ((sq.options?.assets || []) as SliderAsset[]).map((a) => a.name)
      return sameOptionSet(assetNames, winnerAssets)
    })
    if (!returnsQ) continue

    return { winnerQ, longTermAllocationQ, returnsQ }
  }

  return null
}

// بررسی جداگانه: بلافاصله بعد از سوال «بازدهی‌ها» صدا زده می‌شه
function checkReturnsConsistency(block: ConsistencyBlock, answers: Record<string, any>): string | null {
  const winnerAsset: string | undefined = answers[block.winnerQ.id]
  if (!winnerAsset) return null

  const returnsAnswer: Record<string, number> = answers[block.returnsQ.id] || {}
  const entries = Object.entries(returnsAnswer)
  if (entries.length === 0) return null

  const maxVal = Math.max(...entries.map(([, v]) => Number(v)))
  const topAssets = entries.filter(([, v]) => Number(v) === maxVal).map(([k]) => k)

  if (!topAssets.includes(winnerAsset)) {
    return `شما «${winnerAsset}» را در سوال قبل به‌عنوان دارایی برنده انتخاب کرده‌اید، اما در همین سوال، بالاترین بازده مورد انتظار را به «${topAssets.join(
      ' یا '
    )}» داده‌اید. لطفاً پاسخ‌ها را هماهنگ کنید.`
  }
  return null
}

// بررسی جداگانه: بلافاصله بعد از سوال «تخصیص نهایی» صدا زده می‌شه
function checkAllocationConsistency(block: ConsistencyBlock, answers: Record<string, any>): string | null {
  const winnerAsset: string | undefined = answers[block.winnerQ.id]
  if (!winnerAsset) return null

  const allocationAnswer: Record<string, number> = answers[block.longTermAllocationQ.id] || {}
  const entries = Object.entries(allocationAnswer)
  if (entries.length === 0) return null

  const maxVal = Math.max(...entries.map(([, v]) => Number(v)))
  const topAssets = entries.filter(([, v]) => Number(v) === maxVal).map(([k]) => k)

  if (!topAssets.includes(winnerAsset)) {
    return `شما «${winnerAsset}» را به‌عنوان دارایی برنده انتخاب کرده‌اید، اما در همین سوال، بیشترین درصد تخصیص را به «${topAssets.join(
      ' یا '
    )}» داده‌اید. لطفاً درصد «${winnerAsset}» را بیشترین مقدار قرار دهید.`
  }
  return null
}
// --- پایان منطق اعتبارسنجی ---

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

  const consistencyBlock = questions.length > 0 ? getConsistencyBlock(questions) : null

  function setAnswer(questionId: string, value: any) {
    setAnswers((prev) => ({ ...prev, [questionId]: value }))
  }

  function isAnswered(q: Question) {
    const val = answers[q.id]
    if (q.question_type === 'multi') return Array.isArray(val) && val.length > 0
    if (q.question_type === 'allocation') {
      if (!val) return false
      const sum = Object.values(val).reduce((a: number, b: any) => a + Number(b || 0), 0)
      const allMinTen = (q.options as string[]).every((label) => Number(val[label] || 0) >= 10)
      return sum === 100 && allMinTen
    }
    if (q.question_type === 'slider' || q.question_type === 'slider_group') return true
    return val !== undefined && val !== null && val !== ''
  }

  async function handleNext() {
    const q = questions[current]
    if (!isAnswered(q)) {
      if (q.question_type === 'allocation') {
        const val = answers[q.id] || {}
        const sum = Object.values(val).reduce((a: number, b: any) => a + Number(b || 0), 0)
        const under = (q.options as string[]).filter((label) => Number(val[label] || 0) < 10)
        if (sum === 100 && under.length > 0) {
          setError(`سهم هر گزینه باید حداقل ۱۰٪ باشد. سهم «${under.join('، ')}» کمتر از ۱۰٪ است.`)
        } else {
          setError('لطفاً قبل از ادامه، به این سوال پاسخ دهید.')
        }
      } else {
        setError('لطفاً قبل از ادامه، به این سوال پاسخ دهید.')
      }
      return
    }

    if (consistencyBlock && q.id === consistencyBlock.returnsQ.id) {
      const returnsError = checkReturnsConsistency(consistencyBlock, answers)
      if (returnsError) {
        setError(returnsError)
        return
      }
    }

    if (consistencyBlock && q.id === consistencyBlock.longTermAllocationQ.id) {
      const allocationError = checkAllocationConsistency(consistencyBlock, answers)
      if (allocationError) {
        setError(allocationError)
        return
      }
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
            answer: answers[q.id] ?? (q.question_type === 'slider' ? 0 : answers[q.id]),
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
          <button onClick={() => router.back()} className="block w-full text-center text-xs text-slate-400 hover:text-slate-600 mt-5">بازگشت</button>
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
            <div dir="ltr">
              {(() => {
                const val = answers[q.id] ?? 0
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
                        background: `linear-gradient(to right, #2563eb ${percent}%, #e5e7eb ${percent}%)`,
                      }}
                    />
                    <div className="flex justify-between mt-2 text-xs text-gray-400">
                      <span>
                        {q.options.min}
                        {q.options.unit}
                      </span>
                      <span>
                        {q.options.max}
                        {q.options.unit}
                      </span>
                    </div>
                  </>
                )
              })()}
            </div>
          )}

          {q.question_type === 'slider_group' && (
            <div className="space-y-5">
              {(q.options.assets as SliderAsset[]).map((asset, i) => {
                const current = answers[q.id] || {}
                const val = current[asset.name] ?? asset.min
                const percent = ((val - asset.min) / (asset.max - asset.min)) * 100
                const color = getAssetColor(asset.name, i)
                return (
                  <div key={asset.name}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-medium text-gray-700 flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full inline-block"
                          style={{ backgroundColor: color }}
                        />
                        {asset.name}
                      </span>
                      <span className="text-sm font-bold" style={{ color }}>
                        {val}
                        {q.options.unit}
                      </span>
                    </div>
                    <div dir="ltr">
                      <input
                        type="range"
                        min={asset.min}
                        max={asset.max}
                        step={asset.step}
                        value={val}
                        onChange={(e) =>
                          setAnswer(q.id, { ...current, [asset.name]: Number(e.target.value) })
                        }
                        className="w-full h-2 rounded-full appearance-none cursor-pointer"
                        style={{
                          background: `linear-gradient(to right, ${color} ${percent}%, #e5e7eb ${percent}%)`,
                          accentColor: color,
                        }}
                      />
                      <div className="flex justify-between mt-1 text-[11px] text-gray-400">
                        <span>
                          {asset.min}
                          {q.options.unit}
                        </span>
                        <span>
                          {asset.max}
                          {q.options.unit}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

{q.question_type === 'allocation' && (
            <div>
              {(() => {
                const current = answers[q.id] || {}
                const sum = q.options.reduce(
                  (acc: number, label: string) => acc + Number(current[label] || 0),
                  0
                )
                const allMinTen = (q.options as string[]).every(
                  (label) => Number(current[label] || 0) >= 10
                )
                const isValid = sum === 100 && allMinTen

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
                            style={{ width: `${width}%`, backgroundColor: getAssetColor(label, i) }}
                          >
                            {val > 8 ? `${val}٪` : ''}
                          </div>
                        )
                      })}
                    </div>

                    {/* ورودی‌ها */}
                    <div className="space-y-3">
                      {q.options.map((label: string, i: number) => {
                        const belowMin = Number(current[label] || 0) < 10
                        return (
                          <div key={label} className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span
                                className="w-3 h-3 rounded-full inline-block"
                                style={{ backgroundColor: getAssetColor(label, i) }}
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
                                className={`w-20 border-2 rounded-xl px-2 py-1.5 text-center focus:outline-none ${
                                  belowMin
                                    ? 'border-amber-300 focus:border-amber-400'
                                    : 'border-gray-200 focus:border-blue-500'
                                }`}
                              />
                              <span className="text-xs text-gray-400">٪</span>
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    <p className={`text-xs mt-3 font-medium ${isValid ? 'text-green-600' : 'text-gray-400'}`}>
                      مجموع فعلی: {sum} از ۱۰۰ {isValid ? '✓' : ''}
                    </p>
                    <p className="text-[11px] text-gray-400 mt-1">حداقل سهم هر گزینه باید ۱۰٪ باشد.</p>
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
