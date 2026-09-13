'use client'

import { useReactToPrint } from 'react-to-print'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '../../lib/supabase'
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts'

type SliderAsset = { name: string; min: number; max: number; step: number }

type Question = {
  id: string
  order_num: number
  question_text: string
  question_type: 'single' | 'multi' | 'slider' | 'allocation' | 'slider_group'
  options: any
}

type ResponseRow = {
  question_id: string
  answer: any
}

const CHART_COLORS = ['#2563eb', '#f59e0b', '#10b981', '#8b5cf6', '#ef4444', '#06b6d4']
const COLOR_BY_NAME: Record<string, string> = {
  'بورس': '#2563eb',
  'سهام': '#2563eb',
  'طلا': '#f59e0b',
  'درآمد ثابت': '#06b6d4',
  'گواهی سپرده کالایی': '#10b981',
  'کاورد کال': '#8b5cf6',
}
function getColor(name: string, index: number) {
  return COLOR_BY_NAME[name] || CHART_COLORS[(index + 3) % CHART_COLORS.length]
}

// --- تشخیص خودکار ساختار سوالات (کوتاه‌مدت / بلندمدت / سایر) ---
// بدون وابستگی به شماره‌ی ثابت سوال، تا با تغییر بعدی سوالات یا گزارش‌های قدیمی خراب نشه.
// شامل پشتیبانی از هر دو فرمت: سوال‌های بازه‌ای جداگانه (گزارش‌های قدیمی) و سوال بازدهی ادغام‌شده (slider_group).
function sameOptionSet(a: string[], b: string[]) {
  return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x) => b.includes(x))
}

type Structure = {
  winnerQ: Question | null
  shortTermAllocationQ: Question | null
  longTermAllocationQ: Question | null
  sliderQs: Question[] // فرمت قدیمی: سوال‌های بازه‌ای جداگانه
  returnsQ: Question | null // فرمت جدید: سوال بازدهی ادغام‌شده
  riskQ: Question | null
  shortTermQs: Question[]
  longTermQs: Question[]
  otherQs: Question[]
}

function analyzeStructure(questions: Question[]): Structure {
  const allocationQs = questions.filter((q) => q.question_type === 'allocation')
  const singleQs = questions.filter((q) => q.question_type === 'single')
  const sliderGroupQs = questions.filter((q) => q.question_type === 'slider_group')

  let winnerQ: Question | null = null
  let longTermAllocationQ: Question | null = null
  let shortTermAllocationQ: Question | null = null
  let returnsQ: Question | null = null

  for (const candidate of singleQs) {
    const assets: string[] = candidate.options
    const matching = allocationQs.filter((aq) => sameOptionSet(aq.options, assets))
    const after = matching
      .filter((aq) => aq.order_num > candidate.order_num)
      .sort((a, b) => a.order_num - b.order_num)[0]
    const before = matching
      .filter((aq) => aq.order_num < candidate.order_num)
      .sort((a, b) => b.order_num - a.order_num)[0]
    if (after) {
      winnerQ = candidate
      longTermAllocationQ = after
      shortTermAllocationQ = before || null
      returnsQ =
        sliderGroupQs.find((sq) => {
          const names = ((sq.options?.assets || []) as SliderAsset[]).map((a) => a.name)
          return sameOptionSet(names, assets)
        }) || null
      break
    }
  }

  // فرمت قدیمی: سوال‌های بازه‌ای جداگانه بین سوال برنده و سوال تخصیص بلندمدت (برای گزارش‌های قدیمی‌تر)
  const sliderQs =
    winnerQ && longTermAllocationQ
      ? questions.filter(
          (q) =>
            q.question_type === 'slider' &&
            q.order_num > (winnerQ as Question).order_num &&
            q.order_num < (longTermAllocationQ as Question).order_num
        )
      : []

  const riskQ = questions.find((q) => q.question_type === 'multi' && q.question_text.includes('ریسک')) || null

  const shortTermMultiQ = shortTermAllocationQ
    ? questions.find(
        (q) =>
          q.question_type === 'multi' &&
          q.order_num < (shortTermAllocationQ as Question).order_num &&
          Array.isArray(q.options) &&
          q.options.some((o: string) => o.includes('وزن'))
      ) || null
    : null

  const shortTermIds = new Set([shortTermMultiQ?.id, shortTermAllocationQ?.id].filter(Boolean) as string[])
  const longTermIds = new Set(
    [winnerQ?.id, longTermAllocationQ?.id, returnsQ?.id, ...sliderQs.map((q) => q.id)].filter(Boolean) as string[]
  )

  const shortTermQs = questions.filter((q) => shortTermIds.has(q.id)).sort((a, b) => a.order_num - b.order_num)
  const longTermQs = questions.filter((q) => longTermIds.has(q.id)).sort((a, b) => a.order_num - b.order_num)
  const otherQs = questions
    .filter((q) => !shortTermIds.has(q.id) && !longTermIds.has(q.id))
    .sort((a, b) => a.order_num - b.order_num)

  return {
    winnerQ,
    shortTermAllocationQ,
    longTermAllocationQ,
    sliderQs,
    returnsQ,
    riskQ,
    shortTermQs,
    longTermQs,
    otherQs,
  }
}
// --- پایان تشخیص ساختار ---

export default function SessionReportPage() {
  const params = useParams()
  const sessionId = params.id as string

  const contentRef = useRef<HTMLDivElement>(null)
  const handlePrint = useReactToPrint({ contentRef })
  const [session, setSession] = useState<any>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [responses, setResponses] = useState<ResponseRow[]>([])
  const [participantCount, setParticipantCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const loadData = useCallback(async () => {
    const { data: sessionData } = await supabase
      .from('sessions')
      .select('id, title, teams(name), question_set_id, expires_at')
      .eq('id', sessionId)
      .maybeSingle()

    if (!sessionData) {
      setNotFound(true)
      setLoading(false)
      return
    }
    setSession(sessionData)

    const { data: questionData } = await supabase
      .from('questions')
      .select('*')
      .eq('question_set_id', sessionData.question_set_id)
      .order('order_num', { ascending: true })

    setQuestions((questionData as Question[]) || [])

    const { data: responseData } = await supabase
      .from('responses')
      .select('question_id, answer')
      .eq('session_id', sessionData.id)

    setResponses((responseData as ResponseRow[]) || [])

    const { count } = await supabase
      .from('participants')
      .select('*', { count: 'exact', head: true })
      .eq('session_id', sessionData.id)

    setParticipantCount(count || 0)
    setLastUpdated(new Date())
    setLoading(false)
  }, [sessionId])

  useEffect(() => {
    loadData()
    const interval = setInterval(loadData, 5000)
    return () => clearInterval(interval)
  }, [loadData])

  function getResponsesFor(questionId: string) {
    return responses.filter((r) => r.question_id === questionId).map((r) => r.answer)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50" dir="rtl">
        <p className="text-slate-400 text-sm">در حال بارگذاری داشبورد...</p>
      </div>
    )
  }

  if (notFound || !session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50" dir="rtl">
        <p className="text-red-600 text-sm">جلسه‌ای یافت نشد</p>
      </div>
    )
  }

  const isActive = new Date(session.expires_at).getTime() > Date.now()
  const structure = analyzeStructure(questions)

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10 sm:px-8" dir="rtl">
      <div className="max-w-5xl mx-auto" ref={contentRef}>
        <Link href="/reports" className="text-xs text-slate-400 hover:text-slate-600 mb-4 inline-block print:hidden">
          ← بازگشت به فهرست گزارش‌ها
        </Link>

        <div className="border-b border-slate-200 pb-6 mb-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium text-slate-400 tracking-wide mb-1 flex items-center gap-2">
                گزارش نظرسنجی زنده
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full border ${
                    isActive
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                      : 'bg-slate-50 text-slate-400 border-slate-200'
                  }`}
                >
                  {isActive ? 'فعال' : 'غیرفعال'}
                </span>
              </p>
              <h1 className="text-xl font-bold text-slate-900">{session.title}</h1>
              <p className="text-sm text-slate-500 mt-0.5">{session.teams?.name}</p>
            </div>

            <div className="flex items-center gap-6">
              <div className="text-center">
                <p className="text-2xl font-bold text-slate-900">{participantCount}</p>
                <p className="text-[11px] text-slate-400">شرکت‌کننده</p>
              </div>
              <div className="flex flex-col gap-1.5 print:hidden">
                <button
                  onClick={() => handlePrint()}
                  className="text-xs font-medium bg-slate-900 text-white px-3.5 py-1.5 rounded-md hover:bg-slate-800 transition"
                >
                  دانلود گزارش PDF
                </button>
                <button
                  onClick={loadData}
                  className="text-xs font-medium text-slate-500 hover:text-slate-900 transition"
                >
                  بروزرسانی دستی
                </button>
              </div>
            </div>
          </div>
          {lastUpdated && (
            <p className="text-[11px] text-slate-400 mt-3 print:hidden">
              آخرین بروزرسانی: {lastUpdated.toLocaleTimeString('fa-IR')}
            </p>
          )}
        </div>

        <SmartSummary questions={questions} getResponsesFor={getResponsesFor} />

        {structure.shortTermQs.length > 0 && (
          <section className="mt-8">
            <h2 className="text-sm font-bold text-slate-700 mb-3 break-after-avoid-page">
              چشم‌انداز کوتاه‌مدت (۲ هفته آینده)
            </h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {structure.shortTermQs.map((q) => (
                <QuestionCard key={q.id} question={q} rawAnswers={getResponsesFor(q.id)} />
              ))}
            </div>
          </section>
        )}

        {structure.longTermQs.length > 0 && (
          <section className="mt-8">
            <h2 className="text-sm font-bold text-slate-700 mb-3 break-after-avoid-page">
              چشم‌انداز بلندمدت (تا پایان سال ۱۴۰۵)
            </h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {structure.longTermQs.map((q) => (
                <QuestionCard key={q.id} question={q} rawAnswers={getResponsesFor(q.id)} />
              ))}
            </div>
          </section>
        )}

        {structure.otherQs.length > 0 && (
          <section className="mt-8">
            <h2 className="text-sm font-bold text-slate-700 mb-3 break-after-avoid-page">سایر سوالات</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {structure.otherQs.map((q) => (
                <QuestionCard key={q.id} question={q} rawAnswers={getResponsesFor(q.id)} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

function SmartSummary({
  questions,
  getResponsesFor,
}: {
  questions: Question[]
  getResponsesFor: (id: string) => any[]
}) {
  const structure = analyzeStructure(questions)
  const items: { label: string; value: string }[] = []

  const shortTermStrategyQ = structure.shortTermQs.find((q) => q.question_type === 'multi')
  if (shortTermStrategyQ) {
    const answers = getResponsesFor(shortTermStrategyQ.id) as string[][]
    if (answers.length > 0) {
      const counts: Record<string, number> = {}
      answers.forEach((arr) => arr.forEach((opt) => (counts[opt] = (counts[opt] || 0) + 1)))
      const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
      if (top) items.push({ label: 'استراتژی غالب کوتاه‌مدت (۲ هفته)', value: top[0] })
    }
  }

  if (structure.winnerQ) {
    const answers = getResponsesFor(structure.winnerQ.id) as string[]
    if (answers.length > 0) {
      const counts: Record<string, number> = {}
      answers.forEach((a) => (counts[a] = (counts[a] || 0) + 1))
      const winner = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
      const percent = Math.round((winner[1] / answers.length) * 100)
      items.push({ label: 'دارایی برنده از نظر کمیته (بلندمدت)', value: `${winner[0]} (${percent}٪)` })
    }
  }

  if (structure.longTermAllocationQ) {
    const answers = getResponsesFor(structure.longTermAllocationQ.id) as Record<string, number>[]
    if (answers.length > 0) {
      const avgData = (structure.longTermAllocationQ.options as string[]).map((label) => {
        const values = answers.map((a) => Number(a[label] || 0))
        const avg = values.reduce((a, b) => a + b, 0) / values.length
        return { label, avg: Math.round(avg) }
      })
      const top = avgData.sort((a, b) => b.avg - a.avg)[0]
      items.push({ label: 'تخصیص پیشنهادی غالب (بلندمدت)', value: `${top.label} — ${top.avg}٪` })
    }
  }

  if (structure.riskQ) {
    const answers = getResponsesFor(structure.riskQ.id) as string[][]
    if (answers.length > 0) {
      const counts: Record<string, number> = {}
      answers.forEach((arr) => arr.forEach((opt) => (counts[opt] = (counts[opt] || 0) + 1)))
      const topRisk = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
      if (topRisk) items.push({ label: 'مهم‌ترین ریسک شناسایی‌شده', value: topRisk[0] })
    }
  }

  if (items.length === 0) return null

  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden break-inside-avoid">
      <div className="px-5 py-3 border-b border-slate-100">
        <p className="text-xs font-bold text-slate-900">خلاصه‌ی جلسه</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x sm:divide-x-reverse divide-slate-100">
        {items.map((item, i) => (
          <div key={i} className="px-5 py-4">
            <p className="text-[11px] text-slate-400 mb-1">{item.label}</p>
            <p className="text-sm font-bold text-slate-900">{item.value}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function QuestionCard({ question, rawAnswers }: { question: Question; rawAnswers: any[] }) {
  const total = rawAnswers.length

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-5 break-inside-avoid">
      <div className="flex items-start justify-between gap-3 mb-4">
        <h3 className="text-sm font-semibold text-slate-800 leading-relaxed">
          {question.question_text}
        </h3>
        <span className="shrink-0 text-[11px] text-slate-400 bg-slate-50 border border-slate-100 rounded px-2 py-0.5">
          {total} پاسخ
        </span>
      </div>

      {total === 0 ? (
        <p className="text-xs text-slate-300 text-center py-12">هنوز پاسخی ثبت نشده</p>
      ) : question.question_type === 'single' ? (
        <SingleChart options={question.options} answers={rawAnswers} />
      ) : question.question_type === 'multi' ? (
        <MultiChart answers={rawAnswers} />
      ) : question.question_type === 'slider' ? (
        <SliderChart answers={rawAnswers} unit={question.options.unit} />
      ) : question.question_type === 'slider_group' ? (
        <SliderGroupChart options={question.options} answers={rawAnswers} />
      ) : question.question_type === 'allocation' ? (
        <AllocationChart options={question.options} answers={rawAnswers} />
      ) : null}
    </div>
  )
}

function SingleChart({ options, answers }: { options: string[]; answers: string[] }) {
  const data = options.map((opt) => ({
    name: opt,
    value: answers.filter((a) => a === opt).length,
  }))

  const maxItem = data.reduce((a, b) => (b.value > a.value ? b : a), data[0])
  const consensus = answers.length > 0 ? Math.round((maxItem.value / answers.length) * 100) : 0

  return (
    <div>
      <div className="flex items-center gap-5">
        <ResponsiveContainer width={130} height={130}>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={38}
              outerRadius={62}
              stroke="#fff"
              strokeWidth={2}
            >
              {data.map((entry, i) => (
                <Cell key={i} fill={getColor(entry.name, i)} />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>

        <div className="flex-1 space-y-2">
          {[...data]
            .sort((a, b) => b.value - a.value)
            .map((d, i) => {
              const pct = answers.length > 0 ? Math.round((d.value / answers.length) * 100) : 0
              return (
                <div key={d.name} className="flex items-center gap-2 text-xs">
                  <span
                    className="w-2.5 h-2.5 rounded-sm shrink-0"
                    style={{ backgroundColor: getColor(d.name, i) }}
                  />
                  <span className="text-slate-600 flex-1">{d.name}</span>
                  <span className="font-semibold text-slate-900">{pct}٪</span>
                </div>
              )
            })}
        </div>
      </div>
      <p className="text-[11px] text-slate-400 mt-4 pt-3 border-t border-slate-100">
        اجماع کمیته: <span className="font-semibold text-slate-700">{consensus}٪</span> روی «{maxItem.name}»
      </p>
    </div>
  )
}

function wrapText(text: string, maxCharsPerLine: number): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let current = ''
  words.forEach((word) => {
    if ((current + ' ' + word).trim().length > maxCharsPerLine) {
      if (current) lines.push(current.trim())
      current = word
    } else {
      current = (current + ' ' + word).trim()
    }
  })
  if (current) lines.push(current)
  return lines
}

function WrappedYAxisTick({ x, y, payload }: any) {
  const lines = wrapText(payload.value, 16)
  return (
    <g transform={`translate(${x},${y})`}>
      {lines.map((line, i) => (
        <text
          key={i}
          x={0}
          y={(i - (lines.length - 1) / 2) * 12}
          textAnchor="end"
          fill="#475569"
          fontSize={11}
        >
          {line}
        </text>
      ))}
    </g>
  )
}

function MultiChart({ answers }: { answers: string[][] }) {
  const counts: Record<string, number> = {}
  answers.forEach((arr) => {
    arr.forEach((opt) => {
      counts[opt] = (counts[opt] || 0) + 1
    })
  })
  const data = Object.entries(counts)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)

  return (
    <ResponsiveContainer width="100%" height={Math.max(200, data.length * 46)}>
      <BarChart data={data} layout="vertical" margin={{ left: 10, right: 20, top: 4, bottom: 4 }} barSize={16} barCategoryGap={8}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={{ stroke: '#e2e8f0' }} />
        <YAxis
          type="category"
          dataKey="name"
          width={130}
          tickMargin={8}
          tick={<WrappedYAxisTick />}
          interval={0}
          axisLine={{ stroke: '#e2e8f0' }}
          tickLine={false}
        />
        <Tooltip cursor={{ fill: '#f8fafc' }} />
        <Bar dataKey="value" fill="#475569" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

function SliderChart({ answers, unit }: { answers: number[]; unit: string }) {
  const sorted = [...answers].sort((a, b) => a - b)
  const avg = answers.reduce((a, b) => a + b, 0) / answers.length
  const min = sorted[0]
  const max = sorted[sorted.length - 1]

  const mid = Math.floor(sorted.length / 2)
  const median =
    sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2

  const variance =
    answers.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / answers.length
  const stdDev = Math.sqrt(variance)
  const cv = avg !== 0 ? Math.abs(stdDev / avg) : 0

  let consensusLabel = 'توافق بالا'
  let consensusColor = 'text-emerald-700 bg-emerald-50 border-emerald-100'
  if (cv > 0.5) {
    consensusLabel = 'پراکندگی نظرات'
    consensusColor = 'text-amber-700 bg-amber-50 border-amber-100'
  } else if (cv > 0.25) {
    consensusLabel = 'توافق متوسط'
    consensusColor = 'text-slate-600 bg-slate-50 border-slate-200'
  }

  const range = max - min || 1
  const padding = range * 0.15
  const axisMin = min - padding
  const axisMax = max + padding
  const toPercent = (val: number) => ((val - axisMin) / (axisMax - axisMin)) * 100

  return (
    <div dir="ltr">
      <div className="flex items-center justify-center gap-8 mb-5">
        <div className="text-center">
          <p className="text-2xl font-bold text-slate-900">
            {avg.toFixed(1)}
            <span className="text-base font-medium text-slate-400">{unit}</span>
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">میانگین</p>
        </div>
        <div className="w-px h-10 bg-slate-200" />
        <div className="text-center">
          <p className="text-2xl font-bold text-slate-900">
            {median.toFixed(1)}
            <span className="text-base font-medium text-slate-400">{unit}</span>
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">میانه</p>
        </div>
      </div>

      <div className="relative h-10 mt-4 mb-1 px-2">
        <div className="absolute top-1/2 right-2 left-2 h-px bg-slate-200" />
        <div
          className="absolute top-1 bottom-1 w-px bg-slate-400"
          style={{ left: `calc(${toPercent(median)}% * 0.96 + 8px)` }}
        />
        {answers.map((val, i) => (
          <div
            key={i}
            className="absolute top-1/2 w-3 h-3 rounded-full bg-slate-900 border-2 border-white shadow-sm"
            style={{
              left: `calc(${toPercent(val)}% * 0.96 + 8px)`,
              transform: 'translate(-50%, -50%)',
            }}
            title={`${val}${unit}`}
          />
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-slate-400 px-2 mb-4">
        <span>{axisMin.toFixed(0)}{unit}</span>
        <span>{axisMax.toFixed(0)}{unit}</span>
      </div>

      <div className="flex justify-center">
        <span className={`text-[11px] px-2.5 py-1 rounded border font-medium ${consensusColor}`}>
          {consensusLabel} · انحراف {stdDev.toFixed(1)}{unit}
        </span>
      </div>
    </div>
  )
}

function SliderGroupChart({
  options,
  answers,
}: {
  options: { unit: string; assets: SliderAsset[] }
  answers: Record<string, number>[]
}) {
  const data = options.assets
    .map((asset) => {
      const values = answers.map((a) => Number(a[asset.name] ?? 0))
      const avg = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0
      return { name: asset.name, value: Math.round(avg * 10) / 10 }
    })
    .sort((a, b) => b.value - a.value)

  const top = data[0]

  return (
    <div>
      <ResponsiveContainer width="100%" height={Math.max(180, data.length * 44)}>
        <BarChart data={data} layout="vertical" margin={{ left: 10, right: 30, top: 4, bottom: 4 }} barSize={18} barCategoryGap={10}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
          <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={{ stroke: '#e2e8f0' }} />
          <YAxis
            type="category"
            dataKey="name"
            width={130}
            tickMargin={8}
            tick={{ fontSize: 12, fill: '#475569' }}
            interval={0}
            axisLine={{ stroke: '#e2e8f0' }}
            tickLine={false}
          />
          <Tooltip cursor={{ fill: '#f8fafc' }} formatter={(v: number) => `${v}${options.unit}`} />
          <Bar dataKey="value" radius={[0, 4, 4, 0]}>
            {data.map((entry, i) => (
              <Cell key={i} fill={getColor(entry.name, i)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      {top && (
        <p className="text-[11px] text-slate-400 mt-2 pt-3 border-t border-slate-100">
          بالاترین بازده مورد انتظار: <span className="font-semibold text-slate-700">{top.value}{options.unit}</span> برای «{top.name}»
        </p>
      )}
    </div>
  )
}

function AllocationChart({ options, answers }: { options: string[]; answers: Record<string, number>[] }) {
  const avgData = options.map((label, i) => {
    const values = answers.map((a) => Number(a[label] || 0))
    const avg = values.reduce((a, b) => a + b, 0) / values.length
    return { name: label, value: Math.round(avg), color: getColor(label, i) }
  })

  return (
    <div>
      <div className="flex items-center gap-5">
        <ResponsiveContainer width={130} height={130}>
          <PieChart>
            <Pie
              data={avgData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={38}
              outerRadius={62}
              stroke="#fff"
              strokeWidth={2}
            >
              {avgData.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
        <div className="flex-1 space-y-2">
          {avgData.map((d) => (
            <div key={d.name} className="flex items-center gap-2 text-xs">
              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: d.color }} />
              <span className="text-slate-600 flex-1">{d.name}</span>
              <span className="font-semibold text-slate-900">{d.value}٪</span>
            </div>
          ))}
        </div>
      </div>
      <p className="text-[11px] text-slate-400 mt-4 pt-3 border-t border-slate-100">
        میانگین تخصیص پیشنهادی کمیته
      </p>
    </div>
  )
}