'use client'

import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button' // Replace if needed
import { Send, Loader2, MapPin, Ruler, Settings, Bot } from 'lucide-react' // npm i lucide-react

export default function AIPlanChecker() {
  type MessageRole = 'system' | 'user' | 'assistant'
  const [messages, setMessages] = useState<{ role: MessageRole; content: string }[]>([
    { role: 'system', content: `You are GeoNova Field Assistant, expert surveyor AI. Help with:
- Field mission planning
- Equipment recommendations  
- Workflow guidance
- Survey calculations
- Troubleshooting
Use professional surveying terminology. Be concise, actionable.` }, 
    { role: 'user', content: 'Hi, help me plan a boundary survey.' }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(scrollToBottom, [messages])

  const handleSend = async () => {
    if (!input.trim() || loading) return

    const userMessage = { role: 'user' as const, content: input }
    setMessages(prev => [...prev, userMessage])
    setInput('')
    setLoading(true)

    try {
      // Try OpenAI first (for production), then fallback to Ollama (local)
      let response = await fetch('/api/openai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMessage],
          model: 'gpt-4o-mini',
          stream: true
        }),
      })

      // Fallback to Ollama if OpenAI fails
      if (!response.ok) {
        response = await fetch('/api/ollama/chat/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [...messages, userMessage],
            model: 'llama3.1',
            stream: true
          }),
        })
      }

      if (!response.ok) throw new Error('AI unavailable')

      const reader = response.body!.getReader()
      const decoder = new TextDecoder()
      let assistantMessage = { role: 'assistant' as const, content: '' }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        const lines = chunk.split('\n').filter(line => line.startsWith('data: '))
        for (const line of lines) {
          try {
            const data = JSON.parse(line.slice(6))
            if (data.message?.content) {
              assistantMessage.content += data.message.content
              setMessages(prev => {
                const updated = [...prev]
                updated[updated.length - 1] = assistantMessage
                return updated
              })
            }
          } catch {}
        }
      }
      setMessages(prev => [...prev, assistantMessage])
    } catch (error) {
      setMessages(prev => [...prev, { role: 'assistant' as const, content: 'Error: Ensure Ollama running (ollama serve). Model: llama3.1' }])
    } finally {
      setLoading(false)
      scrollToBottom()
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col max-w-4xl mx-auto p-4">
      <div className="flex items-center gap-3 mb-8">
        <Bot className="h-8 w-8 text-[#E8841A]" />
        <h1 className="text-3xl font-bold text-gray-100">GeoNova AI Field Assistant</h1>
      </div>

      <div className="flex gap-2 mb-6 text-xs text-gray-500">
        <button className="p-2 hover:text-gray-300 flex items-center gap-1">
          <MapPin className="h-4 w-4" /> Plan mission
        </button>
        <button className="p-2 hover:text-gray-300 flex items-center gap-1">
          <Ruler className="h-4 w-4" /> Workflow
        </button>
        <button className="p-2 hover:text-gray-300 flex items-center gap-1">
          <Settings className="h-4 w-4" /> Equipment
        </button>
      </div>

      <div className="flex-1 bg-gray-900/50 rounded-2xl border border-gray-800 p-6 overflow-auto mb-6 space-y-4">
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-2xl p-4 rounded-2xl ${msg.role === 'user' ? 'bg-[#E8841A] text-black' : 'bg-gray-800 text-gray-100'}`}>
              {msg.content}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Ask about survey planning, equipment, workflows..."
          className="flex-1 px-4 py-4 bg-gray-900 border border-gray-700 rounded-2xl focus:border-[#E8841A] focus:outline-none text-gray-100 placeholder-gray-500"
          disabled={loading}
        />
        <Button onClick={handleSend} disabled={loading || !input.trim()} size="icon" className="h-16 w-16 rounded-2xl bg-[#E8841A] hover:bg-[#E8841A]/90">
          {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : <Send className="h-6 w-6" />}
        </Button>
      </div>
    </div>
  )
}

