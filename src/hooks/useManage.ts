import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import type React from 'react'
import { Api } from '../api'
import type { MappingItem, LogEntry, ImportConflict } from '../types'
import { LOG_PAGE_SIZE } from '../constants'
import { exportMappingXLSX } from '../utils/translation'
import { timestamp } from '../utils/format'

export interface UseManageReturn {
  // 状态
  manageSearchInput: string
  manageSearch: string
  searchExact: boolean
  currentPage: number
  managePageSize: number
  editingGlobalIdx: number | null
  editOriginal: string
  editChinese: string
  addOriginal: string
  addChinese: string
  importConflicts: ImportConflict[] | null
  importNewItems: MappingItem[]
  logModalOpen: boolean
  logRecordId: number | null
  logFieldName: string
  logData: LogEntry[]
  logTotal: number
  logPage: number
  logTotalPages: number

  // 设置器
  setManageSearchInput: (v: string) => void
  setSearchExact: (v: boolean) => void
  setManagePageSize: (v: number) => void
  setEditingGlobalIdx: (v: number | null) => void
  setEditOriginal: (v: string) => void
  setEditChinese: (v: string) => void
  setAddOriginal: (v: string) => void
  setAddChinese: (v: string) => void
  setImportConflicts: (v: ImportConflict[] | null) => void
  setImportNewItems: (v: MappingItem[]) => void
  setLogModalOpen: (v: boolean) => void
  setLogRecordId: (v: number | null) => void
  setLogFieldName: (v: string) => void
  setLogData: (v: LogEntry[]) => void
  setLogTotal: (v: number) => void
  setLogPage: (v: number) => void

  // 操作
  startEdit: (idx: number) => void
  saveEdit: () => void
  deleteItem: (item: MappingItem) => void
  restoreItem: (item: MappingItem) => void
  addItem: () => void
  applySearch: () => void
  fetchLogs: (recordId?: number, fieldName?: string, page?: number) => Promise<void>
  handleLogPageChange: (p: number) => void
  confirmImportConflicts: () => void
  handleExportMapping: () => void

  // 计算属性
  filteredData: MappingItem[]
  totalPages: number
  safeCurrentPage: number
}

export function useManage(
  mappingData: MappingItem[],
  setMappingData: React.Dispatch<React.SetStateAction<MappingItem[]>>,
  dataMode: string,
  offlineMode: boolean,
  dbUrl: string,
  showDeleted: boolean,
  _setShowDeleted: (v: boolean) => void,
  deletedData: MappingItem[],
  setDeletedData: React.Dispatch<React.SetStateAction<MappingItem[]>>,
  fetchDbMapping: () => void,
  persistMapping: () => void,
  message: { success: (msg: string) => void; error: (msg: string) => void; warning: (msg: string) => void }
): UseManageReturn {
  const [manageSearchInput, setManageSearchInput] = useState('')
  const [manageSearch, setManageSearch] = useState('')
  const [searchExact, setSearchExact] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [managePageSize, setManagePageSize] = useState(10)
  const [editingGlobalIdx, setEditingGlobalIdx] = useState<number | null>(null)
  const [editOriginal, setEditOriginal] = useState('')
  const [editChinese, setEditChinese] = useState('')
  const [addOriginal, setAddOriginal] = useState('')
  const [addChinese, setAddChinese] = useState('')
  const [importConflicts, setImportConflicts] = useState<ImportConflict[] | null>(null)
  const [importNewItems, setImportNewItems] = useState<MappingItem[]>([])
  const [logModalOpen, setLogModalOpen] = useState(false)
  const [logRecordId, setLogRecordId] = useState<number | null>(null)
  const [logFieldName, setLogFieldName] = useState('')
  const [logData, setLogData] = useState<LogEntry[]>([])
  const [logTotal, setLogTotal] = useState(0)
  const [logPage, setLogPage] = useState(1)
  const [logTotalPages, setLogTotalPages] = useState(1)

  const filteredData = useMemo(() => {
    let source = showDeleted ? deletedData : mappingData.filter(m => !m._deleted)
    if (!manageSearch) return source
    if (searchExact) return source.filter(m => m.original === manageSearch || m.chinese === manageSearch)
    return source.filter(m => m.original.includes(manageSearch) || m.chinese.includes(manageSearch))
  }, [mappingData, deletedData, showDeleted, manageSearch, searchExact])

  const totalPages = Math.max(1, Math.ceil(filteredData.length / managePageSize))
  const safeCurrentPage = Math.min(currentPage, totalPages)

  async function fetchDeletedRecords() {
    try { setDeletedData(await Api.listDeleted()) } catch { /* ignore */ }
  }

  const startEdit = useCallback((idx: number) => {
    const item = filteredData[idx]
    if (!item) return
    setEditingGlobalIdx(idx)
    setEditOriginal(item.original)
    setEditChinese(item.chinese)
  }, [filteredData])

  const saveEdit = useCallback(() => {
    if (editingGlobalIdx === null) return
    const item = filteredData[editingGlobalIdx]
    if (!item) return
    const original = editOriginal.trim()
    const chinese = editChinese.trim()
    if (!original || !chinese) { message.warning('字段名和翻译不能为空'); return }
    if (original === item.original && chinese === item.chinese) { setEditingGlobalIdx(null); return }
    if (dataMode !== 'local' && !offlineMode && item._dbId) {
      Api.update(item._dbId, { original, chinese }).then(() => { message.success('已更新'); setEditingGlobalIdx(null); fetchDbMapping() }).catch(e => message.error(e.message))
      return
    }
    item.original = original; item.chinese = chinese
    setMappingData([...mappingData]); persistMapping()
    setEditingGlobalIdx(null); message.success('已保存')
  }, [editingGlobalIdx, editOriginal, editChinese, filteredData, mappingData, dataMode, offlineMode, dbUrl, persistMapping, fetchDbMapping, message])

  const deleteItem = useCallback((item: MappingItem) => {
    if (dataMode !== 'local' && !offlineMode && item._dbId) {
      Api.delete(item._dbId).then(() => { message.success('已删除'); fetchDbMapping(); if (showDeleted) fetchDeletedRecords() }).catch(e => message.error(e.message))
      return
    }
    item._deleted = true; setMappingData([...mappingData]); persistMapping()
    if (showDeleted) setDeletedData(dd => [...dd, item])
    message.success('已删除')
  }, [mappingData, dataMode, offlineMode, dbUrl, persistMapping, fetchDbMapping, showDeleted])

  const restoreItem = useCallback((item: MappingItem) => {
    if (dataMode !== 'local' && !offlineMode && item._dbId) {
      Api.restore(item._dbId).then(() => { message.success('已恢复'); fetchDbMapping(); fetchDeletedRecords() }).catch(e => message.error(e.message))
      return
    }
    item._deleted = false; setMappingData([...mappingData]); persistMapping()
    setDeletedData(dd => dd.filter(d => d._dbId !== item._dbId)); message.success('已恢复')
  }, [mappingData, dataMode, offlineMode, dbUrl, persistMapping, fetchDbMapping])

  const addItem = useCallback(() => {
    const original = addOriginal.trim(), chinese = addChinese.trim()
    if (!original || !chinese) { message.warning('字段名和翻译不能为空'); return }
    if (dataMode !== 'local' && !offlineMode) {
      Api.add({ original, chinese }).then(() => {
        message.success('已添加'); fetchDbMapping(); setAddOriginal(''); setAddChinese('')
        // 跳转到末页
        setCurrentPage(Math.max(1, Math.ceil((filteredData.length + 1) / managePageSize)))
      }).catch(e => message.error(e.message))
      return
    }
    setMappingData(prev => [...prev, { original, chinese }]); persistMapping()
    setAddOriginal(''); setAddChinese(''); message.success('已添加')
    // 跳转到末页
    setCurrentPage(Math.max(1, Math.ceil((filteredData.length + 1) / managePageSize)))
  }, [addOriginal, addChinese, dataMode, offlineMode, dbUrl, persistMapping, fetchDbMapping, message, filteredData, managePageSize])

  const applySearch = useCallback(() => { setManageSearch(manageSearchInput); setCurrentPage(1) }, [manageSearchInput])
  useEffect(() => { setCurrentPage(1) }, [manageSearch])
  useEffect(() => { if (searchExact !== undefined) applySearch() }, [searchExact]) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchLogs = useCallback(async (recordId?: number, fieldName?: string, page?: number) => {
    try {
      const usePage = page ?? logPage
      const res = await Api.logs(recordId, fieldName, usePage)
      setLogData(res.data); setLogTotal(res.total)
      setLogTotalPages(Math.max(1, Math.ceil(res.total / LOG_PAGE_SIZE)))
    } catch (e: any) { message.error(e.message) }
  }, [logPage, message])

  // 翻页时联动 fetchLogs
  const logPageChangedRef = useRef(false)
  const handleLogPageChange = useCallback((p: number) => {
    logPageChangedRef.current = true
    setLogPage(p)
  }, [])
  useEffect(() => {
    if (logPageChangedRef.current && logModalOpen && logRecordId != null) {
      logPageChangedRef.current = false
      fetchLogs(logRecordId ?? undefined, logFieldName || undefined)
    }
  }, [logPage]) // eslint-disable-line react-hooks/exhaustive-deps

  const confirmImportConflicts = useCallback(() => {
    if (!importConflicts) return
    let added = 0
    for (const c of importConflicts) {
      const idx = mappingData.findIndex(m => m.original === c.original && !m._deleted)
      if (idx >= 0) { mappingData[idx].chinese = c.incoming; added++ }
    }
    if (importNewItems.length > 0) { setMappingData(prev => [...prev, ...importNewItems]); added += importNewItems.length }
    setMappingData([...mappingData]); persistMapping()
    setImportConflicts(null); setImportNewItems([])
    message.success(`导入完成，共 ${added} 条`)
  }, [importConflicts, importNewItems, mappingData, dataMode, offlineMode, dbUrl, persistMapping, message])

  const handleExportMapping = useCallback(() => {
    exportMappingXLSX(mappingData.filter(m => !m._deleted), `字段翻译对照表_${timestamp()}.xlsx`)
  }, [mappingData])

  useEffect(() => { if (showDeleted) fetchDeletedRecords() }, [showDeleted])

  return {
    manageSearchInput, manageSearch, searchExact, currentPage, managePageSize,
    editingGlobalIdx, editOriginal, editChinese, addOriginal, addChinese,
    importConflicts, importNewItems, logModalOpen, logRecordId, logFieldName, logData, logTotal, logPage, logTotalPages,
    setManageSearchInput, setSearchExact, setManagePageSize, setEditingGlobalIdx, setEditOriginal, setEditChinese, setAddOriginal, setAddChinese,
    setImportConflicts, setImportNewItems, setLogModalOpen, setLogRecordId, setLogFieldName, setLogData, setLogTotal, setLogPage,
    startEdit, saveEdit, deleteItem, restoreItem, addItem, applySearch, fetchLogs, handleLogPageChange, confirmImportConflicts, handleExportMapping,
    filteredData, totalPages, safeCurrentPage,
  }
}
