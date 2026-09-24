import { computed, onMounted, watch, type Ref } from 'vue'
import { resolveExperienceLocation, requiresSubmittedPlan, type ExperienceLocation } from '~/utils/experience-navigation'
import type { Run } from '~/types'

export function useExperienceNavigation(domain: string, scenarioId: string, runs: Ref<Run[]>, workflowAllowed?: Ref<boolean>, submittedRunId?: Ref<string>) {
  const route = useRoute()
  const router = useRouter()
  const path = `/domains/${domain}/scenarios`
  const saved = useState<ExperienceLocation>(`experience-location-${domain}-${scenarioId}`, () => ({ step: 'data', runId: '' }))
  const isCurrentScenario = () => route.path === path && (!route.query.scenario || route.query.scenario === scenarioId)

  // URL changes represent browser navigation. Data/gate changes must not replay
  // the old URL while an explicit click is still being committed by the router.
  watch(() => route.fullPath, () => {
    if (!isCurrentScenario()) return
    saved.value = resolveExperienceLocation(route.query, saved.value, runs.value, workflowAllowed?.value ?? true)
    if (import.meta.client && requiresSubmittedPlan(route.query.step) && saved.value.step === 'operator') {
      void router.replace({ query: { ...route.query, step: 'operator', plan: undefined } })
    }
  }, { immediate: true })

  watch([runs, () => workflowAllowed?.value], () => {
    if (!isCurrentScenario()) return
    const current = saved.value
    const next = resolveExperienceLocation({ step: current.step, run: current.runId }, current, runs.value, workflowAllowed?.value ?? true)
    if (next.step !== current.step || next.runId !== current.runId) navigate(next.step, next.runId, true)
  })

  function navigate(step: string, runId = saved.value.runId, replace = false): void {
    const location = resolveExperienceLocation({ step, run: runId }, saved.value, runs.value, workflowAllowed?.value ?? true)
    saved.value = location
    if (import.meta.server || !isCurrentScenario()) return
    const target = { path, query: { ...route.query, scenario: scenarioId, step: location.step, run: location.runId || undefined, plan: submittedRunId?.value || undefined } }
    if (replace) void router.replace(target)
    else void router.push(target)
  }

  // Give the initial history entry an explicit location before the user leaves it.
  onMounted(() => navigate(saved.value.step, saved.value.runId, true))
  const activeKey = computed({ get: () => saved.value.step, set: (step: string) => navigate(step) })
  const selectedRunId = computed({ get: () => saved.value.runId, set: (runId: string) => navigate(saved.value.step, runId, true) })
  return { activeKey, selectedRunId, navigate }
}
