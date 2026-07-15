import type { LedgerRecord, LogEntry } from '../types'
import type { HookAPI as ModalAPI } from 'antd/es/modal/useModal'
import { useLedgerList } from './ledger/useLedgerList'
import { useLedgerEntry } from './ledger/useLedgerEntry'
import { useLedgerLog } from './ledger/useLedgerLog'

type Message = { success: (msg: string) => void; error: (msg: string) => void; warning: (msg: string) => void; info: (msg: string) => void }

// 保持原有接口完全不变，调用方无需修改
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
  message: Message,
  modal: ModalAPI,
): UseLedgerReturn {
  const list = useLedgerList(dataMode, offlineMode, dbUrl, message)
  const entry = useLedgerEntry(dataMode, offlineMode, dbUrl, message, modal, list)
  const log = useLedgerLog(message)

  return {
    // 列表
    ledgerData: list.ledgerData,
    ledgerTotal: list.ledgerTotal,
    ledgerPage: list.ledgerPage,
    ledgerPageSize: list.ledgerPageSize,
    ledgerSearch: list.ledgerSearch,
    ledgerSearchInput: list.ledgerSearchInput,
    setLedgerSearchInput: list.setLedgerSearchInput,
    setLedgerSearch: list.setLedgerSearch,
    setLedgerPage: list.setLedgerPage,
    setLedgerPageSize: list.setLedgerPageSize,
    setLedgerSortBy: list.setLedgerSortBy,
    setLedgerSortOrder: list.setLedgerSortOrder,
    displayLedgerData: list.displayLedgerData,
    fetchLedger: list.fetchLedger,
    markLedgerLoaded: list.markLedgerLoaded,

    // 已删除
    showDeletedLedger: list.showDeletedLedger,
    deletedLedgerData: list.deletedLedgerData,
    setShowDeletedLedger: list.setShowDeletedLedger,
    setDeletedLedgerData: list.setDeletedLedgerData,

    // 录入
    ledgerPasteText: entry.ledgerPasteText,
    ledgerParsed: entry.ledgerParsed,
    setLedgerPasteText: entry.setLedgerPasteText,
    setLedgerParsed: entry.setLedgerParsed,
    addLedgerRecord: entry.addLedgerRecord,

    // 提取记录
    extractionRecordCount: entry.extractionRecordCount,
    extractionExtractor: entry.extractionExtractor,
    extractionSupervisor: entry.extractionSupervisor,
    extractionRemark: entry.extractionRemark,
    setExtractionRecordCount: entry.setExtractionRecordCount,
    setExtractionExtractor: entry.setExtractionExtractor,
    setExtractionSupervisor: entry.setExtractionSupervisor,
    setExtractionRemark: entry.setExtractionRemark,

    // 编辑/CRUD
    ledgerEditOpen: entry.ledgerEditOpen,
    ledgerEditId: entry.ledgerEditId,
    ledgerEditRecord: entry.ledgerEditRecord,
    setLedgerEditOpen: entry.setLedgerEditOpen,
    setLedgerEditId: entry.setLedgerEditId,
    setLedgerEditRecord: entry.setLedgerEditRecord,
    deleteLedgerRecord: entry.deleteLedgerRecord,
    updateLedgerRecord: entry.updateLedgerRecord,
    restoreLedgerRecord: entry.restoreLedgerRecord,

    // 日志
    ledgerLogOpen: log.ledgerLogOpen,
    ledgerLogRecordId: log.ledgerLogRecordId,
    ledgerLogFieldName: log.ledgerLogFieldName,
    ledgerLogData: log.ledgerLogData,
    ledgerLogTotal: log.ledgerLogTotal,
    ledgerLogPage: log.ledgerLogPage,
    ledgerLogTotalPages: log.ledgerLogTotalPages,
    setLedgerLogOpen: log.setLedgerLogOpen,
    setLedgerLogRecordId: log.setLedgerLogRecordId,
    setLedgerLogFieldName: log.setLedgerLogFieldName,
    setLedgerLogData: log.setLedgerLogData,
    setLedgerLogTotal: log.setLedgerLogTotal,
    setLedgerLogPage: log.setLedgerLogPage,
    fetchLedgerLogs: log.fetchLedgerLogs,
    openLedgerLogModal: log.openLedgerLogModal,
  }
}
