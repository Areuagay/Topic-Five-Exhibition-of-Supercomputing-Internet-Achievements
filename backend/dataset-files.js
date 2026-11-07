import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024
const fail = message => { throw new Error(message) }

export function parseCsv(content) {
  const rows = []; let row = [], cell = '', quoted = false, closed = false
  const input = content.replace(/^\uFEFF/, '')
  const field = () => { row.push(cell); cell = ''; closed = false }
  const record = () => { field(); if (row.some(v => v.trim())) rows.push(row); row = [] }
  for (let i=0;i<input.length;i++) {
    const c=input[i]
    if (quoted) {
      if (c==='"' && input[i+1]==='"') { cell+='"'; i++ }
      else if (c==='"') { quoted=false; closed=true }
      else cell+=c
    } else if (c===',') field()
    else if (c==='\r'||c==='\n') { if (c==='\r' && input[i+1]==='\n') i++; record() }
    else if (c==='"' && !cell && !closed) quoted=true
    else { if (closed || c==='"') fail('CSV 引号格式不正确'); cell+=c }
    if (row.length>100 || rows.length>100000) fail('CSV 超过 100 列或 100000 行限制')
  }
  if (quoted) fail('CSV 存在未闭合的引号')
  if (cell || row.length || closed) record()
  if (rows.length<2) fail('CSV 必须包含表头和至少一行数据')
  const headers=rows[0].map(v=>v.trim())
  if (headers.some(v=>!v)||new Set(headers).size!==headers.length) fail('CSV 表头不能为空或重复')
  if (rows.some(r=>r.length!==headers.length)) fail('CSV 各行列数必须与表头一致')
  return { headers, rows:rows.slice(1) }
}

function validateShape(value, example, path='') {
  if (Array.isArray(example)) {
    if (!Array.isArray(value) || (example.length && !value.length)) fail(`${path} 应为非空数组`)
    if (example.length) for (const item of value) validateShape(item,example[0],`${path}[]`)
  } else if (example && typeof example==='object') {
    if (!value || typeof value!=='object' || Array.isArray(value)) fail(`${path || 'JSON'} 应为对象`)
    for (const [key,template] of Object.entries(example)) {
      if (['dataset_id','scenario_id','source_type'].includes(key)) continue
      // Vocabularies have user-defined keys.
      if (key==='vocab') { if (!value[key] || typeof value[key]!=='object' || Array.isArray(value[key])) fail('vocab 应为词表对象'); continue }
      if (!(key in value)) fail(`缺少字段：${path ? path+'.' : ''}${key}`)
      validateShape(value[key],template,`${path ? path+'.' : ''}${key}`)
    }
  } else if (typeof value!==typeof example || (typeof value==='number'&&!Number.isFinite(value))) fail(`${path} 字段类型不正确`)
}

export function createDatasetFiles({ dataDir, runtimeDir }) {
  const sampleRoot=resolve(dataDir,'uploads'), uploadRoot=resolve(runtimeDir,'uploads')
  const manifest=JSON.parse(readFileSync(resolve(sampleRoot,'manifest.json'),'utf8'))
  const sampleEntry=(domain,id)=>manifest[id]?.domain===domain ? manifest[id] : null
  function sample(domain,id) {
    const entry=sampleEntry(domain,id)
    if (!entry) return null
    const path=resolve(sampleRoot,domain,entry.file_name)
    return { path, name:entry.file_name, ...entry }
  }
  function stored(domain,dataset) {
    const key=dataset.upload_file?.storage_key
    if (!key || !/^[a-f0-9-]+\.[a-z0-9]+$/.test(key)) return null
    const path=resolve(uploadRoot,domain,key)
    return existsSync(path) ? {path,name:dataset.upload_file.file_name} : null
  }
  function describe(domain,dataset) {
    return {
      ...dataset,
      upload_file: undefined,
      file_name:dataset.upload_file?.file_name,
      upload_format:dataset.upload_file?.format,
      preview_available:!!stored(domain,dataset),
    }
  }
  function inspect(domain,dataset,buffer,filename) {
    if (!buffer.length) fail('文件不能为空')
    if (buffer.length>MAX_UPLOAD_BYTES) fail('文件不能超过 5 MB，请使用小规模演示数据')
    if (!filename || filename.length>180 || /[\x00-\x1f/\\]/.test(filename) || basename(filename)!==filename) fail('文件名不合法')
    // The selected upload slot defines the content schema; names and suffixes do not.
    let ext=`.${dataset.format.toLowerCase()}`
    if (ext==='.lsda' && buffer.toString('utf8',0,256).replace(/^\uFEFF/,'').trimStart().startsWith('{')) ext='.json'
    const template=sample(domain,dataset.dataset_id)
    if (!template) fail('此数据集尚未配置上传模板')
    let content=''
    if (!['.safetensors','.lsda'].includes(ext)) {
      try { content=new TextDecoder('utf-8',{fatal:true}).decode(buffer) } catch { fail('文本文件请使用 UTF-8 编码') }
      if (content.includes('\0')) fail('文本文件不能包含二进制内容')
    }
    const preview={ file_name:filename,format:ext.slice(1).toUpperCase(),size_bytes:buffer.length,kind:'text',headers:[],rows:[],text:'',total_rows:0,truncated:false,summary:'' }
    if (ext==='.csv') {
      const parsed=parseCsv(content), expected=parseCsv(readFileSync(template.path,'utf8'))
      for (const header of expected.headers) if (!parsed.headers.includes(header)) fail(`CSV 缺少必填列：${header}`)
      for (const row of parsed.rows) for (let i=0;i<expected.headers.length;i++) {
        const h=expected.headers[i], value=row[parsed.headers.indexOf(h)]
        if (!value.trim()) fail(`${h} 不能为空`)
        if (expected.rows[0][i].trim() && Number.isFinite(Number(expected.rows[0][i])) && !Number.isFinite(Number(value))) fail(`${h} 必须是有效数字`)
        if (h==='confidence' && (+value<0||+value>1)) fail('confidence 必须在 0～1 之间')
        if (h==='travel_time_s' && +value<=0) fail('travel_time_s 必须大于 0')
      }
      const idColumn=parsed.headers.indexOf(expected.headers[0])
      if (expected.headers[0].endsWith('_id') && !['material_id'].includes(expected.headers[0]) && new Set(parsed.rows.map(r=>r[idColumn])).size!==parsed.rows.length) fail(`${expected.headers[0]} 不能重复`)
      Object.assign(preview,{kind:'table',headers:parsed.headers,rows:parsed.rows.slice(0,50).map(r=>r.map(v=>v.slice(0,1000))),total_rows:parsed.rows.length,truncated:parsed.rows.length>50||parsed.rows.some(r=>r.some(v=>v.length>1000)),summary:`${parsed.rows.length} 条记录 · ${parsed.headers.length} 列`})
    } else if (ext==='.json') {
      let data; try {data=JSON.parse(content.replace(/^\uFEFF/,''))} catch {fail('JSON 格式不正确，请检查括号、引号和逗号')}
      validateShape(data,JSON.parse(readFileSync(template.path,'utf8')))
      content=JSON.stringify(data,null,2)
      const array=Object.values(data).find(v=>Array.isArray(v)&&v[0]&&typeof v[0]==='object'&&!Array.isArray(v[0]))
      if (array) { preview.total_rows=array.length; preview.summary=`${array.length} 条记录 · ${Object.keys(data).length} 个顶层字段` }
      else preview.summary=`${Object.keys(data).length} 个顶层字段`
      preview.kind='json'
    } else if (ext==='.safetensors') {
      if (buffer.length<10) fail('Safetensors 文件头不完整')
      const size=Number(buffer.readBigUInt64LE(0))
      if (!Number.isSafeInteger(size)||size<=0||size>buffer.length-8) fail('Safetensors 文件头长度无效')
      let header; try { header=JSON.parse(buffer.subarray(8,8+size).toString('utf8')) } catch {fail('Safetensors 元数据无效')}
      if (!header||typeof header!=='object'||Array.isArray(header)) fail('Safetensors 元数据应为对象')
      const entries=Object.entries(header).filter(([key])=>key!=='__metadata__')
      if (!entries.length) fail('Safetensors 未包含张量')
      const widths={F64:8,F32:4,F16:2,BF16:2,I64:8,I32:4,I16:2,I8:1,U8:1,BOOL:1}
      let end=0
      for (const [,value] of entries.sort((a,b)=>(a[1]?.data_offsets?.[0]??0)-(b[1]?.data_offsets?.[0]??0))) {
        const offsets=value?.data_offsets, shape=value?.shape
        if (!Array.isArray(offsets)||offsets.length!==2||!offsets.every(Number.isSafeInteger)||offsets[0]!==end||offsets[1]<offsets[0]||offsets[1]>buffer.length-8-size||!Array.isArray(shape)||!shape.every(n=>Number.isSafeInteger(n)&&n>=0)||!widths[value.dtype]||shape.reduce((a,b)=>a*b,1)*widths[value.dtype]!==offsets[1]-offsets[0]) fail('Safetensors 张量形状或数据范围无效')
        end=offsets[1]
      }
      if (end!==buffer.length-8-size) fail('Safetensors 数据长度不匹配')
      Object.assign(preview,{kind:'table',headers:['tensor','dtype','shape','bytes'],rows:entries.slice(0,50).map(([key,v])=>[key,v.dtype,v.shape.join(' × '),String(v.data_offsets[1]-v.data_offsets[0])]),total_rows:entries.length,truncated:entries.length>50,summary:`${entries.length} 个张量`})
    } else if (ext==='.pdb') {
      const atoms=content.split(/\r?\n/).filter(line=>/^(ATOM  |HETATM)/.test(line))
      if (!atoms.length || atoms.some(line=>[line.slice(30,38),line.slice(38,46),line.slice(46,54)].some(v=>!v.trim()||!Number.isFinite(Number(v))))) fail('PDB 需要包含有效的原子坐标记录')
      Object.assign(preview,{kind:'table',headers:['atom_id','atom','residue','x_A','y_A','z_A'],rows:atoms.slice(0,50).map(line=>[line.slice(6,11),line.slice(12,16),line.slice(17,20),line.slice(30,38),line.slice(38,46),line.slice(46,54)].map(v=>v.trim())),total_rows:atoms.length,truncated:atoms.length>50,summary:`${atoms.length} 个原子 · 坐标单位 Å`})
    } else if (ext==='.sdf') {
      if (!content.includes('M  END')||!content.includes('$$$$')) fail('SDF 缺少分子结束标记')
      preview.total_rows=content.split('$$$$').filter(s=>s.trim()).length
      preview.summary=`${preview.total_rows} 个分子 · 原始结构文本`
    } else if (ext==='.upf') {
      if (!/<UPF\b/i.test(content)||!/<\/UPF>/i.test(content)||!/<PP_HEADER\b/i.test(content)) fail('UPF 缺少必要的结构标签')
      preview.summary='赝势结构'
    } else if (ext==='.lsda') {
      // LSDA is a proprietary binary database. Never pretend to decode it.
      if (buffer.length<16 || !buffer.includes(0)) fail('网格内容应为 LSDA 二进制或包含节点与单元的 JSON')
      preview.kind='binary'; preview.summary='有限元网格'
    }
    if (['json','text'].includes(preview.kind)) { preview.text=content.slice(0,30000); preview.truncated=content.length>30000 }
    return preview
  }
  function save(domain,dataset,buffer,filename) {
    const preview=inspect(domain,dataset,buffer,filename)
    const folder=resolve(uploadRoot,domain); mkdirSync(folder,{recursive:true})
    const storage_key=`${randomUUID()}.${preview.format.toLowerCase()}`
    writeFileSync(resolve(folder,storage_key),buffer,{flag:'wx'})
    return {storage_key,file_name:filename,format:preview.format,size_bytes:buffer.length,summary:preview.summary}
  }
  function remove(domain,dataset) { const file=stored(domain,dataset); if (file) unlinkSync(file.path) }
  return { sample, stored, describe, inspect, save, remove }
}
