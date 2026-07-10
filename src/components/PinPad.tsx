import { useState } from 'react'
import { Delete } from 'lucide-react'

interface Props {
  onSubmit: (pin: string) => Promise<'ok' | 'wrong_pin'>
  title: string
  subtitle?: string
}

export function PinPad({ onSubmit, title, subtitle }: Props) {
  const [digits, setDigits] = useState<string[]>([])
  const [shaking, setShaking] = useState(false)
  const [busy, setBusy] = useState(false)

  const addDigit = async (d: string) => {
    if (busy || shaking) return
    const next = [...digits, d]
    setDigits(next)

    if (next.length < 4) return

    // 4 digits entered — submit
    setBusy(true)
    const result = await onSubmit(next.join(''))

    if (result === 'wrong_pin') {
      setShaking(true)
      setTimeout(() => {
        setShaking(false)
        setDigits([])
        setBusy(false)
      }, 500)
    }
    // on 'ok' — parent state change will unmount this component, no cleanup needed
  }

  const backspace = () => {
    if (busy || shaking) return
    setDigits(d => d.slice(0, -1))
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6"
      style={{ background: 'linear-gradient(135deg, #0d1f3a 0%, #081428 100%)' }}
    >
      <div className="mb-8 text-center">
        <div className="text-5xl mb-3">⏱</div>
        <h1 className="text-white text-2xl font-bold">{title}</h1>
        {subtitle && <p className="text-blue-300 text-sm mt-1">{subtitle}</p>}
      </div>

      {/* PIN dots */}
      <div className={`flex gap-5 mb-10 ${shaking ? 'shake' : ''}`}>
        {[0, 1, 2, 3].map(i => (
          <div
            key={i}
            className={`w-5 h-5 rounded-full border-2 transition-all duration-150 ${
              i < digits.length
                ? 'bg-green-400 border-green-400 scale-125'
                : 'bg-transparent border-blue-400'
            }`}
          />
        ))}
      </div>

      {/* Keypad */}
      <div className="grid grid-cols-3 gap-4 w-full max-w-xs">
        {['1','2','3','4','5','6','7','8','9'].map(n => (
          <button
            key={n}
            onClick={() => addDigit(n)}
            disabled={busy}
            className="h-16 rounded-2xl text-white text-2xl font-semibold active:scale-95 transition-transform disabled:opacity-60"
            style={{ background: '#1a3258' }}
          >
            {n}
          </button>
        ))}
        <div />
        <button
          onClick={() => addDigit('0')}
          disabled={busy}
          className="h-16 rounded-2xl text-white text-2xl font-semibold active:scale-95 transition-transform disabled:opacity-60"
          style={{ background: '#1a3258' }}
        >
          0
        </button>
        <button
          onClick={backspace}
          disabled={busy}
          className="h-16 rounded-2xl text-white flex items-center justify-center active:scale-95 transition-transform disabled:opacity-60"
          style={{ background: '#1a3258' }}
        >
          <Delete size={22} />
        </button>
      </div>

      {busy && !shaking && (
        <p className="text-green-400 text-sm mt-8 animate-pulse">Logging in…</p>
      )}
      {!busy && (
        <p className="text-blue-400 text-xs mt-8 opacity-50">Enter your 4-digit PIN</p>
      )}
    </div>
  )
}
