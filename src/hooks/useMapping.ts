import { useState, useCallback, useEffect, useMemo } from 'react'
import type React from 'react'
import { Api } from '../api'
import { loadMappingFromStorage, saveMappingToStorage } from '../utils/storage'
import { buildTranslatedColumns, displayTranslation, parsePastedHeaders, parseMappingXLSX } from '../utils/translation'
import { timestamp } from '../utils/format'
import * as XLSX from 'xlsx'
import type { MappingItem, ColumnData, BatchParseItem } from '../types'

export interface UseMappingReturn {
  // 状态
  mappingData: MappingItem[]
  columns: ColumnData[]
  targetFileName: string
  pasteValue: string
  copied: boolean
  batchTransOpen: boolean
  batchTransText: string
  copiedAlias: boolean
  copiedComment: boolean

  // 设置器
  setMappingData: React.Dispatch<React.SetStateAction<MappingItem[]>>
  setColumns: (c: ColumnData[]) => void
  setTargetFileName: (f: string) => void
  setPasteValue: (v: string) => void
  setCopied: (v: boolean) => void
  setBatchTransOpen: (v: boolean) => void
  setBatchTransText: (v: string) => void
  setCopiedAlias: (v: boolean) => void
  setOriginalDataRows: React.Dispatch<React.SetStateAction<any[][]>>

  // 数据操作
  fetchDbMapping: () => void
  persistMapping: () => void

  // 操作
  handleImportFile: (file: File) => Promise<void>
  handlePasteChange: (val: string) => void
  selectAlternative: (colIdx: number, altIdx: number) => void
  updateTranslation: (colIdx: number, val: string) => void
  canSaveCol: (colIdx: number) => boolean
  saveToMapping: (colIdx: number) => void
  saveAllNewToMapping: () => void
  handleCopyTranslation: () => void
  handleCopyAlias: () => void
  handleCopyComment: () => void

  // 计算属性
  matchedColumns: ColumnData[]
  multiMatchColumns: ColumnData[]
  unmatchedColumns: ColumnData[]
  translatedCount: number
  newMappingCount: number
  batchParsedResult: BatchParseItem[]
  handleBatchTransCopy: () => void
  handleBatchTransConfirm: () => void

  // 导出
  handleExportFull: () => void

  // 文件上传
  draggerCustomRequest: import('antd').UploadProps['customRequest']
}

export function useMapping(
  dataMode: string,
  offlineMode: boolean,
  dbUrl: string,
  message: { success: (msg: string) => void; error: (msg: string) => void; warning: (msg: string) => void }
): UseMappingReturn {
  const [mappingData, setMappingData] = useState<MappingItem[]>([])
  const [columns, setColumns] = useState<ColumnData[]>([])
  const [targetFileName, setTargetFileName] = useState('')
  const [pasteValue, setPasteValue] = useState('')
  const [copied, setCopied] = useState(false)
  const [batchTransOpen, setBatchTransOpen] = useState(false)
  const [batchTransText, setBatchTransText] = useState('')
  const [copiedAlias, setCopiedAlias] = useState(false)
  // 存储导入文件的原始数据行（不含表头），导出时保留
  const [originalDataRows, setOriginalDataRows] = useState<any[][]>([])

  // 加载数据库映射数据
  const fetchDbMapping = useCallback(async () => {
    if (dataMode === 'local' || offlineMode) { setMappingData(loadMappingFromStorage()); return }
    try {
      const data = await Api.list()
      setMappingData(data || [])
    } catch { /* ignore */ }
  }, [dataMode, offlineMode])

  // 持久化映射数据
  const persistMapping = useCallback(() => {
    if (dataMode === 'local' || offlineMode) { saveMappingToStorage(mappingData) }
  }, [dataMode, offlineMode, mappingData])

  // 初始化加载
  useEffect(() => { fetchDbMapping() }, [fetchDbMapping])

  // mappingData 变化时更新 columns 的 alternatives
  useEffect(() => {
    setColumns(prev => prev.map(c => {
      const alts = mappingData.filter(m => m.original === c.original && !m._deleted)
      // 有匹配但未选中时自动选中第一个
      if (alts.length > 0 && c.selectedAlt < 0) {
        return { ...c, alternatives: alts, selectedAlt: 0, translated: alts[0].chinese }
      }
      return {
        ...c,
        alternatives: alts,
        selectedAlt: c.selectedAlt >= alts.length ? -1 : c.selectedAlt,
      }
    }))
  }, [mappingData])

  // columns 变化时，对缓存中未匹配的字段实时查后台（数据库模式）
  useEffect(() => {
    if (columns.length === 0 || dataMode === 'local' || offlineMode) return
    // 找出缓存中没有匹配的字段
    const unmatchedFields = columns
      .filter(c => c.original && c.selectedAlt < 0 && c.alternatives.length === 0)
      .map(c => c.original)
    if (unmatchedFields.length === 0) return
    // 向后台批量查询
    Api.lookup(unmatchedFields).then(results => {
      if (results.length === 0) return
      // 合并到 mappingData（去重）
      setMappingData(prev => {
        const merged = [...prev]
        for (const r of results) {
          if (!merged.some(m => m.original === r.original && !m._deleted)) {
            merged.push(r)
          }
        }
        return merged
      })
    }).catch(() => { /* 静默失败，不影响主流程 */ })
  }, [columns, dataMode, offlineMode])

  // ============ 翻译页操作 ============
  const handleImportFile = useCallback(async (file: File) => {
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })
      const items = parseMappingXLSX(wb)
      if (items.length === 0) { message.warning('未识别到有效数据'); return }
      let added = 0
      const newItems: MappingItem[] = []
      for (const item of items) {
        const existing = mappingData.findIndex(m => m.original === item.original && !m._deleted)
        if (existing >= 0) { mappingData[existing].chinese = item.chinese; added++ }
        else { newItems.push(item); added++ }
      }
      setMappingData([...mappingData, ...newItems])
      persistMapping()
      message.success(`导入完成，共 ${added} 条`)
    } catch (err: any) { message.error('导入失败: ' + err.message) }
  }, [mappingData, dataMode, offlineMode, dbUrl, persistMapping, message])

  const handlePasteChange = useCallback((val: string) => {
    setPasteValue(val)
    if (!val.trim()) { setColumns([]); setOriginalDataRows([]); return }
    const fields = parsePastedHeaders(val)
    if (fields.length > 0) { setColumns(buildTranslatedColumns(fields, mappingData)); setOriginalDataRows([]) }
  }, [mappingData])

  const selectAlternative = useCallback((colIdx: number, altIdx: number) => {
    setColumns(prev => prev.map((c, i) => {
      if (i !== colIdx) return c
      const alt = c.alternatives[altIdx]
      return { ...c, selectedAlt: altIdx, translated: alt ? alt.chinese : c.translated }
    }))
  }, [])

  const updateTranslation = useCallback((colIdx: number, val: string) => {
    setColumns(prev => prev.map((c, i) => i === colIdx ? { ...c, translated: val, selectedAlt: -1 } : c))
  }, [])

  const canSaveCol = useCallback((colIdx: number): boolean => {
    const col = columns[colIdx]
    return col.translated !== '' && col.original !== '' && !mappingData.some(m => m.original === col.original && m.chinese === col.translated && !m._deleted)
  }, [columns, mappingData])

  const saveToMapping = useCallback((colIdx: number) => {
    const col = columns[colIdx]
    if (!canSaveCol(colIdx)) return
    const newItem: MappingItem = { original: col.original, chinese: col.translated }
    setMappingData(prev => [...prev, newItem])
    setColumns(prev => prev.map((c, i) => i === colIdx ? { ...c, alternatives: [...c.alternatives, newItem], selectedAlt: c.alternatives.length } : c))
    persistMapping()
  }, [columns, canSaveCol, persistMapping])

  const saveAllNewToMapping = useCallback(() => {
    const newItems: MappingItem[] = []
    setColumns(prev => prev.map(c => {
      if (c.translated && c.original && !mappingData.some(m => m.original === c.original && m.chinese === c.translated && !m._deleted)) {
        const item = { original: c.original, chinese: c.translated }
        newItems.push(item)
        return { ...c, alternatives: [...c.alternatives, item], selectedAlt: c.alternatives.length }
      }
      return c
    }))
    if (newItems.length > 0) { setMappingData(prev => [...prev, ...newItems]); persistMapping(); message.success(`保存 ${newItems.length} 条新翻译`) }
  }, [columns, mappingData, persistMapping, message])

  const handleCopyTranslation = useCallback(() => {
    // 只要翻译结果行，Tab 分隔（对应原字段顺序）
    const text = columns.map(c => displayTranslation(c)).join('\t')
    navigator.clipboard.writeText(text).catch(() => {
      const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta)
    })
    setCopied(true); setTimeout(() => setCopied(false), 1500)
  }, [columns])

  const handleCopyAlias = useCallback(() => {
    const lines = columns.map(c => {
      const t = displayTranslation(c)
      return t !== c.original ? `    ${c.original} AS \`${t}\`` : `    ${c.original}`
    })
    // 从粘贴内容中提取 CREATE TABLE/VIEW ... AS 的表名（支持 schema.table、OR REPLACE、IF NOT EXISTS）
    const ctMatch = pasteValue.match(/create\s+(?:or\s+replace\s+)?(?:table|view)\s+(?:if\s+not\s+exists\s+)?([\w.]+)/i)
    const tableName = ctMatch ? ctMatch[1] : (targetFileName || 'table_name')
    const sql = `SELECT \n${lines.join(',\n')}\nFROM ${tableName}`
    navigator.clipboard.writeText(sql).catch(() => {
      const ta = document.createElement('textarea'); ta.value = sql; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta)
    })
    setCopiedAlias(true); setTimeout(() => setCopiedAlias(false), 1500)
  }, [columns, pasteValue, targetFileName])

  const [copiedComment, setCopiedComment] = useState(false)

  const handleCopyComment = useCallback(() => {
    // 从粘贴内容中提取表名（与复制别名同逻辑）
    const ctMatch = pasteValue.match(/create\s+(?:or\s+replace\s+)?(?:table|view)\s+(?:if\s+not\s+exists\s+)?([\w.]+)/i)
    const tableName = ctMatch ? ctMatch[1] : (targetFileName || 'table_name')
    // 生成 COMMENT ON COLUMN 语句
    const lines = columns
      .filter(c => {
        const t = displayTranslation(c)
        return t && t !== c.original
      })
      .map(c => `COMMENT ON COLUMN ${tableName}.${c.original} IS '${displayTranslation(c)}';`)
    if (lines.length === 0) { return }
    const text = lines.join('\n')
    navigator.clipboard.writeText(text).catch(() => {
      const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta)
    })
    setCopiedComment(true); setTimeout(() => setCopiedComment(false), 1500)
  }, [columns, pasteValue, targetFileName])

  // 计算属性：基于是否有对照记录判断匹配状态，而非翻译值是否和原字段不同
  const matchedColumns = useMemo(() => columns.filter(c => c.alternatives.length === 1), [columns])
  const multiMatchColumns = useMemo(() => columns.filter(c => c.alternatives.length > 1), [columns])
  const unmatchedColumns = useMemo(() => columns.filter(c => c.alternatives.length === 0 && c.original !== ''), [columns])
  const translatedCount = useMemo(() => columns.filter(c => displayTranslation(c) !== c.original).length, [columns])
  const newMappingCount = columns.filter((_, idx) => canSaveCol(idx)).length

  // 批量翻译
  const batchParsedResult = useMemo((): BatchParseItem[] => {
    if (!batchTransText.trim()) return []
    const lines = batchTransText.trim().split(/\n+/).map(l => l.trim()).filter(Boolean)
    return lines.map(line => {
      // 支持 Tab、逗号、等号、空格分隔（字段名在前，翻译在后）
      const parts = line.split(/[\t,=]+/).map(s => s.trim()).filter(Boolean)
      const original = parts[0] || ''
      const chinese = parts.length > 1 ? parts[1] : ''
      // 匹配到 unmatchedColumns 中的索引
      const matchedIdx = unmatchedColumns.findIndex(c => c.original === original)
      return { original, chinese, matchedIdx }
    })
  }, [batchTransText, unmatchedColumns])

  const handleBatchTransCopy = useCallback(() => {
    navigator.clipboard.writeText(unmatchedColumns.map(c => c.original).join('\n'))
    message.success('已复制无匹配字段列表')
  }, [unmatchedColumns, message])

  const handleBatchTransConfirm = useCallback(() => {
    const newItems: MappingItem[] = []
    setColumns(prev => prev.map(c => {
      const result = batchParsedResult.find(r => r.original === c.original)
      if (result && result.chinese && c.original !== result.chinese) {
        const item = { original: c.original, chinese: result.chinese }
        newItems.push(item)
        return { ...c, translated: result.chinese, alternatives: [...c.alternatives, item], selectedAlt: c.alternatives.length }
      }
      return c
    }))
    if (newItems.length > 0) {
      setMappingData(mp => [...mp, ...newItems])
      if (dataMode !== 'local' && !offlineMode) {
        Api.importItems(newItems).then(res => {
          message.success(`批量翻译完成，新增 ${res.inserted} 条，跳过 ${res.skipped} 条`)
          fetchDbMapping()
        }).catch(() => message.error('批量翻译写入数据库失败'))
      } else {
        persistMapping()
        message.success(`批量翻译完成，新增 ${newItems.length} 条`)
      }
    }
    setBatchTransOpen(false); setBatchTransText('')
  }, [batchParsedResult, dataMode, offlineMode, persistMapping, fetchDbMapping, message])

  const handleExportFull = useCallback(() => {
    // 横向布局：第一行字段名，第二行翻译，后续行原数据
    const headerRow = columns.map(c => c.original)
    const translationRow = columns.map(c => displayTranslation(c))
    const wsData = [headerRow, translationRow, ...originalDataRows]
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet(wsData)
    XLSX.utils.book_append_sheet(wb, ws, '翻译结果')
    XLSX.writeFile(wb, `翻译结果_${targetFileName || timestamp()}.xlsx`)
  }, [columns, originalDataRows, targetFileName])

  // 文件上传
  const parseTargetFile = useCallback(async (file: File) => {
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })
      const sheet = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 })
      if (rows.length < 2) { message.warning('文件内容不足'); return }
      const headers = rows[0].map(String).map(s => s.trim()).filter(Boolean)
      setColumns(buildTranslatedColumns(headers, mappingData))
      setOriginalDataRows(rows.slice(1).map(r => r.map(String)))
      setTargetFileName(file.name.replace(/\.(xlsx?|csv)$/i, ''))
    } catch (err: any) { message.error('解析失败: ' + err.message) }
  }, [mappingData, message])

  const draggerCustomRequest: import('antd').UploadProps['customRequest'] = useCallback(({ file, onSuccess }) => {
    parseTargetFile(file as File).then(() => onSuccess?.({}))
  }, [parseTargetFile])

  return {
    mappingData, columns, targetFileName, pasteValue, copied, batchTransOpen, batchTransText, copiedAlias, copiedComment,
    setMappingData, setColumns, setTargetFileName, setPasteValue, setCopied, setBatchTransOpen, setBatchTransText, setCopiedAlias, setOriginalDataRows,
    fetchDbMapping, persistMapping,
    handleImportFile, handlePasteChange, selectAlternative, updateTranslation, canSaveCol, saveToMapping, saveAllNewToMapping,
    handleCopyTranslation, handleCopyAlias, handleCopyComment,
    matchedColumns, multiMatchColumns, unmatchedColumns, translatedCount, newMappingCount,
    batchParsedResult, handleBatchTransCopy, handleBatchTransConfirm,
    handleExportFull,
    draggerCustomRequest,
  }
}
