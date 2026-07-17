import { useEffect, useMemo, useState } from 'react'
import type { GeneratedSeed, SeedSettings } from './seed'
import type { LabSessionExport } from './backend'
import {
  bassRoleLabels,
  harmonyLabels,
  phraseLeaderLabels,
  phraseShapeLabels,
  rhythmLabels,
  rootLabels,
  type BassRole,
  type Energy,
  type HarmonyColor,
  type PhraseLeader,
  type PhraseShape,
  type RhythmConcept
} from './seed'

export type LabVerdict = 'keep' | 'maybe' | 'reject'
export type LabCycleMode = 1 | 2 | 'loop'

export type LabEvaluation = {
  verdict: LabVerdict | null
  ratings: string[]
  note: string
}

export type LabCandidate = {
  id: string
  variation: number
  settings: SeedSettings
  generated: GeneratedSeed
  implementationLabel: 'experiment'
  evaluation: LabEvaluation
}

type GeneratorLabProps = {
  settings: SeedSettings
  bpm: number
  outputNames: { digitone: string | null; digitakt: string | null; td3: string | null }
  canAudition: boolean
  playingCandidateId: string | null
  onSettings: (settings: SeedSettings) => void
  onGenerate: (settings: SeedSettings, count: number) => Promise<Array<{ variation: number; generated: GeneratedSeed }>>
  onAudition: (candidate: LabCandidate, cycles: LabCycleMode) => Promise<void>
  onStop: () => Promise<void>
  onExport: (sessionId: string, contents: string, previousPath?: string) => Promise<LabSessionExport | null>
  onUnexportedChange: (hasUnexportedSession: boolean) => void
  onExit: (discardConfirmed?: boolean) => void
}

type ScoreRoleId = 'full-rack' | 'drums' | 'bass' | 'harmony' | 'puncture'
type ScoreDimensionId = 'pitch' | 'groove' | 'placement' | 'development'
type ScoreRating = 'good' | 'bad'

const scoreDimensions: Array<{ id: ScoreDimensionId; label: string; help: string; causes: Array<{ id: string; label: string; help: string }> }> = [
  {
    id: 'pitch', label: 'PITCH', help: 'Do the notes fit the key, current chord, register, and other pitched roles?',
    causes: [
      { id: 'outside-key', label: 'OUTSIDE KEY', help: 'A note sounds outside the intended tonal center.' },
      { id: 'chord-clash', label: 'CHORD CLASH', help: 'A note conflicts with the current chord or another pitched role.' },
      { id: 'register', label: 'REGISTER', help: 'The pitches sit in an unsuitable octave or overlap another role.' }
    ]
  },
  {
    id: 'groove', label: 'GROOVE', help: 'Does the timing feel and rhythmic relationship suit the selected style?',
    causes: [
      { id: 'too-stiff', label: 'TOO STIFF', help: 'The timing feels overly rigid.' },
      { id: 'lurches', label: 'LURCHES', help: 'The timing pulls awkwardly forward or backward.' },
      { id: 'wrong-feel', label: 'WRONG FEEL', help: 'The timing is coherent but does not suit the intended style.' }
    ]
  },
  {
    id: 'placement', label: 'PLACEMENT', help: 'Are events placed on musically useful steps, independent of microtiming feel?',
    causes: [
      { id: 'too-busy', label: 'TOO BUSY', help: 'Too many steps contain events.' },
      { id: 'too-empty', label: 'TOO EMPTY', help: 'Too few steps contain events.' },
      { id: 'wrong-moment', label: 'WRONG MOMENT', help: 'An event occurs at an unhelpful point in the phrase.' }
    ]
  },
  {
    id: 'development', label: 'DEVELOPMENT', help: 'Does the role evolve appropriately across four bars without losing its identity?',
    causes: [
      { id: 'too-static', label: 'TOO STATIC', help: 'The role does not change enough across the phrase.' },
      { id: 'too-random', label: 'TOO RANDOM', help: 'The changes do not feel related to a stable identity.' },
      { id: 'bad-turn', label: 'BAD TURN', help: 'The final bar does not return, pivot, or build useful anticipation.' }
    ]
  }
]

const scoreRows: Array<{ id: ScoreRoleId; label: string; dimensions: ScoreDimensionId[] }> = [
  { id: 'full-rack', label: 'FULL RACK', dimensions: ['pitch', 'groove', 'placement', 'development'] },
  { id: 'drums', label: 'DRUMS', dimensions: ['groove', 'placement', 'development'] },
  { id: 'bass', label: 'BASS', dimensions: ['pitch', 'groove', 'placement', 'development'] },
  { id: 'harmony', label: 'HARMONY', dimensions: ['pitch', 'groove', 'placement', 'development'] },
  { id: 'puncture', label: 'PUNCTURE', dimensions: ['pitch', 'groove', 'placement', 'development'] }
]

export default function GeneratorLab({ settings, bpm, outputNames, canAudition, playingCandidateId, onSettings, onGenerate, onAudition, onStop, onExport, onUnexportedChange, onExit }: GeneratorLabProps): React.JSX.Element {
  const [goal, setGoal] = useState('Calibrate the current generator against hardware listening')
  const [hypothesis, setHypothesis] = useState('The selected style has a stable identity across variations')
  const [batchSize, setBatchSize] = useState(8)
  const [candidates, setCandidates] = useState<LabCandidate[]>([])
  const [candidateIndex, setCandidateIndex] = useState(0)
  const [cycleMode, setCycleMode] = useState<LabCycleMode>(2)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sessionCreatedAt, setSessionCreatedAt] = useState<string | null>(null)
  const [exportStatus, setExportStatus] = useState<string | null>(null)
  const [lastExportPath, setLastExportPath] = useState<string | undefined>()
  const [revision, setRevision] = useState(0)
  const [exportedRevision, setExportedRevision] = useState<number | null>(null)
  const frozen = candidates.length > 0
  const hasUnexportedSession = frozen && exportedRevision !== revision
  const candidate = candidates[candidateIndex]
  const evaluatedCount = candidates.filter((item) => item.evaluation.verdict !== null).length
  const settingsSummary = useMemo(() => `${rootLabels[settings.root]} · ${rhythmLabels[settings.rhythm]} · ${harmonyLabels[settings.harmony]}`, [settings])

  useEffect(() => {
    onUnexportedChange(hasUnexportedSession)
  }, [hasUnexportedSession, onUnexportedChange])

  useEffect(() => () => onUnexportedChange(false), [onUnexportedChange])

  useEffect(() => {
    if (!hasUnexportedSession) return
    const warnBeforeUnload = (event: BeforeUnloadEvent): void => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warnBeforeUnload)
    return () => window.removeEventListener('beforeunload', warnBeforeUnload)
  }, [hasUnexportedSession])

  const update = <Key extends keyof SeedSettings>(key: Key, value: SeedSettings[Key]): void => onSettings({ ...settings, [key]: value })

  async function generateBatch(): Promise<void> {
    if (busy || frozen) return
    setBusy(true)
    setError(null)
    try {
      const generated = await onGenerate(settings, batchSize)
      setSessionCreatedAt(new Date().toISOString())
      setExportStatus(null)
      setRevision(0)
      setExportedRevision(null)
      setCandidates(generated.map(({ variation, generated: arrangement }, index) => ({
        id: `candidate-${String(index + 1).padStart(2, '0')}`,
        variation,
        settings: { ...settings },
        generated: arrangement,
        implementationLabel: 'experiment',
        evaluation: { verdict: null, ratings: [], note: '' }
      })))
      setCandidateIndex(0)
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }

  function updateEvaluation(change: (evaluation: LabEvaluation) => LabEvaluation): void {
    if (!candidate) return
    setCandidates((current) => current.map((item) => item.id === candidate.id ? { ...item, evaluation: change(item.evaluation) } : item))
    setRevision((current) => current + 1)
    if (exportedRevision !== null) setExportStatus('UNEXPORTED CHANGES · export again to update the saved session')
  }

  function setRating(role: ScoreRoleId, dimension: ScoreDimensionId, rating: ScoreRating): void {
    const prefix = `${role}.${dimension}.`
    const id = `${prefix}${rating}`
    updateEvaluation((evaluation) => ({
      ...evaluation,
      ratings: evaluation.ratings.includes(id)
        ? evaluation.ratings.filter((item) => !item.startsWith(prefix))
        : [...evaluation.ratings.filter((item) => !item.startsWith(prefix)), id]
    }))
  }

  function setCause(role: ScoreRoleId, dimension: ScoreDimensionId, cause: string): void {
    const prefix = `${role}.${dimension}.cause.`
    const id = `${prefix}${cause}`
    updateEvaluation((evaluation) => ({
      ...evaluation,
      ratings: evaluation.ratings.includes(id)
        ? evaluation.ratings.filter((item) => item !== id)
        : [...evaluation.ratings.filter((item) => !item.startsWith(prefix)), id]
    }))
  }

  function endBatch(): void {
    if (!confirmDiscard('end')) return
    void onStop()
    setCandidates([])
    setCandidateIndex(0)
    setSessionCreatedAt(null)
    setExportStatus(null)
    setRevision(0)
    setExportedRevision(null)
  }

  function requestExit(): void {
    if (!confirmDiscard('exit')) return
    onExit(true)
  }

  function confirmDiscard(action: 'end' | 'exit'): boolean {
    if (!hasUnexportedSession) return true
    const count = evaluatedCount === 0 ? 'the frozen candidate batch' : `${evaluatedCount} evaluation${evaluatedCount === 1 ? '' : 's'}`
    return window.confirm(`This session has not been exported since its latest changes. ${action === 'end' ? 'Ending the batch' : 'Leaving Generator Lab'} will permanently discard ${count}.\n\nChoose Cancel, then use Export Session before continuing.`)
  }

  function selectCandidate(index: number): void {
    if (playingCandidateId !== null) void onStop()
    setCandidateIndex(index)
  }

  async function exportSession(): Promise<void> {
    if (!sessionCreatedAt) return
    const sessionId = `generator-lab-${sessionCreatedAt.replace(/[:.]/g, '-')}`
    const session = {
      schemaVersion: 2,
      generatorBuild: 'signal-rack-0.4',
      session: {
        id: sessionId,
        createdAt: sessionCreatedAt,
        goal,
        hypothesis,
        bpm,
        hardwareSetup: outputNames,
        candidateIds: candidates.map((item) => item.id)
      },
      candidates
    }
    setExportStatus('SAVING…')
    try {
      const result = await onExport(sessionId, `${JSON.stringify(session, null, 2)}\n`, lastExportPath)
      if (result === null) {
        setExportStatus('EXPORT CANCELED · SESSION REMAINS UNEXPORTED')
        return
      }
      setLastExportPath(result.path)
      setExportStatus(`SAVED · ${result.fileName}`)
      setExportedRevision(revision)
    } catch (reason: unknown) {
      setExportStatus(`EXPORT ERROR · ${reason instanceof Error ? reason.message : String(reason)}`)
    }
  }

  return <section className="generator-lab" aria-label="Generator Lab">
    <header className="lab-heading">
      <div><span className="unit-type">DEVELOPMENT MODE · FROZEN LISTENING SESSION</span><h1>GENERATOR LAB</h1></div>
      <div className="lab-heading-actions">
        {hasUnexportedSession && <span className="lab-dirty" title="Export the session before ending the batch or leaving Generator Lab">● UNEXPORTED</span>}
        {frozen && <span>{evaluatedCount}/{candidates.length} EVALUATED</span>}
        {frozen && <button onClick={() => void exportSession()}>EXPORT SESSION</button>}
        {frozen && <button className="danger" onClick={endBatch}>END BATCH</button>}
        <button onClick={requestExit}>EXIT LAB</button>
      </div>
    </header>

    {!frozen ? <div className="lab-setup">
      <div className="lab-brief">
        <label>EXPERIMENT GOAL<input value={goal} onChange={(event) => setGoal(event.target.value)} /></label>
        <label>HYPOTHESIS<textarea rows={2} value={hypothesis} onChange={(event) => setHypothesis(event.target.value)} /></label>
      </div>
      <div className="lab-settings">
        <LabSelect label="ROOT" value={settings.root} onChange={(value) => update('root', Number(value))}>{rootLabels.map((label, index) => <option value={index} key={label}>{label}</option>)}</LabSelect>
        <LabSelect label="HARMONY" value={settings.harmony} onChange={(value) => update('harmony', value as HarmonyColor)}>{entries(harmonyLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</LabSelect>
        <LabSelect label="STYLE" value={settings.rhythm} onChange={(value) => update('rhythm', value as RhythmConcept)}>{entries(rhythmLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</LabSelect>
        <LabSelect label="ENERGY" value={settings.energy} onChange={(value) => update('energy', value as Energy)}>{(['low', 'medium', 'high'] as Energy[]).map((value) => <option value={value} key={value}>{value.toUpperCase()}</option>)}</LabSelect>
        <LabSelect label="BASS ROLE" value={settings.bassRole} onChange={(value) => update('bassRole', value as BassRole)}>{entries(bassRoleLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</LabSelect>
        <LabSelect label="4-BAR SHAPE" value={settings.shape} onChange={(value) => update('shape', value as PhraseShape)}>{entries(phraseShapeLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</LabSelect>
        <LabSelect label="PHRASE LEADER" value={settings.leader} onChange={(value) => update('leader', value as PhraseLeader)}>{entries(phraseLeaderLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</LabSelect>
        <LabSelect label="BATCH" value={batchSize} onChange={(value) => setBatchSize(Number(value))}>{[6, 8, 10, 12].map((value) => <option value={value} key={value}>{value} CANDIDATES</option>)}</LabSelect>
      </div>
      <div className="lab-launch">
        <span>{settingsSummary}</span>
        <p>The batch becomes immutable when generated. Candidate identities stay hidden until each verdict is recorded.</p>
        <button className={busy ? 'working' : ''} aria-busy={busy} onClick={() => void generateBatch()}>{busy ? 'GENERATING…' : `FREEZE ${batchSize}-CANDIDATE BATCH`}</button>
        {error && <strong className="lab-error">GENERATOR ERROR · {error}</strong>}
      </div>
    </div> : candidate && <div className="lab-session">
      <nav className="candidate-nav" aria-label="Candidate navigation">
        <button disabled={candidateIndex === 0} onClick={() => selectCandidate(candidateIndex - 1)}>← PREVIOUS</button>
        <div><small>LISTENING BLIND</small><strong>CANDIDATE {String(candidateIndex + 1).padStart(2, '0')}</strong><span>{candidateIndex + 1} / {candidates.length}</span></div>
        <button disabled={candidateIndex === candidates.length - 1} onClick={() => selectCandidate(candidateIndex + 1)}>NEXT →</button>
      </nav>

      <div className="candidate-workspace">
        <section className="candidate-listen">
          <span className="lab-section-label">AUDITION</span>
          <div className="cycle-choice" role="group" aria-label="Listening duration">
            {([1, 2, 'loop'] as LabCycleMode[]).map((mode) => <button key={mode} className={cycleMode === mode ? 'selected' : ''} aria-pressed={cycleMode === mode} onClick={() => setCycleMode(mode)}>{mode === 'loop' ? 'LOOP' : `${mode} CYCLE${mode === 1 ? '' : 'S'}`}</button>)}
          </div>
          <div className="audition-actions">
            <button className="play" disabled={!canAudition} onClick={() => void onAudition(candidate, cycleMode)}>{playingCandidateId === candidate.id ? '↻ REPLAY' : '▶ PLAY CANDIDATE'}</button>
            <button className="stop" disabled={playingCandidateId === null} onClick={() => void onStop()}>■ STOP</button>
          </div>
          <p>{canAudition ? 'Listen for one complete four-bar phrase before deciding. Navigation does not regenerate or alter the frozen batch.' : 'Select a MIDI output in an instrument module below before auditioning candidates.'}</p>
        </section>

        <section className="candidate-evaluate">
          <span className="lab-section-label">VERDICT</span>
          <div className="verdicts" role="group" aria-label="Candidate verdict">
            {(['keep', 'maybe', 'reject'] as LabVerdict[]).map((verdict) => <button key={verdict} className={candidate.evaluation.verdict === verdict ? `selected ${verdict}` : ''} aria-pressed={candidate.evaluation.verdict === verdict} onClick={() => updateEvaluation((evaluation) => ({ ...evaluation, verdict }))}>{verdict.toUpperCase()}</button>)}
          </div>
          <span className="lab-section-label">QUICK SCORECARD <small>MARK ONLY WHAT STANDS OUT · ✓ GOOD · × BAD</small></span>
          <div className="scorecard" role="group" aria-label="Candidate role scorecard">
            <div className="scorecard-header"><span>ROLE / AREA</span>{scoreDimensions.map((dimension) => <strong key={dimension.id} title={dimension.help}>{dimension.label}</strong>)}</div>
            {scoreRows.map((row) => <div className="scorecard-row" key={row.id}>
              <strong>{row.label}</strong>
              {scoreDimensions.map((dimension) => row.dimensions.includes(dimension.id) ? <div className="score-cell" role="group" aria-label={`${row.label} ${dimension.label}`} key={dimension.id}>
                {(['good', 'bad'] as ScoreRating[]).map((rating) => {
                  const id = `${row.id}.${dimension.id}.${rating}`
                  return <button key={rating} title={`${row.label} · ${dimension.label} · ${rating.toUpperCase()} — ${dimension.help}`} aria-label={`${row.label} ${dimension.label} ${rating}`} aria-pressed={candidate.evaluation.ratings.includes(id)} className={candidate.evaluation.ratings.includes(id) ? `selected ${rating}` : ''} onClick={() => setRating(row.id, dimension.id, rating)}>{rating === 'good' ? '✓' : '×'}</button>
                })}
              </div> : <span className="score-na" aria-label={`${row.label} ${dimension.label} not applicable`} key={dimension.id}>—</span>)}
            </div>)}
          </div>
          {badScores(candidate.evaluation.ratings).length > 0 && <div className="score-details">
            <span>OPTIONAL DETAIL <small>ONE CAUSE ADDS USEFUL SIGNAL</small></span>
            {badScores(candidate.evaluation.ratings).map(({ role, roleLabel, dimension }) => <div className="score-detail-row" key={`${role}.${dimension.id}`}>
              <strong>{roleLabel} · {dimension.label}</strong>
              <div className="score-causes">{dimension.causes.map((cause) => {
                const id = `${role}.${dimension.id}.cause.${cause.id}`
                return <button key={cause.id} title={cause.help} aria-label={`${roleLabel} ${dimension.label} reason ${cause.label}`} aria-pressed={candidate.evaluation.ratings.includes(id)} className={candidate.evaluation.ratings.includes(id) ? 'selected' : ''} onClick={() => setCause(role, dimension.id, cause.id)}>{cause.label}</button>
              })}</div>
            </div>)}
          </div>}
          <label className="candidate-note">LISTENING NOTE<textarea rows={3} placeholder="What worked, or where did it fail?" value={candidate.evaluation.note} onChange={(event) => updateEvaluation((evaluation) => ({ ...evaluation, note: event.target.value }))} /></label>
        </section>
      </div>

      <section className={`candidate-details ${candidate.evaluation.verdict === null ? 'concealed' : ''}`}>
        <div><span className="lab-section-label">CANDIDATE DETAILS</span><strong>{candidate.evaluation.verdict === null ? 'RECORD A VERDICT TO REVEAL' : candidate.generated.summary}</strong></div>
        {candidate.evaluation.verdict !== null && <dl>
          <div><dt>STYLE</dt><dd>{rhythmLabels[candidate.settings.rhythm]}</dd></div>
          <div><dt>ROOT</dt><dd>{rootLabels[candidate.settings.root]}</dd></div>
          <div><dt>SHAPE</dt><dd>{phraseShapeLabels[candidate.settings.shape]}</dd></div>
          <div><dt>LEADER</dt><dd>{phraseLeaderLabels[candidate.settings.leader]}</dd></div>
          <div><dt>VARIATION</dt><dd>{candidate.variation}</dd></div>
          <div><dt>TYPE</dt><dd>{candidate.implementationLabel}</dd></div>
        </dl>}
      </section>
      {exportStatus && <output className="lab-export-status">{exportStatus}</output>}
    </div>}
  </section>
}

function LabSelect({ label, value, onChange, children }: { label: string; value: string | number; onChange: (value: string) => void; children: React.ReactNode }): React.JSX.Element {
  return <label><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}>{children}</select></label>
}

function entries<Value>(record: Record<string, Value>): Array<[string, Value]> { return Object.entries(record) }

function badScores(tags: string[]): Array<{ role: ScoreRoleId; roleLabel: string; dimension: typeof scoreDimensions[number] }> {
  return scoreRows.flatMap((row) => scoreDimensions
    .filter((dimension) => tags.includes(`${row.id}.${dimension.id}.bad`))
    .map((dimension) => ({ role: row.id, roleLabel: row.label, dimension })))
}
