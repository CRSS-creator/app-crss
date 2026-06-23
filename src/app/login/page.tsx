'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [buttonHover, setButtonHover] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError('Nieprawidłowy email lub hasło')
      return
    }

    const mustChangePassword = Boolean(
      data.user?.app_metadata?.must_change_password ||
      data.user?.user_metadata?.must_change_password
    )

    window.location.href = mustChangePassword ? '/zmiana-hasla' : '/dashboard'
  }

  return (
    <main style={pageStyle}>
      <section style={leftSection}>
        <div style={logoBoxStyle}>
          <img src="/logo-crss.svg" alt="CRSS" style={logoStyle} />
        </div>

        <h1 style={titleStyle}>
          Jedno miejsce do zarządzania biurem rachunkowym
        </h1>

        <p style={descriptionStyle}>
          Autorski system CRSS porządkuje kluczowe obszary pracy biura: klientów,
          rozliczenia miesięczne, statusy obsługi, rentowność oraz dane
          zarządcze. To prywatne centrum decyzyjne, które pomaga szybciej
          reagować, lepiej planować i mieć pełniejszy obraz działania firmy.
        </p>
      </section>

      <section style={cardStyle}>
        <h2 style={headingStyle}>Logowanie</h2>

        <p style={subheadingStyle}>
          Zaloguj się do panelu zarządczego CRSS
        </p>

        <form onSubmit={handleLogin}>
          <input
            type="email"
            placeholder="Adres email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={inputStyle}
          />

          <input
            type="password"
            placeholder="Hasło"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={inputStyle}
          />

          {error && <p style={errorStyle}>{error}</p>}

          <button
            type="submit"
            style={{
              ...buttonStyle,
              transform: buttonHover ? 'translateY(-2px)' : 'translateY(0)',
              boxShadow: buttonHover
                ? '0 20px 42px rgba(245, 40, 72, 0.36)'
                : '0 16px 35px rgba(245, 40, 72, 0.26)',
              filter: buttonHover ? 'brightness(1.03)' : 'brightness(1)',
            }}
            onMouseEnter={() => setButtonHover(true)}
            onMouseLeave={() => setButtonHover(false)}
          >
            Zaloguj się
          </button>
        </form>
      </section>
    </main>
  )
}

const navy = '#173B73'
const red = 'hsla(351, 95%, 56%, 1)'

const pageStyle = {
  minHeight: '100vh',
  display: 'grid',
  gridTemplateColumns: '1.15fr 0.85fr',
  alignItems: 'center',
  gap: '90px',
  padding: '70px 9%',
  background:
    'radial-gradient(circle at top left, rgba(35,100,169,0.10), transparent 34%), linear-gradient(135deg, #f4f5f7 0%, #eceff3 50%, #e1e5eb 100%)',
  fontFamily: 'Arial, sans-serif',
}

const leftSection = {
  maxWidth: '780px',
}

const logoBoxStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '2px 8px',
  borderRadius: '16px',
  background: 'rgba(255, 255, 255, 0.82)',
  border: '1px solid rgba(210, 218, 230, 0.9)',
  boxShadow: '0 14px 35px rgba(23, 59, 115, 0.08)',
  marginBottom: '42px',
  lineHeight: 0,
  height: 'auto',
}

const logoStyle = {
  width: '300px',
  height: 'auto',
  display: 'block',
}

const titleStyle = {
  fontSize: '58px',
  lineHeight: 1.06,
  color: navy,
  margin: '0 0 28px',
  fontWeight: 900,
  letterSpacing: '-2.3px',
}

const descriptionStyle = {
  fontSize: '20px',
  lineHeight: 1.75,
  color: '#26364f',
  maxWidth: '690px',
}

const cardStyle = {
  background: 'rgba(255, 255, 255, 0.94)',
  padding: '46px',
  borderRadius: '30px',
  boxShadow: '0 38px 95px rgba(20, 38, 68, 0.18)',
  border: '1px solid rgba(255, 255, 255, 0.85)',
  backdropFilter: 'blur(8px)',
}

const headingStyle = {
  fontSize: '36px',
  color: navy,
  margin: '0 0 10px',
  fontWeight: 900,
  letterSpacing: '-0.8px',
}

const subheadingStyle = {
  color: '#43516a',
  marginBottom: '32px',
  fontSize: '16px',
}

const inputStyle = {
  width: '100%',
  padding: '17px 18px',
  marginBottom: '18px',
  borderRadius: '15px',
  border: '1px solid #cbd5e1',
  fontSize: '16px',
  outline: 'none',
  background: '#f8fafc',
  color: '#14213d',
}

const buttonStyle = {
  width: '100%',
  padding: '17px',
  borderRadius: '15px',
  border: 'none',
  background: red,
  color: 'white',
  fontSize: '16px',
  fontWeight: 900,
  cursor: 'pointer',
  marginTop: '10px',
  transition: 'all 0.22s ease',
}

const errorStyle = {
  color: red,
  marginBottom: '12px',
  fontWeight: 700,
}
