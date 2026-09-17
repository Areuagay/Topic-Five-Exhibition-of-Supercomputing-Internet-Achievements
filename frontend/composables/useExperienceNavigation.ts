import { computed, onMounted, watch, type Ref } from 'vue'
import { resolveExperienceLocation, type ExperienceLocation } from '~/utils/experience-navigation'
import type { Run } from '~/types'

export function useExperienceNavigation(domain: string, scenarioId: string, runs: Ref<Run[]>) {
  const route = useRoute()
  const router = useRouter()
  const path = `/domains/${domain}/scenarios`
  const saved = useState<ExperienceLocation>(`experience-location-${domain}-${scenarioId}`, () => ({ step: 'data', runId: '' }))
  const isCurrentScenario = () => route.path === path && (!route.query.scenario || route.query.scenario === scenarioId)

  watch([() => route.fullPath, runs], () => {
    if (isCurrentScenario()) saved.value = resolveExperienceLocation(route.query, saved.value, runs.value)
  }, { immediate: true })

  function navigate(step: string, runId = saved.value.runId, replace = false): void {
    const location = resolveExperienceLocation({ step, run: runId }, saved.value, runs.value)
    saved.value = location
    if (import.meta.server || route.path !== path) return
    const target = { path, query: { ...route.query, scenario: scenarioId, step: location.step, run: location.runId || undefined } }
    if (replace) void router.replace(target)
    else void router.push(target)
  }

  // Give the initial history entry an explicit location before the user leaves it.
  onMounted(() => navigate(saved.value.step, saved.value.runId, true))
  const activeKey = computed({ get: () => saved.value.step, set: (step: string) => navigate(step) })
  const selectedRunId = computed({ get: () => saved.value.runId, set: (runId: string) => navigate(saved.value.step, runId, true) })
  return { activeKey, selectedRunId, navigate }
}
