import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { Api } from '../../api'
import { loadLedgerFromStorage, saveLedgerToStorage } from '../../utils/storage'
import type { LedgerRecord } from '../../types'

type Message = { success: (msg: string) => void; error: (msg: string) => void; warning: (msg: string) => void; info: (msg: string) => void }

export interface UseLedgerListReturn {
  ledgerData: LedgerRecord[]
  ledgerTotal: number
  ledgerPage: number
  ledgerPageSize: number
  ledgerSearch: string
  ledgerSearchInput: string
  showDeletedLedger: boolean
  deletedLedgerData: LedgerRecord[]
  ledgerSortBy: string | undefined
  ledgerSortOrder: string | undefined
  displayLedgerData: LedgerRecord[]
  setLedgerSearchInput: (v: string) => void
  setLedgerSearch: (v: string) => void
  setLedgerPage: (v: number) => void
  setLedgerPageSize: (v: number) => void
  setShowDeletedLedger: (v: boolean) => void
  setDeletedLedgerData: React.Dispatch<React.SetStateAction<LedgerRecord[]>>
  setLedgerData: React.Dispatch<React.SetStateAction<LedgerRecord[]>>
  setLedgerSortBy: (v: string | undefined) => void
  setLedgerSortOrder: (v: string | undefined) => void
  fetchLedger: () => Promise<void>
  markLedgerLoaded: () => void
  fetchDeletedL: () => Promise<void>
  persistLocalLedger: () => void
}

export function useLedgerList(
  dataMode: string,
  offlineMode: boolean,
  dbUrl: string,
  message: Message,
): UseLedgerListReturn {
  const [ledgerData, setLedgerData] = useState<LedgerRecord[]>([])
  const [ledgerTotal, setLedgerTotal] = useState(0)
  const [ledgerPage, setLedgerPage] = useState(1)
  const [ledgerPageSize, setLedgerPageSize] = useState(10)
  const [ledgerSearch, setLedgerSearch] = useState('')
  const [ledgerSearchInput, setLedgerSearchInput] = useState('')
  const [showDeletedLedger, setShowDeletedLedger] = useState(false)
  const [deletedLedgerData, setDeletedLedgerData] = useState<LedgerRecord[]>([])
  const [ledgerSortBy, setLedgerSortBy] = useState<string | undefined>(undefined)
  const [ledgerSortOrder, setLedgerSortOrder] = useState<string | undefined>(undefined)

  const displayLedgerData = useMemo(() => {
    if (showDeletedLedger) return deletedLedgerData
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

  const fetchDeletedL = useCallback(async () => {
    try { setDeletedLedgerData(await Api.ledgerListDeleted()) } catch (e: any) { message.error(e.message || '获取已删除台账失败') }
  }, [message])

  const ledgerLoadedRef = useRef(false)
  useEffect(() => {
    if (ledgerLoadedRef.current) fetchLedger()
  }, [ledgerPage, ledgerPageSize, ledgerSearch, ledgerSortBy, ledgerSortOrder]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (showDeletedLedger) fetchDeletedL() }, [showDeletedLedger]) // eslint-disable-line react-hooks/exhaustive-deps

  const markLedgerLoaded = useCallback(() => { ledgerLoadedRef.current = true }, [])

  return {
    ledgerData, ledgerTotal, ledgerPage, ledgerPageSize, ledgerSearch, ledgerSearchInput,
    showDeletedLedger, deletedLedgerData, ledgerSortBy, ledgerSortOrder, displayLedgerData,
    setLedgerSearchInput, setLedgerSearch, setLedgerPage, setLedgerPageSize,
    setShowDeletedLedger, setDeletedLedgerData, setLedgerData,
    setLedgerSortBy, setLedgerSortOrder,
    fetchLedger, markLedgerLoaded, fetchDeletedL, persistLocalLedger,
  }
}
