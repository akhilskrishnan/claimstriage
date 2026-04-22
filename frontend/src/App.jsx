import { useState } from 'react'

// ─── Sample claims ────────────────────────────────────────────────────────────

const SAMPLE_CLAIMS = [
  {
    label: 'Auto Accident',
    icon: '🚗',
    text: `My name is James Carter. On March 15, 2024, I was driving southbound on Highway 101 when another vehicle ran a red light at the Oak Street intersection and struck the passenger side of my car at approximately 45 mph. The other driver, who was later cited by responding officers, admitted fault at the scene. My vehicle sustained severe structural damage to the passenger door, rear quarter panel, and frame — the repair estimate from the certified body shop is $14,200. The airbags deployed and I was taken by ambulance to St. Mary's Medical Center with whiplash, a fractured right wrist, and lacerations. Emergency room and follow-up bills total $9,800. I have the police report (case #2024-0315-4471), photos, and the body shop estimate available.`,
  },
  {
    label: 'Property Fire',
    icon: '🏠',
    text: `Claimant: Maria Gonzalez. On the evening of November 8, 2023, a fire broke out in the kitchen of my home at 342 Birchwood Lane due to a malfunctioning stove. By the time the fire department arrived, the fire had spread to the dining room and caused extensive smoke damage throughout the house. The kitchen is a total loss. A licensed contractor has provided a restoration estimate of $87,000 for structural repairs and $23,000 for contents replacement. We had to relocate to a hotel immediately — temporary living expenses so far are $4,200. The fire department report confirms the cause as an appliance malfunction. I have all documentation ready for review.`,
  },
  {
    label: 'Suspicious Claim',
    icon: '⚠️',
    text: `I think it was sometime in January — not exactly sure of the date — that my car was stolen from outside my apartment. Maybe around the 10th or so. I can't remember exactly. The car is worth like $35,000, maybe more honestly. There were no witnesses and no cameras nearby as far as I know. I just renewed my policy last month. I reported it to police eventually but I waited a few weeks before calling the insurance company because I was hoping it would turn up. I don't have many receipts or documents. I also filed a claim last year for a different stolen vehicle. I need this settled as soon as possible, I need the money now. Let me know what you need.`,
  },
  {
    label: 'Medical Injury',
    icon: '🏥',
    text: `My name is Patricia Huang. On July 22, 2024, I slipped and fell on a wet floor at the Greenfield Shopping Mall. There were no wet-floor warning signs posted at the time, and two other shoppers witnessed the fall. I sustained a fractured hip and torn ligament in my left knee, requiring surgery and a five-day hospital stay. Rehabilitation and physical therapy are ongoing. Medical bills to date: hospital ($28,500), surgery ($41,000), physical therapy ($6,300). I am unable to work during recovery — lost wages for three months at $4,200/month total $12,600. A security camera recorded the incident and mall management has acknowledged the absence of signage. Total claim value: $88,400 plus future medical expenses.`,
  },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SEVERITY_META = {
  low:      { label: 'Low',      className: 'badge-low' },
  medium:   { label: 'Medium',   className: 'badge-medium' },
  high:     { label: 'High',     className: 'badge-high' },
  critical: { label: 'Critical', className: 'badge-critical' },
}

const LIABILITY_META = {
  yes:     { label: 'Yes — Third-party liable',  icon: '⚖️' },
  no:      { label: 'No — Own fault',             icon: '🙋' },
  unclear: { label: 'Unclear — Investigation needed', icon: '❓' },
}

const CLAIM_TYPE_ICONS = {
  auto:      '🚗',
  property:  '🏠',
  medical:   '🏥',
  theft:     '🔓',
  liability: '⚖️',
  general:   '📋',
}

function fmt(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value)
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function App() {
  const [claimText, setClaimText] = useState('')
  const [result, setResult]       = useState(null)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState(null)

  async function handleSubmit() {
    if (!claimText.trim()) return
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const res = await fetch('/api/triage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claim_text: claimText }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }))
        throw new Error(err.detail || 'Server error')
      }
      const data = await res.json()
      setResult(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const severityMeta   = result && (SEVERITY_META[result.severity]   || SEVERITY_META.low)
  const liabilityMeta  = result && (LIABILITY_META[result.liability_indicator] || LIABILITY_META.unclear)
  const claimTypeIcon  = result && (CLAIM_TYPE_ICONS[result.claim_type] || '📋')

  return (
    <div className="app">
      {/* Header */}
      <header className="app-header">
        <div className="header-inner">
          <div className="header-brand">
            <span className="header-shield">🛡️</span>
            <div>
              <h1>Claims Triage AI</h1>
              <p>Powered by Claude + LangChain</p>
            </div>
          </div>
          <div className="header-badge">AI-Assisted</div>
        </div>
      </header>

      <main className="app-main">
        {/* Left panel — Input */}
        <section className="panel input-panel">
          <div className="panel-header">
            <h2>Submit a Claim</h2>
            <span className="panel-sub">Paste a claim description or choose a sample below</span>
          </div>

          {/* Sample claim buttons */}
          <div className="sample-grid">
            {SAMPLE_CLAIMS.map((s) => (
              <button
                key={s.label}
                className={`sample-btn ${claimText === s.text ? 'sample-btn--active' : ''}`}
                onClick={() => { setClaimText(s.text); setResult(null); setError(null) }}
              >
                <span className="sample-icon">{s.icon}</span>
                {s.label}
              </button>
            ))}
          </div>

          <textarea
            className="claim-textarea"
            placeholder="Paste or type the claim description here…"
            value={claimText}
            onChange={(e) => { setClaimText(e.target.value); setResult(null); setError(null) }}
          />

          <div className="input-actions">
            <button
              className="btn-clear"
              onClick={() => { setClaimText(''); setResult(null); setError(null) }}
              disabled={!claimText}
            >
              Clear
            </button>
            <button
              className="btn-submit"
              onClick={handleSubmit}
              disabled={loading || !claimText.trim()}
            >
              {loading ? (
                <>
                  <span className="spinner" />
                  Analyzing…
                </>
              ) : (
                <>
                  <span>⚡</span> Run Triage
                </>
              )}
            </button>
          </div>

          {error && (
            <div className="error-box">
              <span>⛔</span> {error}
            </div>
          )}
        </section>

        {/* Right panel — Results */}
        <section className="panel results-panel">
          <div className="panel-header">
            <h2>Triage Results</h2>
            <span className="panel-sub">AI-generated assessment</span>
          </div>

          {!result && !loading && (
            <div className="results-empty">
              <div className="empty-icon">🔍</div>
              <p>Submit a claim to see the triage report</p>
            </div>
          )}

          {loading && (
            <div className="results-loading">
              <div className="loading-pulse">
                <div className="pulse-ring" />
                <span className="pulse-icon">🛡️</span>
              </div>
              <p>Agent is analyzing the claim…</p>
              <div className="loading-steps">
                <div className="step">Extracting claim fields</div>
                <div className="step">Scoring severity</div>
                <div className="step">Checking fraud indicators</div>
                <div className="step">Generating recommendations</div>
              </div>
            </div>
          )}

          {result && (
            <div className="results-content">
              {/* Top row: type + severity */}
              <div className="result-top-row">
                <div className="claim-type-tag">
                  {claimTypeIcon} {result.claim_type.charAt(0).toUpperCase() + result.claim_type.slice(1)} Claim
                </div>
                <span className={`severity-badge ${severityMeta.className}`}>
                  {severityMeta.label} Severity
                </span>
              </div>

              {/* Info grid */}
              <div className="info-grid">
                <div className="info-card">
                  <div className="info-label">Claimant</div>
                  <div className="info-value">{result.claimant_name}</div>
                </div>
                <div className="info-card">
                  <div className="info-label">Incident Date</div>
                  <div className="info-value">{result.incident_date}</div>
                </div>
                <div className="info-card">
                  <div className="info-label">Estimated Value</div>
                  <div className="info-value info-value--money">{fmt(result.estimated_value)}</div>
                </div>
                <div className="info-card">
                  <div className="info-label">Liability</div>
                  <div className="info-value">
                    {liabilityMeta.icon} {liabilityMeta.label}
                  </div>
                </div>
              </div>

              {/* Red flags */}
              <div className="result-section">
                <h3 className="section-title">
                  <span>🚩</span> Red Flags
                  <span className={`flag-count ${result.red_flags.length > 0 ? 'flag-count--warn' : 'flag-count--ok'}`}>
                    {result.red_flags.length}
                  </span>
                </h3>
                {result.red_flags.length === 0 ? (
                  <div className="no-flags">
                    <span>✅</span> No fraud indicators detected
                  </div>
                ) : (
                  <ul className="flags-list">
                    {result.red_flags.map((flag, i) => (
                      <li key={i} className="flag-item">
                        <span className="flag-dot">⚠️</span>
                        {flag}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Recommended actions */}
              <div className="result-section">
                <h3 className="section-title">
                  <span>📋</span> Recommended Actions
                </h3>
                <ol className="actions-list">
                  {result.recommended_actions.map((action, i) => (
                    <li key={i} className="action-item">
                      <span className="action-num">{i + 1}</span>
                      {action}
                    </li>
                  ))}
                </ol>
              </div>

              {/* Reasoning */}
              <div className="result-section">
                <h3 className="section-title">
                  <span>🧠</span> Reasoning
                </h3>
                <p className="reasoning-text">{result.reasoning}</p>
              </div>
            </div>
          )}
        </section>
      </main>

      <footer className="app-footer">
        For internal use only — AI assessments require human review before action
      </footer>
    </div>
  )
}
