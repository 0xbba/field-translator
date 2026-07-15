import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { Table, Typography } from 'antd'
import { Api } from '../api'
import { loadLedgerFromStorage, saveLedgerToStorage } from '../utils/storage'
import { parseLedgerText } from '../utils/ledger'
import type { LedgerRecord, LogEntry } from '../types'

import type { HookAPI as ModalAPI } from 'antd/es/modal/useModal'

export interface UseLedgerReturn {
  // 列表状态
  ledgerData: LedgerRecord[]
  ledgerTotal: number
  ledgerPage: number
  ledgerPageSize: number
  ledgerSearch: string
  ledgerSearchInput: string

  // 录入状态
  ledgerPasteText: string
  ledgerParsed: Omit<LedgerRecord, '_dbId' | '_deleted'> | null

  // 编辑状态
  ledgerEditOpen: boolean
  ledgerEditId: number | null
  ledgerEditRecord: LedgerRecord | null

  // 日志状态
  ledgerLogOpen: boolean
  ledgerLogRecordId: number | null
  ledgerLogFieldName: string
  ledgerLogData: LogEntry[]
  ledgerLogTotal: number
  ledgerLogPage: number
  ledgerLogTotalPages: number

  // 已删除
  showDeletedLedger: boolean
  deletedLedgerData: LedgerRecord[]

  // 提取记录
  extractionRecordCount: string
  extractionExtractor: string
  extractionSupervisor: string
  extractionRemark: string

  // 设置器
  setLedgerSearchInput: (v: string) => void
  setLedgerSearch: (v: string) => void
  setLedgerPage: (v: number) => void
  setLedgerPageSize: (v: number) => void
  setLedgerPasteText: (v: string) => void
  setLedgerParsed: (v: any) => void
  setLedgerEditOpen: (v: boolean) => void
  setLedgerEditId: (v: number | null) => void
  setLedgerEditRecord: (v: LedgerRecord | null) => void
  setLedgerLogOpen: (v: boolean) => void
  setLedgerLogRecordId: (v: number | null) => void
  setLedgerLogFieldName: (v: string) => void
  setLedgerLogData: (v: LogEntry[]) => void
  setLedgerLogTotal: (v: number) => void
  setLedgerLogPage: (v: number) => void
  setShowDeletedLedger: (v: boolean) => void
  setDeletedLedgerData: (d: LedgerRecord[]) => void
  setExtractionRecordCount: (v: string) => void
  setExtractionExtractor: (v: string) => void
  setExtractionSupervisor: (v: string) => void
  setExtractionRemark: (v: string) => void

  // 操作
  fetchLedger: () => Promise<void>
  markLedgerLoaded: () => void
  addLedgerRecord: () => Promise<void>
  deleteLedgerRecord: (record: LedgerRecord) => void
  updateLedgerRecord: (id: number, changes: Partial<LedgerRecord>) => void
  restoreLedgerRecord: (record: LedgerRecord) => void
  fetchLedgerLogs: (recordId?: number, fieldName?: string) => Promise<void>
  openLedgerLogModal: (recordId: number, fieldName?: string) => void
  setLedgerSortBy: (v: string | undefined) => void
  setLedgerSortOrder: (v: string | undefined) => void

  // 计算属性
  displayLedgerData: LedgerRecord[]
}

export function useLedger(
  dataMode: string,
  offlineMode: boolean,
  dbUrl: string,
  message: { success: (msg: string) => void; error: (msg: string) => void; warning: (msg: string) => void; info: (msg: string) => void },
  modal: ModalAPI,
): UseLedgerReturn {
  const [ledgerData, setLedgerData] = useState<LedgerRecord[]>([])
  const [ledgerTotal, setLedgerTotal] = useState(0)
  const [ledgerPage, setLedgerPage] = useState(1)
  const [ledgerPageSize, setLedgerPageSize] = useState(10)
  const [ledgerSearch, setLedgerSearch] = useState('')
  const [ledgerSearchInput, setLedgerSearchInput] = useState('')

  const [ledgerPasteText, setLedgerPasteText] = useState('')
  const [ledgerParsed, setLedgerParsed] = useState<Omit<LedgerRecord, '_dbId' | '_deleted'> | null>(null)

  const [ledgerEditOpen, setLedgerEditOpen] = useState(false)
  const [ledgerEditId, setLedgerEditId] = useState<number | null>(null)
  const [ledgerEditRecord, setLedgerEditRecord] = useState<LedgerRecord | null>(null)

  const [ledgerLogOpen, setLedgerLogOpen] = useState(false)
  const [ledgerLogRecordId, setLedgerLogRecordId] = useState<number | null>(null)
  const [ledgerLogFieldName, setLedgerLogFieldName] = useState('')
  const [ledgerLogData, setLedgerLogData] = useState<LogEntry[]>([])
  const [ledgerLogTotal, setLedgerLogTotal] = useState(0)
  const [ledgerLogPage, setLedgerLogPage] = useState(1)
  const [ledgerLogTotalPages, setLedgerLogTotalPages] = useState(1)

  const [showDeletedLedger, setShowDeletedLedger] = useState(false)
  const [deletedLedgerData, setDeletedLedgerData] = useState<LedgerRecord[]>([])

  const [extractionRecordCount, setExtractionRecordCount] = useState('')
  const [extractionExtractor, setExtractionExtractor] = useState('')
  const [extractionSupervisor, setExtractionSupervisor] = useState('')
  const [extractionRemark, setExtractionRemark] = useState('')

  // 排序状态
  const [ledgerSortBy, setLedgerSortBy] = useState<string | undefined>(undefined)
  const [ledgerSortOrder, setLedgerSortOrder] = useState<string | undefined>(undefined)

  const displayLedgerData = useMemo(() => {
    if (showDeletedLedger) return deletedLedgerData
    // 数据库模式下服务端已搜索过滤，直接返回；本地模式才做客户端过滤
    if (dataMode === 'database' && !offlineMode) return ledgerData.filter(r => !r._deleted)
    const list = ledgerData.filter(r => !r._deleted)
    if (!ledgerSearch) return list
    const s = ledgerSearch.toLowerCase()
    return list.filter(r =>
      (r.requestNo || '').toLowerCase().includes(s) ||
      (r.applicant || '').toLowerCase().includes(s) ||
      (r.applicantDept || '').toLowerCase().includes(s) ||
      (r.requestTitle || '').toLowerCase().includes(s) ||
      (r.processor || '').toLowerCase().includes(s)
    )
  }, [ledgerData, deletedLedgerData, showDeletedLedger, ledgerSearch, dataMode, offlineMode])

  const fetchLedger = useCallback(async () => {
    if (dataMode === 'local' || offlineMode) {
      const local = loadLedgerFromStorage()
      setLedgerData(local); setLedgerTotal(local.length); return
    }
    try {
      const res = await Api.ledgerList(ledgerSearch, ledgerPage, ledgerPageSize, ledgerSortBy, ledgerSortOrder)
      setLedgerData(res.data); setLedgerTotal(res.total)
    } catch (e: any) { if (!e.message?.includes('未登录')) message.error(e.message || '获取台账数据失败') }
  }, [dataMode, offlineMode, dbUrl, ledgerSearch, ledgerPage, ledgerPageSize, ledgerSortBy, ledgerSortOrder])

  const persistLocalLedger = useCallback(() => {
    saveLedgerToStorage(ledgerData.filter(r => !r._deleted))
  }, [ledgerData])

  const addLedgerRecord = useCallback(async () => {
    if (!ledgerParsed) return

    const parsedRequestNo = ledgerParsed.requestNo

    // ---- 提取记录逻辑：取数条数和取数人都不为空才插入（0条也是有效条数） ----
    const recordCountNum = parseInt(extractionRecordCount, 10)
    const hasExtraction = (extractionRecordCount.trim() !== '' && !isNaN(recordCountNum))
      && !!extractionExtractor.trim()

    // ---- 重复检测（在线 + 本地） ----
    let existing: LedgerRecord | null = null
    let deletedExisting: LedgerRecord | null = null

    if (dataMode === 'database' && !offlineMode) {
      try {
        const check = await Api.ledgerCheck(parsedRequestNo)
        if (check.exists && check.record) existing = check.record
        if (check.deletedRecord) deletedExisting = check.deletedRecord
      } catch { /* 检查失败则走正常插入 */ }
    } else {
      const found = ledgerData.find(r => r.requestNo === parsedRequestNo && !r._deleted)
      if (found) existing = found
      const deleted = ledgerData.find(r => r.requestNo === parsedRequestNo && r._deleted)
      if (deleted) deletedExisting = deleted
    }

    // ---- 如果不存在可见记录但存在已删除记录 → 弹窗确认恢复+diff ----
    if (!existing && deletedExisting && dataMode === 'database' && !offlineMode && deletedExisting._dbId) {
      const diffLabels: Record<string, string> = { requestTime: '申请时间', applicant: '申请员工', applicantPhone: '申请员工电话', applicantDept: '申请部门', requestTitle: '申请标题', requestReason: '申请事由', requestDataContent: '申请数据内容', processor: '处理人', finishTime: '完成时间' }
      const fields: Record<string, string> = {}
      for (const key of Object.keys(diffLabels)) {
        const newVal = (ledgerParsed as any)[key] ?? ''
        const oldVal = (deletedExisting as any)[key] ?? ''
        if (key === 'finishTime' && (!newVal || oldVal)) continue
        if ((key === 'requestTime' || key === 'finishTime') && oldVal && newVal) {
          const oldTs = new Date(oldVal).getTime()
          const newTs = new Date(newVal).getTime()
          if (!isNaN(oldTs) && !isNaN(newTs) && oldTs === newTs) continue
        }
        if (newVal !== oldVal && newVal !== '') fields[key] = newVal
      }

      const hasChanges = Object.keys(fields).length > 0
      const diffRows = Object.entries(fields).map(([k, v]) => ({
        key: k,
        field: diffLabels[k] || k,
        oldValue: (deletedExisting as any)[k] ?? '',
        newValue: v,
      }))

      const doRestore = async () => {
        try {
          await Api.ledgerRestore(deletedExisting._dbId!)
          if (hasChanges) {
            await Api.ledgerUpdate(deletedExisting._dbId!, fields as Partial<LedgerRecord>)
          }
          message.success(hasChanges ? '已恢复并更新台账记录' : '已恢复台账记录')

          // 写入提取记录
          if (hasExtraction) {
            try {
              await Api.extractionAdd(parsedRequestNo, recordCountNum, extractionExtractor, extractionSupervisor, extractionRemark)
              message.success('提取记录已登记')
            } catch (e: any) { message.error(e.message || '提取记录登记失败') }
          }

          fetchLedger(); if (showDeletedLedger) fetchDeletedL()
          setLedgerParsed(null); setLedgerPasteText('')
          setExtractionRecordCount(''); setExtractionExtractor(''); setExtractionSupervisor(''); setExtractionRemark('')
        } catch (e: any) {
          message.error(e.message || '恢复记录失败')
        }
      }

      // 弹窗显示变更情况
      modal.confirm({
        title: `数据单号 ${parsedRequestNo} 已存在（已删除）`,
        content: (
          <div>
            <p style={{ marginBottom: 8 }}>该单号在已删除记录中存在，是否恢复？</p>
            {hasChanges && (
              <Table size="small" pagination={false} dataSource={diffRows} rowKey="key" columns={[
                { title: '变更字段', dataIndex: 'field', width: 100 },
                { title: '旧值', dataIndex: 'oldValue', width: 200, render: (v: string) => <Typography.Text type="secondary" style={{ wordBreak: 'break-all' }}>{v || '-'}</Typography.Text> },
                { title: '新值', dataIndex: 'newValue', width: 200, render: (v: string) => <span style={{ wordBreak: 'break-all' }}>{v || '-'}</span> },
              ]} />
            )}
          </div>
        ),
        okText: hasChanges ? '恢复并更新' : '恢复',
        cancelText: '取消',
        width: 600,
        onOk: doRestore,
      })
      return
    }

    // ---- 可见记录已存在 → 变动字段更新 ----
    if (existing) {
      // 比较变动字段（排除 requestNo 本身）
      const diffLabels: Record<string, string> = { requestTime: '申请时间', applicant: '申请员工', applicantPhone: '申请员工电话', applicantDept: '申请部门', requestTitle: '申请标题', requestReason: '申请事由', requestDataContent: '申请数据内容', processor: '处理人', finishTime: '完成时间' }
      const fields: Record<string, string> = {}
      for (const key of Object.keys(diffLabels)) {
        const newVal = (ledgerParsed as any)[key] ?? ''
        const oldVal = (existing as any)[key] ?? ''
        // finishTime：空值不覆盖；数据库已有值不覆盖（避免NOW()与实际完成时间差几秒反复提示）
        if (key === 'finishTime' && (!newVal || oldVal)) continue
        // 时间字段：比较时间戳，相同则跳过（数据库存UTC，解析出本地时间，字符串不同但时刻相同）
        if ((key === 'requestTime' || key === 'finishTime') && oldVal && newVal) {
          const oldTs = new Date(oldVal).getTime()
          const newTs = new Date(newVal).getTime()
          if (!isNaN(oldTs) && !isNaN(newTs) && oldTs === newTs) continue
        }
        if (newVal !== oldVal && newVal !== '') fields[key] = newVal
      }

      if (Object.keys(fields).length === 0 && !hasExtraction) {
        message.info('该单号已存在，且无变动字段')
        return
      }

      // 无变动但有提取记录 → 直接登记提取记录，不弹台账更新窗
      if (Object.keys(fields).length === 0 && hasExtraction) {
        if (dataMode !== 'local' && !offlineMode) {
          try {
            await Api.extractionAdd(parsedRequestNo, recordCountNum, extractionExtractor, extractionSupervisor)
            message.success('提取记录已登记')
          } catch (e: any) { message.error(e.message || '提取记录登记失败') }
        }
        setLedgerParsed(null); setLedgerPasteText('')
        setExtractionRecordCount(''); setExtractionExtractor(''); setExtractionSupervisor(''); setExtractionRemark('')
        return
      }

      // 有变动 → 弹窗确认
      const diffRows = Object.entries(fields).map(([k, v]) => ({
        key: k,
        field: diffLabels[k] || k,
        oldValue: (existing as any)[k] ?? '',
        newValue: v,
      }))

      modal.confirm({
        title: `数据单号 ${existing.requestNo} 已存在`,
        content: (
          <div>
            {diffRows.length > 0 && (
              <>
                <p style={{ marginBottom: 8 }}>以下字段有变动，是否更新？</p>
                <Table size="small" pagination={false} dataSource={diffRows} rowKey="key" columns={[
                  { title: '变更字段', dataIndex: 'field', width: 100 },
                  { title: '旧值', dataIndex: 'oldValue', width: 200, render: (v: string) => <Typography.Text type="secondary" style={{ wordBreak: 'break-all' }}>{v || '-'}</Typography.Text> },
                  { title: '新值', dataIndex: 'newValue', width: 200, render: (v: string) => <span style={{ wordBreak: 'break-all' }}>{v || '-'}</span> },
                ]} />
              </>
            )}
          </div>
        ),
        okText: '更新变动字段',
        cancelText: '取消',
        width: 600,
        onOk: async () => {
          if (existing!._dbId && dataMode !== 'local' && !offlineMode) {
            try {
              if (Object.keys(fields).length > 0) {
                await Api.ledgerUpdate(existing!._dbId, fields as Partial<LedgerRecord>)
              }
              message.success('已更新'); fetchLedger()
            } catch (e: any) { message.error(e.message || '更新失败') }
          } else {
            // 本地模式：直接更新
            if (Object.keys(fields).length > 0) {
              setLedgerData(prev => prev.map(r => r.requestNo === existing!.requestNo ? { ...r, ...fields } : r))
              persistLocalLedger()
            }
            message.success('已更新')
          }
          // 写入提取记录
          if (hasExtraction && dataMode !== 'local' && !offlineMode) {
            try {
              await Api.extractionAdd(parsedRequestNo, recordCountNum, extractionExtractor, extractionSupervisor, extractionRemark)
              message.success('提取记录已登记')
            } catch (e: any) { message.error(e.message || '提取记录登记失败') }
          }
          setLedgerParsed(null); setLedgerPasteText('')
          setExtractionRecordCount(''); setExtractionExtractor(''); setExtractionSupervisor(''); setExtractionRemark('')
        },
      })
      return
    }

    // ---- 不重复：正常写入 ----
    // finishTime：解析出的值（数据需求承接人环节完成时间），否则留空让数据库 DEFAULT NOW()
    const parsedFinishTime = ledgerParsed.finishTime || ''
    if (dataMode === 'local' || offlineMode) {
      const newRecord = { ...ledgerParsed, processor: ledgerParsed.processor || '', finishTime: parsedFinishTime || new Date().toLocaleString('zh-CN') } as LedgerRecord
      setLedgerData(prev => [newRecord, ...prev]); persistLocalLedger()
      setLedgerParsed(null); setLedgerPasteText(''); message.success('已写入台账')
      setExtractionRecordCount(''); setExtractionExtractor(''); setExtractionSupervisor(''); setExtractionRemark('')
      return
    }
    try {
      await Api.ledgerAdd({ ...ledgerParsed, processor: ledgerParsed.processor || '', finishTime: parsedFinishTime })
      // 写入提取记录
      if (hasExtraction) {
        try {
          await Api.extractionAdd(parsedRequestNo, recordCountNum, extractionExtractor, extractionSupervisor)
          message.success('已写入台账，提取记录已登记')
        } catch (e: any) {
          message.success('已写入台账'); message.error(e.message || '提取记录登记失败')
        }
      } else {
        message.success('已写入台账')
      }
      fetchLedger()
      setLedgerParsed(null); setLedgerPasteText('')
      setExtractionRecordCount(''); setExtractionExtractor(''); setExtractionSupervisor(''); setExtractionRemark('')
    } catch (e: any) { message.error(e.message || '写入失败') }
  }, [ledgerParsed, dataMode, offlineMode, dbUrl, fetchLedger, persistLocalLedger, message, modal, ledgerData, extractionRecordCount, extractionExtractor, extractionSupervisor])

  const deleteLedgerRecord = useCallback((record: LedgerRecord) => {
    if (dataMode !== 'local' && !offlineMode && record._dbId) {
      Api.ledgerDelete(record._dbId).then(() => { message.success('已删除'); fetchLedger(); if (showDeletedLedger) fetchDeletedL() }).catch(e => message.error(e.message))
      return
    }
    record._deleted = true; setLedgerData([...ledgerData]); persistLocalLedger()
    if (showDeletedLedger) setDeletedLedgerData(dd => [...dd, record])
    message.success('已删除')
  }, [ledgerData, dataMode, offlineMode, dbUrl, persistLocalLedger, fetchLedger, showDeletedLedger])

  const updateLedgerRecord = useCallback((id: number, changes: Partial<LedgerRecord>) => {
    if (dataMode !== 'local' && !offlineMode) {
      Api.ledgerUpdate(id, changes).then(() => { message.success('已更新'); fetchLedger() }).catch(e => message.error(e.message))
      return
    }
    setLedgerData(prev => prev.map(r => r._dbId === id ? { ...r, ...changes } : r)); persistLocalLedger(); message.success('已保存')
  }, [ledgerData, dataMode, offlineMode, persistLocalLedger, fetchLedger, message])

  const restoreLedgerRecord = useCallback((record: LedgerRecord) => {
    if (dataMode !== 'local' && !offlineMode && record._dbId) {
      Api.ledgerRestore(record._dbId).then(() => { message.success('已恢复'); fetchLedger(); fetchDeletedL() }).catch(e => message.error(e.message))
      return
    }
    record._deleted = false; setLedgerData([...ledgerData]); persistLocalLedger()
    setDeletedLedgerData(dd => dd.filter(d => d._dbId !== record._dbId)); message.success('已恢复')
  }, [ledgerData, dataMode, offlineMode, persistLocalLedger, fetchLedger])

  const fetchLedgerLogs = useCallback(async (recordId?: number, fieldName?: string) => {
    try {
      const res = await Api.ledgerLogs(recordId, fieldName, ledgerLogPage)
      setLedgerLogData(res.data); setLedgerLogTotal(res.total)
      setLedgerLogTotalPages(Math.max(1, Math.ceil(res.total / 10)))
    } catch (e: any) { message.error(e.message) }
  }, [ledgerLogPage, message])

  const openLedgerLogModal = useCallback((recordId: number, fieldName?: string) => {
    setLedgerLogRecordId(recordId); setLedgerLogFieldName(fieldName || ''); setLedgerLogPage(1); setLedgerLogOpen(true); fetchLedgerLogs(recordId, fieldName)
  }, [fetchLedgerLogs])

  async function fetchDeletedL() {
    try { setDeletedLedgerData(await Api.ledgerListDeleted()) } catch (e: any) { message.error(e.message || '获取已删除台账失败') }
  }

  // 翻页/搜索/页大小时重新加载（首次由外部切页时触发）
  const ledgerLoadedRef = useRef(false)
  useEffect(() => {
    if (ledgerLoadedRef.current) fetchLedger()
  }, [ledgerPage, ledgerPageSize, ledgerSearch, ledgerSortBy, ledgerSortOrder]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (showDeletedLedger) fetchDeletedL() }, [showDeletedLedger])

  /** 标记已加载（外部首次切页调用后设置） */
  const markLedgerLoaded = useCallback(() => { ledgerLoadedRef.current = true }, [])

  // 解析粘贴文本
  useEffect(() => {
    if (!ledgerPasteText.trim()) { setLedgerParsed(null); return }
    setLedgerParsed(parseLedgerText(ledgerPasteText))
    // 重新解析时清空提取记录的临时填写
    setExtractionRecordCount('')
    setExtractionSupervisor('')
    setExtractionRemark('')
  }, [ledgerPasteText])

  return {
    ledgerData, ledgerTotal, ledgerPage, ledgerPageSize, ledgerSearch, ledgerSearchInput,
    ledgerPasteText, ledgerParsed,
    ledgerEditOpen, ledgerEditId, ledgerEditRecord,
    ledgerLogOpen, ledgerLogRecordId, ledgerLogFieldName, ledgerLogData, ledgerLogTotal, ledgerLogPage, ledgerLogTotalPages,
    showDeletedLedger, deletedLedgerData,
    extractionRecordCount, extractionExtractor, extractionSupervisor, extractionRemark,
    setLedgerSearchInput, setLedgerSearch, setLedgerPage, setLedgerPageSize, setLedgerPasteText, setLedgerParsed, setLedgerEditOpen, setLedgerEditId, setLedgerEditRecord,
    setLedgerLogOpen, setLedgerLogRecordId, setLedgerLogFieldName, setLedgerLogData, setLedgerLogTotal, setLedgerLogPage,
    setShowDeletedLedger, setDeletedLedgerData,
    setExtractionRecordCount, setExtractionExtractor, setExtractionSupervisor, setExtractionRemark,
    fetchLedger, markLedgerLoaded, addLedgerRecord, deleteLedgerRecord, updateLedgerRecord, restoreLedgerRecord, fetchLedgerLogs, openLedgerLogModal,
    setLedgerSortBy, setLedgerSortOrder,
    displayLedgerData,
  }
}
