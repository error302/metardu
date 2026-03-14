'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type FeedbackType = 'bug' | 'feature' | 'general'

export default function FeedbackWidget() {
  const [isOpen, setIsOpen] = useState(false)
  const [type, setType] = useState<FeedbackType>('general')
  const [message, setMessage] = useState('')
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!message.trim()) return

    setLoading(true)

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      await supabase.from('feedback').insert({
        type,
        message,
        email: email || null,
        page_url: window.location.href,
        user_id: user?.id || null,
      })

      setSubmitted(true)
      setTimeout(() => {
        setIsOpen(false)
        setSubmitted(false)
        setMessage('')
        setEmail('')
      }, 2000)
    } catch (error) {
      console.error('Feedback error:', error)
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 bg-amber-500 text-black px-4 py-2 rounded-full shadow-lg text-sm font-bold z-40 hover:bg-amber-400 transition-colors"
      >
        💬 Feedback
      </button>
    )
  }

  return (
    <div className="fixed bottom-6 right-6 bg-[#111] border border-[#222] rounded-xl shadow-2xl w-80 z-50 overflow-hidden">
      <div className="bg-[#E8841A] px-4 py-3 flex justify-between items-center">
        <h3 className="text-black font-bold">Feedback</h3>
        <button onClick={() => setIsOpen(false)} className="text-black hover:text-gray-700">
          ✕
        </button>
      </div>

      <div className="p-4">
        {submitted ? (
          <div className="text-center py-6">
            <div className="text-4xl mb-2">✓</div>
            <p className="text-green-500 font-medium">Thank you!</p>
            <p className="text-gray-400 text-sm">Your feedback has been submitted.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex gap-2">
              {(['bug', 'feature', 'general'] as FeedbackType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`flex-1 py-2 rounded text-xs font-medium capitalize transition-colors ${
                    type === t
                      ? 'bg-[#E8841A] text-black'
                      : 'bg-[#1e293b] text-gray-400 hover:text-white'
                  }`}
                >
                  {t === 'bug' ? '🐛 Bug' : t === 'feature' ? '💡 Feature' : '💬 General'}
                </button>
              ))}
            </div>

            <div>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="How can we improve GeoNova?"
                rows={3}
                className="w-full bg-[#0a0a0f] border border-[#222] rounded-lg px-3 py-2 text-white text-sm resize-none"
                required
              />
            </div>

            <div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email (optional)"
                className="w-full bg-[#0a0a0f] border border-[#222] rounded-lg px-3 py-2 text-white text-sm"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !message.trim()}
              className="w-full py-2 bg-[#E8841A] text-black font-bold rounded hover:bg-[#d47619] disabled:opacity-50 transition-colors"
            >
              {loading ? 'Sending...' : 'Submit'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
