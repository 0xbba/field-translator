import { useState, useCallback } from 'react'
import { Api } from '../../api'
import type { LogEntry } from '../../types'

type Message = { success: (msg: string) => void; error: (msg: string) => void; warning: (msg: string) => void; info: (msg: string) => void }

export interface UseLedgerLogReturn {
  ledgerLogOpen: boolean
  ledgerLogRecordId: number | null
  ledgerLogFieldName: string
  ledgerLogData: LogEntry[]
  ledgerLogTotal: number
  ledgerLogPage: number
  ledgerLogTotalPages: number
  setLedgerLogOpen: (v: boolean) => void
  setLedgerLogRecordId: (v: number | null) => void
  setLedgerLogFieldName: (v: string) => void
  setLedgerLogData: (v: LogEntry[]) => void
  setLedgerLogTotal: (v: number) => void
  setLedgerLogPage: (v: number) => void
  fetchLedgerLogs: (recordId?: number, fieldName?: string) => Promise<void>
  openLedgerLogModal: (recordId: number, fieldName?: string) => void
}

export function useLedgerLog(message: Message): UseLedgerLogReturn {
  const [ledgerLogOpen, setLedgerLogOpen] = useState(false)
  const [ledgerLogRecordId, setLedgerLogRecordId] = useState<number | null>(null)
  const [ledgerLogFieldName, setLedgerLogFieldName] = useState('')
  const [ledgerLogData, setLedgerLogData] = useState<LogEntry[]>([])
  const [ledgerLogTotal, setLedgerLogTotal] = useState(0)
  const [ledgerLogPage, setLedgerLogPage] = useState(1)
  const [ledgerLogTotalPages, setLedgerLogTotalPages] = useState(1)

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

  return {
    ledgerLogOpen, ledgerLogRecordId, ledgerLogFieldName, ledgerLogData, ledgerLogTotal, ledgerLogPage, ledgerLogTotalPages,
    setLedgerLogOpen, setLedgerLogRecordId, setLedgerLogFieldName, setLedgerLogData, setLedgerLogTotal, setLedgerLogPage,
    fetchLedgerLogs, openLedgerLogModal,
  }
}
