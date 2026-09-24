export interface ExperienceLocation { step: string; runId: string }
const steps = new Set(['data', 'resource', 'operator', 'workflow', 'monitor', 'result'])
const submittedSteps = new Set(['workflow', 'monitor', 'result'])

export function requiresSubmittedPlan(step: unknown): boolean {
  return typeof step === 'string' && submittedSteps.has(step)
}

export function hasSubmittedSelection(
  chosenIds: string[],
  run?: { origin?: string; selected_operator_ids?: string[] },
): boolean {
  const submitted = run?.selected_operator_ids ?? []
  return run?.origin === 'runtime' && chosenIds.length > 0
    && chosenIds.length === submitted.length
    && chosenIds.every(id => submitted.includes(id))
}

export function resolveExperienceLocation(
  query: { step?: unknown; run?: unknown },
  saved: ExperienceLocation,
  runs: { run_id: string; has_detail?: boolean }[],
  workflowAllowed = true,
): ExperienceLocation {
  const validRun = (id: unknown): id is string => typeof id === 'string' && runs.some(run => run.run_id === id)
  const step = typeof query.step === 'string' && steps.has(query.step) ? query.step : steps.has(saved.step) ? saved.step : 'data'
  return {
    step: requiresSubmittedPlan(step) && !workflowAllowed ? 'operator' : step,
    runId: validRun(query.run) ? query.run : validRun(saved.runId) ? saved.runId : (runs.find(run => run.has_detail) ?? runs[0])?.run_id ?? '',
  }
}
