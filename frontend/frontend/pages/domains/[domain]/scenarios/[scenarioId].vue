<script setup lang="ts">
const route = useRoute()
const domain = String(route.params.domain)
const scenarioId = String(route.params.scenarioId)

await navigateTo(
  {
    path: `/domains/${domain}/scenarios`,
    query: { scenario: scenarioId },
  },
  {
    replace: true,
    redirectCode: 301,
  },
)
</script>
