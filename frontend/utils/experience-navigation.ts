export interface ExperienceLocation { step: string; runId: string }
const steps = new Set(['data', 'resource', 'operator', 'workflow', 'monitor', 'result'])

export function resolveExperienceLocation(
  query: { step?: unknown; run?: unknown },
  saved: ExperienceLocation,
  runs: { run_id: string; has_detail?: boolean }[],
): ExperienceLocation {
  const validRun = (id: unknown): id is string => typeof id === 'string' && runs.some(run => run.run_id === id)
  return {
    step: typeof query.step === 'string' && steps.has(query.step) ? query.step : steps.has(saved.step) ? saved.step : 'data',
    runId: validRun(query.run) ? query.run : validRun(saved.runId) ? saved.runId : (runs.find(run => run.has_detail) ?? runs[0])?.run_id ?? '',
  }
}
