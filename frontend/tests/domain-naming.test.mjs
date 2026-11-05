import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const readJSON = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'))

test('六个领域使用统一的名称与短标题', async () => {
  const { data } = await readJSON('../../mock-data/index.json')
  const titles = new Map(data.domains.map((domain) => [domain.domain, domain]))

  const expected = {
    geodynamics: '地球物理',
    llm: 'AI模型训练',
    automotive: '汽车设计',
    uav: '仿真计算',
    drug: '药物设计',
    dft: '材料计算',
  }

  for (const [id, name] of Object.entries(expected)) {
    const domain = titles.get(id)
    assert.ok(domain, `缺少领域 ${id}`)
    assert.equal(domain.name, name, `${id} 首页标题`)
    assert.equal(domain.short_name, name, `${id} 短标题`)
  }
  assert.equal(titles.get('multicenter').name, '函数多中心联调')
})

test('领域内总标题复用同一份领域名称', async () => {
  const page = await readFile(new URL('../pages/domains/[domain]/scenarios/index.vue', import.meta.url), 'utf8')
  assert.match(page, /:title="domainInfo\?\.name \?\? domain"/)

  const runs = await readFile(new URL('../pages/domains/[domain]/runs/index.vue', import.meta.url), 'utf8')
  assert.match(runs, /:title="domainInfo\?\.name \?\? domain"/)
})
