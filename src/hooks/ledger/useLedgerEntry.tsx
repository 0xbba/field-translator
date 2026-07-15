import { useState, useCallback, useEffect } from 'react'
import { Table, Typography } from 'antd'
import { Api } from '../../api'
import { parseLedgerText } from '../../utils/ledger'
import type { LedgerRecord } from '../../types'
import type { HookAPI as ModalAPI } from 'antd/es/modal/useModal'
import { computeDiff, DIFF_LABELS } from './diff'
import type { UseLedgerListReturn } from './useLedgerList'

type Message = { success: (msg: string) => void; error: (msg: string) => void; warning: (msg: string) => void; info: (msg: string) => void }

export interface UseLedgerEntryReturn {
  ledgerPasteText: string
  ledgerParsed: Omit<LedgerRecord, '_dbId' | '_deleted'> | null
  extractionRecordCount: string
  extractionExtractor: string
  extractionSupervisor: string
  extractionRemark: string
  ledgerEditOpen: boolean
  ledgerEditId: number | null
  ledgerEditRecord: LedgerRecord | null
  setLedgerPasteText: (v: string) => void
  setLedgerParsed: (v: any) => void
  setLedgerEditOpen: (v: boolean) => void
  setLedgerEditId: (v: number | null) => void
  setLedgerEditRecord: (v: LedgerRecord | null) => void
  setExtractionRecordCount: (v: string) => void
  setExtractionExtractor: (v: string) => void
  setExtractionSupervisor: (v: string) => void
  setExtractionRemark: (v: string) => void
  addLedgerRecord: () => Promise<void>
  deleteLedgerRecord: (record: LedgerRecord) => void
  updateLedgerRecord: (id: number, changes: Partial<LedgerRecord>) => void
  restoreLedgerRecord: (record: LedgerRecord) => void
}

function clearExtraction(setters: {
  setExtractionRecordCount: (v: string) => void
  setExtractionExtractor: (v: string) => void
  setExtractionSupervisor: (v: string) => void
  setExtractionRemark: (v: string) => void
}) {
  setters.setExtractionRecordCount('')
  setters.setExtractionExtractor('')
  setters.setExtractionSupervisor('')
  setters.setExtractionRemark('')
}

export function useLedgerEntry(
  dataMode: string,
  offlineMode: boolean,
  dbUrl: string,
  message: Message,
  modal: ModalAPI,
  listReturn: UseLedgerListReturn,
): UseLedgerEntryReturn {
  const [ledgerPasteText, setLedgerPasteText] = useState('')
  const [ledgerParsed, setLedgerParsed] = useState<Omit<LedgerRecord, '_dbId' | '_deleted'> | null>(null)
  const [extractionRecordCount, setExtractionRecordCount] = useState('')
  const [extractionExtractor, setExtractionExtractor] = useState('')
  const [extractionSupervisor, setExtractionSupervisor] = useState('')
  const [extractionRemark, setExtractionRemark] = useState('')
  const [ledgerEditOpen, setLedgerEditOpen] = useState(false)
  const [ledgerEditId, setLedgerEditId] = useState<number | null>(null)
  const [ledgerEditRecord, setLedgerEditRecord] = useState<LedgerRecord | null>(null)

  const { fetchLedger, fetchDeletedL, persistLocalLedger, ledgerData, showDeletedLedger, setDeletedLedgerData, setLedgerData } = listReturn

  // 解析粘贴文本
  useEffect(() => {
    if (!ledgerPasteText.trim()) { setLedgerParsed(null); return }
    setLedgerParsed(parseLedgerText(ledgerPasteText))
    setExtractionRecordCount('')
    setExtractionSupervisor('')
    setExtractionRemark('')
  }, [ledgerPasteText])

  const extractionSetters = { setExtractionRecordCount, setExtractionExtractor, setExtractionSupervisor, setExtractionRemark }

  const addLedgerRecord = useCallback(async () => {
    if (!ledgerParsed) return

    const parsedRequestNo = ledgerParsed.requestNo
    const recordCountNum = parseInt(extractionRecordCount, 10)
    const hasExtraction = (extractionRecordCount.trim() !== '' && !isNaN(recordCountNum)) && !!extractionExtractor.trim()

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

    // ---- 已删除记录恢复+diff ----
    if (!existing && deletedExisting && dataMode === 'database' && !offlineMode && deletedExisting._dbId) {
      const fields = computeDiff(ledgerParsed, deletedExisting)
      const hasChanges = Object.keys(fields).length > 0
      const diffRows = Object.entries(fields).map(([k, v]) => ({
        key: k, field: DIFF_LABELS[k] || k,
        oldValue: (deletedExisting as any)[k] ?? '', newValue: v,
      }))

      const doRestore = async () => {
        try {
          await Api.ledgerRestore(deletedExisting._dbId!)
          if (hasChanges) await Api.ledgerUpdate(deletedExisting._dbId!, fields as Partial<LedgerRecord>)
          message.success(hasChanges ? '已恢复并更新台账记录' : '已恢复台账记录')
          if (hasExtraction) {
            try {
              await Api.extractionAdd(parsedRequestNo, recordCountNum, extractionExtractor, extractionSupervisor, extractionRemark)
              message.success('提取记录已登记')
            } catch (e: any) { message.error(e.message || '提取记录登记失败') }
          }
          fetchLedger(); if (showDeletedLedger) fetchDeletedL()
          setLedgerParsed(null); setLedgerPasteText('')
          clearExtraction(extractionSetters)
        } catch (e: any) { message.error(e.message || '恢复记录失败') }
      }

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
      const fields = computeDiff(ledgerParsed, existing)

      if (Object.keys(fields).length === 0 && !hasExtraction) {
        message.info('该单号已存在，且无变动字段')
        return
      }

      if (Object.keys(fields).length === 0 && hasExtraction) {
        if (dataMode !== 'local' && !offlineMode) {
          try {
            await Api.extractionAdd(parsedRequestNo, recordCountNum, extractionExtractor, extractionSupervisor, extractionRemark)
            message.success('提取记录已登记')
          } catch (e: any) { message.error(e.message || '提取记录登记失败') }
        }
        setLedgerParsed(null); setLedgerPasteText('')
        clearExtraction(extractionSetters)
        return
      }

      const diffRows = Object.entries(fields).map(([k, v]) => ({
        key: k, field: DIFF_LABELS[k] || k,
        oldValue: (existing as any)[k] ?? '', newValue: v,
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
              if (Object.keys(fields).length > 0) await Api.ledgerUpdate(existing!._dbId, fields as Partial<LedgerRecord>)
              message.success('已更新'); fetchLedger()
            } catch (e: any) { message.error(e.message || '更新失败') }
          } else {
            if (Object.keys(fields).length > 0) {
              setLedgerData(prev => prev.map(r => r.requestNo === existing!.requestNo ? { ...r, ...fields } : r))
              persistLocalLedger()
            }
            message.success('已更新')
          }
          if (hasExtraction && dataMode !== 'local' && !offlineMode) {
            try {
              await Api.extractionAdd(parsedRequestNo, recordCountNum, extractionExtractor, extractionSupervisor, extractionRemark)
              message.success('提取记录已登记')
            } catch (e: any) { message.error(e.message || '提取记录登记失败') }
          }
          setLedgerParsed(null); setLedgerPasteText('')
          clearExtraction(extractionSetters)
        },
      })
      return
    }

    // ---- 不重复：正常写入 ----
    const parsedFinishTime = ledgerParsed.finishTime || ''
    if (dataMode === 'local' || offlineMode) {
      const newRecord = { ...ledgerParsed, processor: ledgerParsed.processor || '', finishTime: parsedFinishTime || new Date().toLocaleString('zh-CN') } as LedgerRecord
      setLedgerData(prev => [newRecord, ...prev]); persistLocalLedger()
      setLedgerParsed(null); setLedgerPasteText(''); message.success('已写入台账')
      clearExtraction(extractionSetters)
      return
    }
    try {
      await Api.ledgerAdd({ ...ledgerParsed, processor: ledgerParsed.processor || '', finishTime: parsedFinishTime })
      if (hasExtraction) {
        try {
          await Api.extractionAdd(parsedRequestNo, recordCountNum, extractionExtractor, extractionSupervisor, extractionRemark)
          message.success('已写入台账，提取记录已登记')
        } catch (e: any) {
          message.success('已写入台账'); message.error(e.message || '提取记录登记失败')
        }
      } else {
        message.success('已写入台账')
      }
      fetchLedger()
      setLedgerParsed(null); setLedgerPasteText('')
      clearExtraction(extractionSetters)
    } catch (e: any) { message.error(e.message || '写入失败') }
  }, [ledgerParsed, dataMode, offlineMode, dbUrl, fetchLedger, persistLocalLedger, message, modal, ledgerData, extractionRecordCount, extractionExtractor, extractionSupervisor, extractionRemark, showDeletedLedger, fetchDeletedL, setLedgerData])

  const deleteLedgerRecord = useCallback((record: LedgerRecord) => {
    if (dataMode !== 'local' && !offlineMode && record._dbId) {
      Api.ledgerDelete(record._dbId).then(() => { message.success('已删除'); fetchLedger(); if (showDeletedLedger) fetchDeletedL() }).catch(e => message.error(e.message))
      return
    }
    setLedgerData(prev => prev.map(r => r === record ? { ...r, _deleted: true } : r)); persistLocalLedger()
    if (showDeletedLedger) setDeletedLedgerData(dd => [...dd, { ...record, _deleted: true }])
    message.success('已删除')
  }, [ledgerData, dataMode, offlineMode, persistLocalLedger, fetchLedger, showDeletedLedger, fetchDeletedL, setDeletedLedgerData, setLedgerData])

  const updateLedgerRecord = useCallback((id: number, changes: Partial<LedgerRecord>) => {
    if (dataMode !== 'local' && !offlineMode) {
      Api.ledgerUpdate(id, changes).then(() => { message.success('已更新'); fetchLedger() }).catch(e => message.error(e.message))
      return
    }
    setLedgerData(prev => prev.map(r => r._dbId === id ? { ...r, ...changes } : r)); persistLocalLedger(); message.success('已保存')
  }, [ledgerData, dataMode, offlineMode, persistLocalLedger, fetchLedger, message, setLedgerData])

  const restoreLedgerRecord = useCallback((record: LedgerRecord) => {
    if (dataMode !== 'local' && !offlineMode && record._dbId) {
      Api.ledgerRestore(record._dbId).then(() => { message.success('已恢复'); fetchLedger(); fetchDeletedL() }).catch(e => message.error(e.message))
      return
    }
    setLedgerData(prev => prev.map(r => r === record ? { ...r, _deleted: false } : r)); persistLocalLedger()
    setDeletedLedgerData(dd => dd.filter(d => d._dbId !== record._dbId)); message.success('已恢复')
  }, [ledgerData, dataMode, offlineMode, persistLocalLedger, fetchLedger, fetchDeletedL, setDeletedLedgerData, setLedgerData])

  return {
    ledgerPasteText, ledgerParsed,
    extractionRecordCount, extractionExtractor, extractionSupervisor, extractionRemark,
    ledgerEditOpen, ledgerEditId, ledgerEditRecord,
    setLedgerPasteText, setLedgerParsed, setLedgerEditOpen, setLedgerEditId, setLedgerEditRecord,
    setExtractionRecordCount, setExtractionExtractor, setExtractionSupervisor, setExtractionRemark,
    addLedgerRecord, deleteLedgerRecord, updateLedgerRecord, restoreLedgerRecord,
  }
}
