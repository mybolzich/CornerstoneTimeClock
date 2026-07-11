import { useState } from 'react'

interface Props {
  onSubmit: (pin: string) => Promise<'ok' | 'wrong_pin'>
  title: string
  subtitle?: string
}

export function PinPad({ onSubmit }: Props) {
  const [digits,   setDigits]   = useState<string[]>([])
  const [shaking,  setShaking]  = useState(false)
  const [busy,     setBusy]     = useState(false)

  const addDigit = async (d: string) => {
    if (busy || shaking || digits.length >= 4) return
    const next = [...digits, d]
    setDigits(next)
    if (next.length < 4) return
    setBusy(true)
    const result = await onSubmit(next.join(''))
    if (result === 'wrong_pin') {
      setShaking(true)
      setTimeout(() => { setShaking(false); setDigits([]); setBusy(false) }, 400)
    }
    // on 'ok' parent unmounts — no cleanup needed
  }

  const backspace = () => { if (!busy && !shaking) setDigits(d => d.slice(0,-1)) }
  const clear     = () => { if (!busy && !shaking) setDigits([]) }

  const TEST_PINS = [
    { name: 'Neri',    pin: '1001' },
    { name: 'Mateos',  pin: '1002' },
    { name: 'Erick',   pin: '1003' },
    { name: 'Luis',    pin: '1004' },
    { name: 'Mario',   pin: '1005' },
    { name: 'Manager', pin: '9999' },
  ]

  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      background: 'linear-gradient(180deg, #1A1A2E 0%, #2D2D3A 50%, var(--bg) 50%)',
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif',
    }}>
      {/* Top — dark section with logo + greeting */}
      <div style={{ padding: '56px 32px 32px', textAlign: 'center' }}>
        {/* Logo ring */}
        <div style={{
          width: 72, height: 72, borderRadius: '50%',
          background: 'conic-gradient(#FF6B6B, #FFE66D, #4ECDC4, #A8E063, #FF6B6B)',
          margin: '0 auto 24px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 0 0 4px rgba(255,255,255,.15)',
        }}>
          <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#1A1A2E' }} />
        </div>
        <h1 style={{ color: '#fff', fontSize: 28, fontWeight: 700, margin: 0, letterSpacing: '-0.5px' }}>
          Welcome back
        </h1>
        <p style={{ color: 'rgba(255,255,255,.5)', fontSize: 14, margin: '8px 0 0' }}>
          Enter your 4-digit PIN to clock in
        </p>
      </div>

      {/* Bottom — light section with keypad */}
      <div style={{
        flex: 1, background: 'var(--bg)', borderRadius: '24px 24px 0 0',
        padding: '32px 24px 24px',
        display: 'flex', flexDirection: 'column', gap: 28,
      }}>
        {/* PIN dots */}
        <div className={shaking ? 'shake' : ''} style={{ display: 'flex', justifyContent: 'center', gap: 16 }}>
          {[0,1,2,3].map(i => (
            <div key={i} style={{
              width: 14, height: 14, borderRadius: '50%',
              background: i < digits.length ? 'var(--text-1)' : 'transparent',
              border: `2px solid ${i < digits.length ? 'var(--text-1)' : 'var(--border)'}`,
              transition: 'all .15s',
              transform: i < digits.length ? 'scale(1.1)' : 'scale(1)',
            }} />
          ))}
        </div>

        {/* Keypad */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
          {['1','2','3','4','5','6','7','8','9'].map(n => (
            <button key={n} onClick={() => addDigit(n)} disabled={busy} style={{
              height: 72, borderRadius: 16, background: 'var(--surface)',
              border: '1px solid var(--border)', boxShadow: 'var(--shadow)',
              fontSize: 28, fontWeight: 300, color: 'var(--text-1)',
              transition: 'transform .1s, background .1s',
            }}
            onPointerDown={e => (e.currentTarget.style.background = '#EDEBE8')}
            onPointerUp={e => (e.currentTarget.style.background = 'var(--surface)')}
            onPointerLeave={e => (e.currentTarget.style.background = 'var(--surface)')}>
              {n}
            </button>
          ))}
          {/* Bottom row: CLEAR | 0 | DEL */}
          <button onClick={clear} disabled={busy} style={{
            height: 72, borderRadius: 16, background: 'transparent', border: 'none',
            fontSize: 13, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '.05em',
          }}>CLEAR</button>
          <button onClick={() => addDigit('0')} disabled={busy} style={{
            height: 72, borderRadius: 16, background: 'var(--surface)',
            border: '1px solid var(--border)', boxShadow: 'var(--shadow)',
            fontSize: 28, fontWeight: 300, color: 'var(--text-1)',
          }}
          onPointerDown={e => (e.currentTarget.style.background = '#EDEBE8')}
          onPointerUp={e => (e.currentTarget.style.background = 'var(--surface)')}
          onPointerLeave={e => (e.currentTarget.style.background = 'var(--surface)')}>
            0
          </button>
          <button onClick={backspace} disabled={busy} style={{
            height: 72, borderRadius: 16, background: 'transparent', border: 'none',
            fontSize: 13, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '.05em',
          }}>DEL</button>
        </div>

        {/* Test PIN helper */}
        <div style={{
          background: 'var(--surface)', borderRadius: 16,
          border: '1px solid var(--border)', padding: '12px 16px',
        }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', margin: '0 0 8px', letterSpacing: '.05em', textTransform: 'uppercase' }}>
            Test PINs (Stage 1 prototype)
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px' }}>
            {TEST_PINS.map(p => (
              <button key={p.pin} onClick={() => {
                setDigits([])
                setTimeout(() => {
                  p.pin.split('').reduce((promise, digit, i) => {
                    return promise.then(() => new Promise(res => setTimeout(() => { addDigit(digit); res(undefined) }, i * 80)))
                  }, Promise.resolve())
                }, 50)
              }} style={{
                background: 'none', border: 'none', textAlign: 'left', padding: '2px 0',
                fontSize: 13, color: 'var(--text-2)', cursor: 'pointer',
              }}>
                <span style={{ fontWeight: 600 }}>{p.name}</span>
                <span style={{ color: 'var(--text-3)' }}> · {p.pin}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
