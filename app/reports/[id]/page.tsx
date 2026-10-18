'use client'

import { useReactToPrint } from 'react-to-print'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '../../lib/supabase'
import { getOptionColor, getOrdinalLevels, ORDINAL_RAMP, textOn } from '../../lib/chartColors'
import { fa, fa1, round1, fmtPct } from '../../lib/format'
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
  max_select?: number | null
}

type ResponseRow = {
  question_id: string
  answer: any
  participant_id?: string | null
}

// رنگ همه‌ی نمودارها فقط از یک منبع می‌آید (app/lib/chartColors.ts)؛ جزئیات قانون آنجاست.
const getColor = getOptionColor

// قالب اعداد (ارقام فارسی، درصد با یک رقم اعشار) از app/lib/format.ts می‌آید تا همه‌ی گزارش یکدست باشد.

// پاسخ‌های نامعتبر (null، نوع اشتباه) نباید گزارش را از کار بیندازند یا شمرده شوند.
function isValidAnswer(type: Question['question_type'], a: any): boolean {
  if (a === null || a === undefined) return false
  if (type === 'single') return typeof a === 'string'
  if (type === 'multi') return Array.isArray(a)
  if (type === 'slider') return typeof a === 'number' && Number.isFinite(a)
  return typeof a === 'object' && !Array.isArray(a) // slider_group, allocation
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
  // joinedCount = کسانی که وارد جلسه شده‌اند؛ تعداد «شرکت‌کننده» در گزارش = کسانی که واقعاً پاسخ داده‌اند (از روی خود پاسخ‌ها محاسبه می‌شود)
  const [joinedCount, setJoinedCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  // خطا در دریافت اطلاعات نباید بی‌صدا بماند: اگر دریافت شکست بخورد، نمودارها آخرین داده‌ی سالم را نگه می‌دارند
  // ولی یک نوار هشدار نشان داده می‌شود تا کسی داده‌ی قدیمی را «نتیجه‌ی نهایی» تصور نکند.
  const [fetchError, setFetchError] = useState(false)
  const inFlight = useRef(false)

  const loadData = useCallback(async () => {
    if (inFlight.current) return // اگر دریافت قبلی هنوز تمام نشده، دومی شروع نمی‌شود (جلوگیری از رونویسی داده‌ی جدید با قدیمی)
    inFlight.current = true
    try {
      const { data: sessionData, error: sessionError } = await supabase
        .from('sessions')
        .select('id, title, teams(name), question_set_id, expires_at, expected_participants')
        .eq('id', sessionId)
        .maybeSingle()
      if (sessionError) throw sessionError

      if (!sessionData) {
        setNotFound(true)
        setLoading(false)
        setFetchError(false)
        return
      }

      const { data: questionData, error: questionError } = await supabase
        .from('questions')
        .select('*')
        .eq('question_set_id', sessionData.question_set_id)
        .order('order_num', { ascending: true })
      if (questionError) throw questionError

      // هر درخواست Supabase حداکثر ۱۰۰۰ ردیف برمی‌گرداند؛ پاسخ‌ها را صفحه‌صفحه می‌خوانیم تا در جلسه‌های بزرگ چیزی جا نیفتد.
      const PAGE = 1000
      const allRows: ResponseRow[] = []
      for (let from = 0; ; from += PAGE) {
        const { data: chunk, error: responseError } = await supabase
          .from('responses')
          .select('question_id, answer, participant_id')
          .eq('session_id', sessionData.id)
          .order('id', { ascending: true })
          .range(from, from + PAGE - 1)
        if (responseError) throw responseError
        const rows = (chunk as ResponseRow[]) || []
        allRows.push(...rows)
        if (rows.length < PAGE) break
      }

      const { count, error: countError } = await supabase
        .from('participants')
        .select('*', { count: 'exact', head: true })
        .eq('session_id', sessionData.id)
      if (countError) throw countError

      // اگر یک شرکت‌کننده به هر دلیل برای یک سوال بیش از یک پاسخ ثبت کرده باشد، فقط یکی شمرده می‌شود.
      const seen = new Set<string>()
      const uniqueResponses = allRows.filter((r) => {
        if (!r.participant_id) return true
        const key = `${r.participant_id}:${r.question_id}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })

      // همه‌ی داده‌ها فقط وقتی با هم ثبت می‌شوند که هر چهار دریافت موفق بوده باشند (حالت نیمه‌به‌روز نداریم)
      setSession(sessionData)
      setQuestions((questionData as Question[]) || [])
      // فقط وقتی داده واقعاً عوض شده state را عوض می‌کنیم تا نمودارها بی‌دلیل دوباره رسم نشوند
      setResponses((prev) =>
        JSON.stringify(prev) === JSON.stringify(uniqueResponses) ? prev : uniqueResponses
      )
      setJoinedCount(count || 0)
      setLastUpdated(new Date())
      setFetchError(false)
      setLoading(false)
    } catch {
      setFetchError(true)
      setLoading(false)
    } finally {
      inFlight.current = false
    }
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

  if (!session && fetchError && !notFound) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-slate-50 px-4" dir="rtl">
        <p className="text-red-600 text-sm">دریافت اطلاعات گزارش ممکن نشد. اتصال اینترنت را بررسی کنید؛ تلاش مجدد به‌صورت خودکار ادامه دارد.</p>
        <button onClick={loadData} className="text-xs font-medium bg-slate-900 text-white px-3.5 py-1.5 rounded-md hover:bg-slate-800 transition">
          تلاش مجدد
        </button>
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
  const answeredCount = countRespondents(questions, responses)
  const expected: number | null = session.expected_participants || null
  const joinedNoAnswer = Math.max(0, joinedCount - answeredCount)

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10 sm:px-8" dir="rtl">
      <div className="max-w-5xl mx-auto" ref={contentRef}>
        <Link href="/reports" className="text-xs text-slate-400 hover:text-slate-600 mb-4 inline-block print:hidden">
          ← بازگشت به فهرست گزارش‌ها
        </Link>

        {fetchError && (
          <div role="alert" className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800 print:hidden">
            ارتباط با سرور برقرار نیست؛ اعداد زیر ممکن است قدیمی باشند
            {lastUpdated ? ` (آخرین داده‌ی سالم: ${lastUpdated.toLocaleTimeString('fa-IR')})` : ''}. تلاش مجدد خودکار ادامه دارد.
          </div>
        )}

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
                <p className="text-2xl font-bold text-slate-900 tabular-nums">{fa(answeredCount)}</p>
                <p className="text-[11px] text-slate-400">شرکت‌کننده (پاسخ‌دهنده)</p>
                {(expected || joinedNoAnswer > 0) && (
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {expected ? `از ${fa(expected)} نفر مورد انتظار` : ''}
                    {expected && joinedNoAnswer > 0 ? ' · ' : ''}
                    {joinedNoAnswer > 0 ? `${fa(joinedNoAnswer)} نفر وارد شده‌اند و هنوز پاسخ نداده‌اند` : ''}
                  </p>
                )}
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
              چشم‌انداز کوتاه‌مدت
            </h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
              {structure.shortTermQs.map((q) => (
                <QuestionCard key={q.id} question={q} rawAnswers={getResponsesFor(q.id)} />
              ))}
            </div>
          </section>
        )}

        {structure.longTermQs.length > 0 && (
          <section className="mt-8">
            <h2 className="text-sm font-bold text-slate-700 mb-3 break-after-avoid-page">
              چشم‌انداز بلندمدت
            </h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
              {structure.longTermQs.map((q) => (
                <QuestionCard key={q.id} question={q} rawAnswers={getResponsesFor(q.id)} />
              ))}
            </div>
          </section>
        )}

        {structure.otherQs.length > 0 && (
          <section className="mt-8">
            <h2 className="text-sm font-bold text-slate-700 mb-3 break-after-avoid-page">سایر سوالات</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
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

// تعداد افرادی که واقعاً حداقل یک پاسخ معتبر ثبت کرده‌اند (نه فقط وارد جلسه شده‌اند).
// پاسخ‌های قدیمی بدون participant_id قابل ردیابی نیستند؛ برای آن‌ها بیشترین تعداد پاسخ در یک سوال ملاک است.
function countRespondents(questions: Question[], responses: ResponseRow[]): number {
  const typeOf = new Map(questions.map((q) => [q.id, q.question_type] as const))
  const ids = new Set<string>()
  const anonPerQuestion: Record<string, number> = {}
  responses.forEach((r) => {
    const type = typeOf.get(r.question_id)
    if (!type || !isValidAnswer(type, r.answer)) return
    if (r.participant_id) ids.add(r.participant_id)
    else anonPerQuestion[r.question_id] = (anonPerQuestion[r.question_id] || 0) + 1
  })
  const anonMax = Math.max(0, ...Object.values(anonPerQuestion))
  return ids.size + anonMax
}

// همه‌ی گزینه‌هایی که بیشترین مقدار را دارند (در تساوی، همه برمی‌گردند، نه فقط اولی)
function topOf<T extends { count: number }>(entries: T[]): T[] {
  if (entries.length === 0) return []
  const max = Math.max(...entries.map((e) => e.count))
  return entries.filter((e) => e.count === max)
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

  const countMulti = (answers: any[]) => {
    const counts: Record<string, number> = {}
    answers.filter(Array.isArray).forEach((arr: string[]) => arr.forEach((opt) => (counts[opt] = (counts[opt] || 0) + 1)))
    return Object.entries(counts).map(([name, count]) => ({ name, count }))
  }
  const joinNames = (tops: { name: string }[]) => tops.map((t) => t.name).join(' / ') + (tops.length > 1 ? ' (رای برابر)' : '')

  const shortTermStrategyQ = structure.shortTermQs.find((q) => q.question_type === 'multi')
  if (shortTermStrategyQ) {
    const tops = topOf(countMulti(getResponsesFor(shortTermStrategyQ.id)))
    if (tops.length > 0) items.push({ label: 'استراتژی غالب کوتاه‌مدت', value: joinNames(tops) })
  }

  if (structure.winnerQ) {
    const answers = getResponsesFor(structure.winnerQ.id).filter((a) => typeof a === 'string') as string[]
    if (answers.length > 0) {
      const counts: Record<string, number> = {}
      answers.forEach((a) => (counts[a] = (counts[a] || 0) + 1))
      const tops = topOf(Object.entries(counts).map(([name, count]) => ({ name, count })))
      const percent = fmtPct((tops[0].count / answers.length) * 100)
      items.push({
        label: 'دارایی برنده از نظر کمیته (بلندمدت)',
        value: tops.length > 1 ? `${joinNames(tops)} — هر کدام ${percent}` : `${tops[0].name} (${percent})`,
      })
    }
  }

  if (structure.longTermAllocationQ) {
    const answers = getResponsesFor(structure.longTermAllocationQ.id).filter(
      (a) => a && typeof a === 'object'
    ) as Record<string, number>[]
    if (answers.length > 0) {
      const avgData = (structure.longTermAllocationQ.options as string[]).map((label) => {
        const avg = answers.reduce((sum, a) => sum + Number(a[label] || 0), 0) / answers.length
        return { name: label, count: round1(avg) }
      })
      const tops = topOf(avgData)
      items.push({
        label: 'تخصیص پیشنهادی غالب (بلندمدت)',
        value: tops.length > 1 ? `${joinNames(tops)} — هر کدام ${fmtPct(tops[0].count)}` : `${tops[0].name} — ${fmtPct(tops[0].count)}`,
      })
    }
  }

  if (structure.riskQ) {
    const tops = topOf(countMulti(getResponsesFor(structure.riskQ.id)))
    if (tops.length > 0) items.push({ label: 'مهم‌ترین ریسک شناسایی‌شده', value: joinNames(tops) })
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

function QuestionCard({ question, rawAnswers: allAnswers }: { question: Question; rawAnswers: any[] }) {
  const rawAnswers = allAnswers.filter((a) => isValidAnswer(question.question_type, a))
  const total = rawAnswers.length

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-5 break-inside-avoid">
      <div className="flex items-start justify-between gap-3 mb-4">
        <h3 className="text-sm font-semibold text-slate-800 leading-relaxed">
          {question.question_text}
        </h3>
        <span className="shrink-0 text-[11px] text-slate-400 bg-slate-50 border border-slate-100 rounded px-2 py-0.5">
          {fa(total)} پاسخ
        </span>
      </div>

      {total === 0 ? (
        <p className="text-xs text-slate-300 text-center py-12">هنوز پاسخی ثبت نشده</p>
      ) : question.question_type === 'single' ? (
        <SingleChart options={question.options} answers={rawAnswers} />
      ) : question.question_type === 'multi' ? (
        <MultiChart options={Array.isArray(question.options) ? question.options : []} maxSelect={question.max_select ?? null} answers={rawAnswers} />
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
  // رنگ هر گزینه فقط به «هویت» آن بستگی دارد و همان رنگ برای برش، راهنما و tooltip استفاده می‌شود.
  // سوال‌های ترتیبی (مثل سطح ریسک): رنگ = طیف روشن←تیره و ترتیب نمایش = ترتیب طبیعی (از کم به زیاد).
  // سایر سوال‌ها: ترتیب از بیشترین به کمترین رای (در تساوی، ترتیب اصلی گزینه‌ها).
  const levels = getOrdinalLevels(options)
  const total = answers.length
  let data = options.map((opt, i) => ({
    name: opt,
    value: answers.filter((a) => a === opt).length,
    color: levels ? ORDINAL_RAMP[levels[i]] : getColor(opt, i),
    level: levels ? levels[i] : 0,
  }))
  data = levels ? data.sort((a, b) => a.level - b.level) : data.sort((a, b) => b.value - a.value)

  const percentOf = (value: number) => (total > 0 ? round1((value / total) * 100) : 0)
  const maxValue = Math.max(...data.map((d) => d.value))
  // اگر چند گزینه رای برابر و بیشینه دارند، همه‌شان گزارش می‌شوند (نه فقط اولی)
  const topItems = data.filter((d) => d.value === maxValue)
  const isTie = topItems.length > 1
  const consensus = percentOf(maxValue)
  const pctTotal = data.reduce((sum, d) => sum + percentOf(d.value), 0)

  return (
    <div>
      <div className="flex items-center gap-5">
        <ResponsiveContainer width={160} height={160}>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              startAngle={90}
              endAngle={-270}
              innerRadius={38}
              outerRadius={76}
              stroke="#fff"
              strokeWidth={2}
              isAnimationActive={false}
              labelLine={false}
              label={(props: any) => {
                // درصد روی خود برش (برای برش‌های به‌اندازه‌ی کافی بزرگ)، تا اندازه‌ها بدون نگاه به راهنما قابل مقایسه باشند
                const { cx, cy, midAngle, innerRadius, outerRadius, value, payload } = props
                const pct = percentOf(Number(value))
                if (pct < 10) return null
                const r = (Number(innerRadius) + Number(outerRadius)) / 2
                const rad = (Math.PI / 180) * -Number(midAngle)
                return (
                  <text x={cx + r * Math.cos(rad)} y={cy + r * Math.sin(rad)} fill={textOn(payload?.color || '#000000')} fontSize={10} fontWeight={700} textAnchor="middle" dominantBaseline="central">
                    {fmtPct(pct)}
                  </text>
                )
              }}
            >
              {data.map((entry) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: any, name: any) => [`${fa(Number(value))} نفر (${fmtPct(percentOf(Number(value)))})`, name]}
            />
          </PieChart>
        </ResponsiveContainer>

        <div className="flex-1 space-y-2">
          {data.map((d) => (
            <div key={d.name} className="flex items-center gap-2 text-xs">
              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: d.color }} />
              <span className="text-slate-600 flex-1">{d.name}</span>
              <span className="text-slate-400 tabular-nums">{fa(d.value)} نفر</span>
              <span className="font-semibold text-slate-900 w-12 text-left tabular-nums">{fmtPct(percentOf(d.value))}</span>
            </div>
          ))}
        </div>
      </div>
      <p className="text-[11px] text-slate-400 mt-4 pt-3 border-t border-slate-100">
        {isTie ? (
          <>
            رای برابر: <span className="font-semibold text-slate-700">{fmtPct(consensus)}</span> برای هر یک از{' '}
            {topItems.map((t) => `«${t.name}»`).join(' و ')}
          </>
        ) : (
          <>
            بیشترین رای: <span className="font-semibold text-slate-700">{fmtPct(consensus)}</span> برای «{topItems[0].name}»
          </>
        )}
        {Math.abs(pctTotal - 100) > 0.05 && (
          <span className="block mt-1">
            جمع درصدها به‌دلیل گرد کردن به یک رقم اعشار، {fmtPct(pctTotal)} شده است.
          </span>
        )}
      </p>
    </div>
  )
}

function MultiChart({
  options,
  maxSelect,
  answers,
}: {
  options: string[]
  maxSelect: number | null
  answers: string[][]
}) {
  // مبنا = تعداد پاسخ‌دهنده‌ها (نه تعداد کل انتخاب‌ها)، پس هر نوار یعنی «چند درصد از افراد این گزینه را انتخاب کرده‌اند».
  // محور از ۰ تا ۱۰۰٪ ثابت است تا طول نوارها مستقیم با تعداد شرکت‌کنندگان قابل مقایسه باشد.
  // گزینه‌های بدون رای هم مثل نمودار تک‌انتخابی نمایش داده می‌شوند (۰ نفر).
  const respondents = answers.length
  const counts: Record<string, number> = {}
  answers.forEach((arr) => {
    new Set(arr.filter((o) => typeof o === 'string')).forEach((opt) => {
      counts[opt] = (counts[opt] || 0) + 1
    })
  })
  // گزینه‌ای که در پاسخ‌های قدیمی هست ولی دیگر در فهرست گزینه‌ها نیست هم از قلم نیفتد
  const names = [...options, ...Object.keys(counts).filter((k) => !options.includes(k))]
  const data = names
    .map((name, i) => {
      const value = counts[name] || 0
      return { name, value, pct: respondents > 0 ? round1((value / respondents) * 100) : 0, order: i }
    })
    .sort((a, b) => b.value - a.value || a.order - b.order)

  const maxValue = Math.max(...data.map((d) => d.value))
  const topItems = maxValue > 0 ? data.filter((d) => d.value === maxValue) : []
  const isTie = topItems.length > 1
  const ticks = [0, 25, 50, 75, 100]
  const keepColors = { printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' } as React.CSSProperties

  return (
    <div>
      <div className="space-y-3">
        {data.map((d) => (
          <div key={d.name} title={`${fa(d.value)} نفر (${fmtPct(d.pct)})`}>
            <div className="flex items-baseline justify-between gap-3 mb-1">
              <span className="text-xs text-slate-700 leading-snug">{d.name}</span>
              <span className="shrink-0 text-[11px] text-slate-500 tabular-nums">
                {fa(d.value)} نفر · <span className="font-semibold text-slate-800">{fmtPct(d.pct)}</span>
              </span>
            </div>
            <div dir="ltr" className="relative h-3 rounded-sm bg-slate-100" style={keepColors}>
              {ticks.slice(1, -1).map((t) => (
                <span key={t} className="absolute top-0 bottom-0 w-px bg-white" style={{ left: `${t}%`, ...keepColors }} />
              ))}
              <div
                className="absolute top-0 bottom-0 left-0 rounded-sm bg-slate-600"
                style={{ width: `${Math.min(100, d.pct)}%`, ...keepColors }}
              />
            </div>
          </div>
        ))}
      </div>
      <div dir="ltr" className="relative h-4 mt-1.5 mx-1 text-[10px] text-slate-400 tabular-nums">
        {ticks.map((t) => (
          <span
            key={t}
            className="absolute top-0"
            dir="rtl"
            style={{ left: `${t}%`, transform: t === 0 ? 'none' : t === 100 ? 'translateX(-100%)' : 'translateX(-50%)' }}
          >
            {`${fa(t)}٪`}
          </span>
        ))}
      </div>
      <p className="text-[11px] text-slate-400 mt-3 pt-3 border-t border-slate-100">
        {topItems.length > 0 && (
          <>
            {isTie ? 'رای برابر' : 'بیشترین انتخاب'}: <span className="font-semibold text-slate-700">{fmtPct(topItems[0].pct)}</span> از {fa(respondents)} پاسخ‌دهنده برای{' '}
            {topItems.map((t) => `«${t.name}»`).join(' و ')}
          </>
        )}
        <span className="block mt-1">
          درصدها از تعداد پاسخ‌دهندگان محاسبه شده‌اند؛ هر نفر {maxSelect ? `تا ${fa(maxSelect)} گزینه` : 'چند گزینه'} می‌توانست انتخاب کند، پس جمع درصدها از ۱۰۰٪ بیشتر می‌شود.
        </span>
      </p>
    </div>
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
            {fa1(avg)}
            <span className="text-base font-medium text-slate-400">{unit}</span>
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">میانگین</p>
        </div>
        <div className="w-px h-10 bg-slate-200" />
        <div className="text-center">
          <p className="text-2xl font-bold text-slate-900">
            {fa1(median)}
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
            title={`${fa(val)}${unit}`}
          />
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-slate-400 px-2 mb-4">
        <span>{fa(Math.round(axisMin))}{unit}</span>
        <span>{fa(Math.round(axisMax))}{unit}</span>
      </div>

      <div className="flex justify-center">
        <span className={`text-[11px] px-2.5 py-1 rounded border font-medium ${consensusColor}`}>
          {consensusLabel} · انحراف {fa1(stdDev)}{unit}
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
    .map((asset, i) => {
      const values = answers.map((a) => Number(a[asset.name] ?? asset.min ?? 0))
      const avg = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0
      // رنگ بر اساس جایگاه اصلی دارایی (قبل از مرتب‌سازی) تا با تغییر رتبه جابه‌جا نشود
      return { name: asset.name, value: Math.round(avg * 10) / 10, color: getColor(asset.name, i) }
    })
    .sort((a, b) => b.value - a.value)

  const top = data[0]

  return (
    <div>
      <div dir="ltr">
        <ResponsiveContainer width="100%" height={Math.max(180, data.length * 44)}>
          <BarChart data={data} layout="vertical" margin={{ left: 10, right: 30, top: 4, bottom: 4 }} barSize={18} barCategoryGap={10}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
            <XAxis type="number" tickFormatter={(v: any) => fa(Number(v))} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={{ stroke: '#e2e8f0' }} />
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
            <Tooltip cursor={{ fill: '#f8fafc' }} formatter={(v: any) => `${fa(Number(v))}${options.unit}`} />
            <Bar dataKey="value" radius={[0, 4, 4, 0]} isAnimationActive={false}>
              {data.map((entry) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {top && (
        <p className="text-[11px] text-slate-400 mt-2 pt-3 border-t border-slate-100">
          بالاترین بازده مورد انتظار: <span className="font-semibold text-slate-700">{fa(top.value)}{options.unit}</span> برای «{top.name}»
        </p>
      )}
    </div>
  )
}

function AllocationChart({ options, answers }: { options: string[]; answers: Record<string, number>[] }) {
  // رنگ بر اساس جایگاه اصلی گزینه (قبل از مرتب‌سازی)؛ سپس از بیشترین به کمترین درصد مرتب می‌شود
  // تا ترتیب راهنما و برش‌های نمودار با درصدها هماهنگ باشد (مرتب‌سازی پایدار: در تساوی، ترتیب اصلی حفظ می‌شود).
  const avgData = options
    .map((label, i) => {
      const values = answers.map((a) => Number(a[label] || 0))
      const avg = values.reduce((a, b) => a + b, 0) / values.length
      return { name: label, value: round1(avg), color: getColor(label, i) }
    })
    .sort((a, b) => b.value - a.value)
  const allocTotal = avgData.reduce((sum, d) => sum + d.value, 0)

  return (
    <div>
      <div className="flex items-center gap-5">
        <ResponsiveContainer width={160} height={160}>
          <PieChart>
            <Pie
              data={avgData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              startAngle={90}
              endAngle={-270}
              innerRadius={38}
              outerRadius={76}
              stroke="#fff"
              strokeWidth={2}
              isAnimationActive={false}
            >
              {avgData.map((entry) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip formatter={(value: any, name: any) => [fmtPct(Number(value)), name]} />
          </PieChart>
        </ResponsiveContainer>
        <div className="flex-1 space-y-2">
          {avgData.map((d) => (
            <div key={d.name} className="flex items-center gap-2 text-xs">
              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: d.color }} />
              <span className="text-slate-600 flex-1">{d.name}</span>
              <span className="font-semibold text-slate-900 tabular-nums">{fmtPct(d.value)}</span>
            </div>
          ))}
        </div>
      </div>
      <p className="text-[11px] text-slate-400 mt-4 pt-3 border-t border-slate-100">
        میانگین تخصیص پیشنهادی کمیته
        {Math.abs(allocTotal - 100) > 0.05 && (
          <span className="block mt-1">
            جمع درصدها به‌دلیل گرد کردن به یک رقم اعشار، {fmtPct(allocTotal)} شده است.
          </span>
        )}
      </p>
    </div>
  )
}