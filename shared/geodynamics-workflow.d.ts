export const GEODYNAMICS_WORKFLOW_VERSION: number
export interface GeodynamicsPolicy {
  fixedOperatorIds: string[]
  reason: string
  previewName: string
}
export function getGeodynamicsPolicy(domain: string, scenarioId?: string): GeodynamicsPolicy | null
export function retainFixedOperators(ids: string[], fixedIds: string[]): string[]
export const GEODYNAMICS_ENTITIES: { id: string; entity_id: string; name: string; description: string }[]
