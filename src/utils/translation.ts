import * as XLSX from 'xlsx'
import type { MappingItem, ColumnData } from '../types'

// ============ 翻译显示 ============
export function displayTranslation(col: ColumnData): string {
  if (col.selectedAlt >= 0 && col.alternatives[col.selectedAlt]) {
    return col.alternatives[col.selectedAlt].chinese
  }
  return col.translated || col.original
}

// ============ 构建列数据 ============
export function buildTranslatedColumns(fields: string[], mapping: MappingItem[]): ColumnData[] {
  return fields.map(f => {
    const alts = mapping.filter(m => m.original === f && !m._deleted)
    // 有匹配时自动选中第一个
    if (alts.length >= 1) {
      return { original: f, translated: alts[0].chinese, alternatives: alts, selectedAlt: 0 }
    }
    return { original: f, translated: '', alternatives: alts, selectedAlt: -1 }
  })
}

// ============ 字段名解析 ============
export function stripDotPrefix(field: string): string {
  return field.replace(/^["']?[\w.]+\./, '').replace(/^["']|["']$/g, '')
}

export function extractSQLFieldName(fragment: string): string {
  const m = fragment.match(/(?:^|\s)([A-Za-z_]\w*)\s*(?:,|$)/)
  return m ? m[1] : fragment.trim()
}

/** 解析粘贴文本为字段名数组（支持SELECT/Tab/逗号/空格/换行） */
export function parsePastedHeaders(text: string): string[] {
  let raw = text.trim()

  // 检测 SELECT ... FROM 格式（跳过子查询中的 FROM）
  const selectIdx = raw.search(/\bselect\b/i)
  if (selectIdx >= 0) {
    // 1) 去掉 SQL 行注释（-- ...到行尾）
    let cleaned = raw.replace(/--[^\n]*/g, '')
    const afterSelect = cleaned.substring(cleaned.search(/\bselect\b/i) + 6)

    // 2) 用括号平衡找外层 FROM，截取 SELECT 到外层 FROM 之间的字段列表
    let depth = 0
    let cutPos = afterSelect.length
    for (let i = 0; i < afterSelect.length; i++) {
      if (afterSelect[i] === '(') { depth++; continue }
      if (afterSelect[i] === ')') { depth--; continue }
      if (depth === 0) {
        const rest = afterSelect.substring(i)
        if (/^\bfrom\b/i.test(rest)) {
          cutPos = i
          break
        }
      }
    }
    const fieldList = afterSelect.substring(0, cutPos).trim()
    if (!fieldList) return []

    // 3) 按括号/CASE平衡分割顶层逗号（忽略 CASE WHEN / 函数内部的逗号）
    const parts: string[] = []
    let start = 0
    let d = 0       // 括号深度
    let caseD = 0   // CASE 嵌套深度
    for (let i = 0; i < fieldList.length; i++) {
      if (fieldList[i] === '(') { d++; continue }
      if (fieldList[i] === ')') { d--; continue }
      // 追踪 CASE/END 关键字（仅在括号外，因为括号内的CASE是子查询的）
      if (d === 0) {
        const rest = fieldList.substring(i)
        if (/^\bCASE\b/i.test(rest)) { caseD++; i += 3; continue }
        if (caseD > 0 && /^\bEND\b/i.test(rest)) { caseD--; i += 2; continue }
      }
      if (fieldList[i] === ',' && d === 0 && caseD === 0) {
        const seg = fieldList.substring(start, i).trim()
        if (seg) parts.push(seg)
        start = i + 1
      }
    }
    const last = fieldList.substring(start).trim()
    if (last) parts.push(last)

    // 4) 对每个部分提取字段名：
    //    优先取 AS 别名
    //    再取 ) alias（无AS关键字，如 SUM(...) tz_m3）
    //    再取 table.field alias 或 field alias（无AS关键字，如 gh01.staff_code xx1_id）
    //    否则去掉表前缀
    return parts.map(p => {
      const asMatch = p.match(/\bAS\s+["`]?(\w+)["`]?\s*$/i)
      if (asMatch) return asMatch[1]
      // 匹配 CASE...END 后跟别名（无AS关键字），如 CASE WHEN ... END bumen
      const endAlias = p.match(/\bEND\s+(\w+)\s*$/i)
      if (endAlias) return endAlias[1]
      // 匹配括号闭合后空格跟别名，如 SUM(...) tz_m3
      const parenAlias = p.match(/\)\s+(\w+)\s*$/)
      if (parenAlias) return parenAlias[1]
      // 匹配标识符后空格跟别名（无AS），如 gh01.staff_code xx1_id 或 staff_code xx1_id
      // 排除关键字（case/when/then/else/end/from/where/and/or/not/in/on/left/join/as）
      const spaceAlias = p.match(/^["`]?[\w.]+["`]?\s+(\w+)\s*$/)
      if (spaceAlias && !/^(case|when|then|else|end|from|where|and|or|not|in|on|left|right|join|inner|outer|full|cross|as|between|like|is|null|exists|group|having|order|limit|union|all|distinct|select|into|values|set|update|delete|insert|create|drop|alter|table|index|view)$/.test(spaceAlias[1].toLowerCase())) {
        return spaceAlias[1]
      }
      return stripDotPrefix(p.trim())
    })
  }

  // 非 SQL，按原逻辑分割
  const separators = [/,\s+/, /\t+/, / +/, /\n+/]
  for (const sep of separators) {
    const parts = raw.split(sep).map(s => s.trim()).filter(Boolean)
    if (parts.length > 1) return parts.map(extractSQLFieldName).map(stripDotPrefix)
  }
  return [extractSQLFieldName(raw)].map(stripDotPrefix)
}

// ============ Excel 导入/导出 ============
export function parseMappingXLSX(workbook: XLSX.WorkBook): MappingItem[] {
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<{ [key: string]: any }>(sheet, { defval: '' })
  if (rows.length === 0) return []
  // 检测表头：找包含"英文字段"/"中文名称"或首行含中英文的列
  const headers = Object.keys(rows[0])
  let origCol = '', chineseCol = ''
  for (const h of headers) {
    const hl = h.toLowerCase().trim()
    if (hl.includes('英文') || hl.includes('字段') || hl === 'original' || hl === 'field' || hl === '英文字段') { origCol = h; continue }
    if (hl.includes('中文') || hl.includes('翻译') || hl === 'chinese' || hl === 'translation' || hl === '中文名称') { chineseCol = h; continue }
  }
  // 如果没检测到标准表头，用前两列
  if (!origCol) origCol = headers[0]
  if (!chineseCol) chineseCol = headers.length > 1 ? headers[1] : headers[0]
  return rows
    .map((r: any) => ({ original: String(r[origCol] || '').trim(), chinese: String(r[chineseCol] || '').trim() }))
    .filter((m: MappingItem) => m.original !== '' && m.chinese !== '')
}

export function exportMappingXLSX(data: MappingItem[], filename: string) {
  const wsData = [['英文字段', '中文名称'], ...data.filter(m => !m._deleted).map(m => [m.original, m.chinese])]
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet(wsData)
  XLSX.utils.book_append_sheet(wb, ws, '翻译对照')
  XLSX.writeFile(wb, filename)
}

export function downloadMappingTemplate() {
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet([['英文字段', '中文名称']])
  XLSX.utils.book_append_sheet(wb, ws, '模板')
  XLSX.writeFile(wb, '字段翻译对照表_模板.xlsx')
}
