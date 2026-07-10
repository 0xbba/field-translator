import { useEffect, useRef, useState } from 'react'
import { Typography, Button, Divider, Input, Table, Switch, Tooltip, Popconfirm, Modal, Tag, AutoComplete, Collapse } from 'antd'
import { HddOutlined, ReloadOutlined, DownloadOutlined, EditOutlined, FileTextOutlined, DeleteOutlined, DatabaseOutlined, UndoOutlined, PlusOutlined, UpOutlined } from '@ant-design/icons'
import * as XLSX from 'xlsx'
import dayjs from 'dayjs'
import type { UseLedgerReturn } from '../../hooks/useLedger'
import type { LedgerRecord, LogEntry, ExtractionRecord } from '../../types'
import { LEDGER_FIELDS, LOG_PAGE_SIZE, PAGE_SIZE_OPTIONS } from '../../constants'
import { formatLogValue, timestamp } from '../../utils/format'
import { useAppContext } from '../../contexts/AppContext'
import { Api } from '../../api'

interface LedgerManagePageProps {
  ledgerHook: UseLedgerReturn
}

export default function LedgerManagePage({ ledgerHook }: LedgerManagePageProps) {
  const { hasPerm, dataMode, offlineMode, dbLoading, message, currentUser } = useAppContext()

  const {
    ledgerData, ledgerTotal, ledgerPage, ledgerPageSize, ledgerSearchInput,
    ledgerEditOpen, ledgerEditId, ledgerEditRecord,
    ledgerLogOpen, ledgerLogRecordId, ledgerLogFieldName, ledgerLogData, ledgerLogTotal, ledgerLogPage, ledgerLogTotalPages,
    showDeletedLedger, deletedLedgerData, displayLedgerData,
    setLedgerSearchInput, setLedgerSearch, setLedgerPage, setLedgerPageSize,
    setLedgerEditOpen, setLedgerEditRecord,
    setLedgerLogOpen, setLedgerLogPage,
    setShowDeletedLedger,
    fetchLedger, deleteLedgerRecord, updateLedgerRecord, restoreLedgerRecord, fetchLedgerLogs, openLedgerLogModal,
    setLedgerSortBy, setLedgerSortOrder,
  } = ledgerHook

  const logPaginationRef = useRef(false)
  useEffect(() => {
    if (logPaginationRef.current && ledgerLogOpen && ledgerLogRecordId != null) {
      logPaginationRef.current = false
      fetchLedgerLogs(ledgerLogRecordId ?? undefined, ledgerLogFieldName || undefined)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ledgerLogPage])

  // ---- 提取记录弹窗 ----
  const [extractionOpen, setExtractionOpen] = useState(false)
  const [extractionRequestNo, setExtractionRequestNo] = useState('')
  const [extractionData, setExtractionData] = useState<ExtractionRecord[]>([])
  const [extractionLoading, setExtractionLoading] = useState(false)
  const [extractionEditId, setExtractionEditId] = useState<number | null>(null)
  const [extractionEditRecord, setExtractionEditRecord] = useState<ExtractionRecord | null>(null)
  const [supervisorOptions, setSupervisorOptions] = useState<{ value: string }[]>([])

  // 新增提取记录状态
  const [extractionAdding, setExtractionAdding] = useState(false)
  const [addRecordCount, setAddRecordCount] = useState('')
  const [addExtractor, setAddExtractor] = useState('')
  const [addSupervisor, setAddSupervisor] = useState('')
  const [addRemark, setAddRemark] = useState('')

  // 加载用户 displayName 列表
  useEffect(() => {
    Api.userDisplayNames().then(names => {
      setSupervisorOptions(names.map(n => ({ value: n })))
    }).catch(() => {})
  }, [])

  const fetchExtractions = async (requestNo: string) => {
    setExtractionLoading(true)
    try {
      const data = await Api.extractionList(requestNo)
      setExtractionData(data)
    } catch (e: any) {
      message.error(e.message || '获取提取记录失败')
    } finally {
      setExtractionLoading(false)
    }
  }

  const openExtractionModal = (requestNo: string, showAdd = false) => {
    setExtractionRequestNo(requestNo)
    setExtractionEditId(null)
    setExtractionEditRecord(null)
    setExtractionAdding(showAdd)
    setAddRecordCount('')
    setAddExtractor(showAdd && currentUser?.displayName ? currentUser.displayName : '')
    setAddSupervisor('')
    setAddRemark('')
    setExtractionOpen(true)
    fetchExtractions(requestNo)
  }

  const handleExtractionAdd = async () => {
    const count = parseInt(addRecordCount, 10)
    if (isNaN(count) || count <= 0) { message.warning('请输入有效的数据条数'); return }
    try {
      await Api.extractionAdd(extractionRequestNo, count, addExtractor, addSupervisor, addRemark)
      message.success('提取记录已新增')
      setExtractionAdding(false)
      setAddRecordCount('')
      setAddExtractor('')
      setAddSupervisor('')
      setAddRemark('')
      fetchExtractions(extractionRequestNo)
    } catch (e: any) { message.error(e.message || '新增失败') }
  }

  const handleExtractionDelete = async (id: number) => {
    try {
      await Api.extractionDelete(id)
      message.success('已删除')
      fetchExtractions(extractionRequestNo)
    } catch (e: any) { message.error(e.message || '删除失败') }
  }

  const handleExtractionRestore = async (id: number) => {
    try {
      await Api.extractionRestore(id)
      message.success('已恢复')
      fetchExtractions(extractionRequestNo)
    } catch (e: any) { message.error(e.message || '恢复失败') }
  }

  const handleExtractionUpdate = async () => {
    if (!extractionEditId || !extractionEditRecord) return
    try {
      await Api.extractionUpdate(extractionEditId, {
        record_count: extractionEditRecord.recordCount,
        extractor: extractionEditRecord.extractor,
        supervisor: extractionEditRecord.supervisor,
        remark: extractionEditRecord.remark,
      })
      message.success('已更新')
      setExtractionEditId(null)
      setExtractionEditRecord(null)
      fetchExtractions(extractionRequestNo)
    } catch (e: any) { message.error(e.message || '更新失败') }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', color: 'rgba(0,0,0,0.88)' }}>
          <HddOutlined style={{ fontSize: 16, color: '#1677ff' }} />
          <span style={{ fontWeight: 700 }}>{showDeletedLedger ? `共 ${deletedLedgerData.length} 条已删除记录` : `共 ${ledgerTotal} 条台账记录`}</span>
        </div>
        <Divider type="vertical" style={{ height: 24 }} />
        <Input.Search size="small" value={ledgerSearchInput} onChange={e => setLedgerSearchInput(e.target.value)} onSearch={v => { setLedgerSearch(v); setLedgerPage(1) }} placeholder="搜索单号/员工/部门/标题/处理人..." style={{ width: 280 }} allowClear onClear={() => { setLedgerSearchInput(''); setLedgerSearch(''); setLedgerPage(1) }} enterButton />
        {dataMode === 'database' && !offlineMode && (
          <Button type="default" size="small" onClick={fetchLedger} disabled={dbLoading} icon={<ReloadOutlined style={{ fontSize: 14 }} className={dbLoading ? 'icon-spin' : ''} />}>刷新</Button>
        )}
        <Button type="dashed" size="small" onClick={async () => {
          try {
            let allData: LedgerRecord[]
            if (dataMode === 'database' && !offlineMode) {
              message.info('正在导出全部台账数据...')
              allData = await Api.ledgerExportAll(ledgerHook.ledgerSearch || undefined)
            } else {
              allData = ledgerData.filter(r => !r._deleted)
            }
            if (allData.length === 0) { message.warning('暂无数据可导出'); return }
            const ws = XLSX.utils.json_to_sheet(allData.map((r, i) => ({
              '序号': String(i + 1), '数据单号': r.requestNo, '申请时间': r.requestTime,
              '申请员工': r.applicant, '申请员工电话': r.applicantPhone, '申请部门': r.applicantDept,
              '申请标题': r.requestTitle, '申请事由': r.requestReason, '申请数据内容': r.requestDataContent,
              '处理人': r.processor, '完成时间': r.finishTime || '', '创建时间': r.createDate || '',
            })))
            const wb = XLSX.utils.book_new()
            XLSX.utils.book_append_sheet(wb, ws, '数据需求台账')
            XLSX.writeFile(wb, `数据需求台账_${timestamp()}.xlsx`)
            message.success(`已导出 ${allData.length} 条记录`)
          } catch (e: any) { message.error(e.message || '导出失败') }
        }} disabled={ledgerTotal === 0 && ledgerData.length === 0} icon={<DownloadOutlined style={{ fontSize: 14 }} />}>导出Excel</Button>
        {(hasPerm('ledger_delete') || hasPerm('ledger_restore')) && !offlineMode && dataMode === 'database' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.8rem', color: 'rgba(0,0,0,0.65)' }}>
            <Switch size="small" checked={showDeletedLedger} onChange={setShowDeletedLedger} />
            <span>已删除</span>
          </div>
        )}
      </div>

      <Table<LedgerRecord>
        size="small"
        loading={dbLoading}
        dataSource={displayLedgerData}
        rowKey={(record) => String(record._dbId ?? Math.random())}
        rowClassName={() => ''}
        scroll={{ x: 1800 }}
        onChange={(_pagination, _filters, sorter) => {
          const s = Array.isArray(sorter) ? sorter[0] : sorter
          if (!s || !s.field) { setLedgerSortBy(undefined); setLedgerSortOrder(undefined) }
          else { setLedgerSortBy(s.field as string); setLedgerSortOrder(s.order as string) }
        }}
        pagination={{
          current: ledgerPage,
          pageSize: ledgerPageSize,
          total: showDeletedLedger ? deletedLedgerData.length : ledgerTotal,
          showSizeChanger: true,
          pageSizeOptions: PAGE_SIZE_OPTIONS.map(String),
          showQuickJumper: true,
          showTotal: (total, range) => `显示第 ${range[0]}-${range[1]} 条，共 ${total} 条`,
          onChange: (page, pageSize) => { setLedgerPage(page); if (pageSize !== ledgerPageSize) { setLedgerPageSize(pageSize); setLedgerPage(1) } },
          size: 'small',
        }}
        locale={{ emptyText: '暂无台账记录' }}
        columns={[
          { title: '序号', key: '_idx', width: 60, align: 'center' as const, render: (_, __, index) => (ledgerPage - 1) * ledgerPageSize + index + 1 },
          { title: '数据单号', dataIndex: 'requestNo', key: 'requestNo', width: 200, sorter: true, render: v => <Typography.Text copyable code style={{ fontSize: '0.8rem' }}>{v}</Typography.Text> },
          { title: '申请时间', dataIndex: 'requestTime', key: 'requestTime', width: 170, sorter: true, render: v => v ? dayjs(v).format('YYYY-MM-DD HH:mm:ss') : '-' },
          { title: '申请员工', dataIndex: 'applicant', key: 'applicant', width: 110, sorter: true, ellipsis: true },
          { title: '申请员工电话', dataIndex: 'applicantPhone', key: 'applicantPhone', width: 120, sorter: true, render: v => <Typography.Text copyable style={{ fontSize: '0.8rem' }}>{v}</Typography.Text> },
          { title: '申请部门', dataIndex: 'applicantDept', key: 'applicantDept', width: 160, sorter: true, ellipsis: true },
          { title: '处理人', dataIndex: 'processor', key: 'processor', width: 110, sorter: true, ellipsis: true },
          { title: '申请标题', dataIndex: 'requestTitle', key: 'requestTitle', width: 200, sorter: true, ellipsis: true },
          { title: '申请事由', dataIndex: 'requestReason', key: 'requestReason', width: 200, sorter: true, ellipsis: true },
          { title: '申请数据内容', dataIndex: 'requestDataContent', key: 'requestDataContent', width: 200, sorter: true, ellipsis: true },
          { title: '完成时间', dataIndex: 'finishTime', key: 'finishTime', width: 170, sorter: true, render: v => v ? dayjs(v).format('YYYY-MM-DD HH:mm:ss') : '-' },
          { title: '创建时间', dataIndex: 'createDate', key: 'createDate', width: 170, sorter: true, render: v => v ? dayjs(v).format('YYYY-MM-DD HH:mm:ss') : '-' },
          {
            title: '操作', key: 'actions', width: 200, align: 'center' as const, fixed: 'right' as const,
            render: (_, record) => {
              if (record._deleted) {
                return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                  {!offlineMode && hasPerm('ledger_log') && <Tooltip title="变更日志"><Button type="text" size="small" onClick={() => record._dbId && openLedgerLogModal(record._dbId, record.requestNo)} icon={<FileTextOutlined style={{ fontSize: 16 }} />} /></Tooltip>}
                  {dataMode === 'database' && !offlineMode && <Tooltip title="提取记录"><Button type="text" size="small" onClick={() => openExtractionModal(record.requestNo)} icon={<DatabaseOutlined style={{ fontSize: 16 }} />} /></Tooltip>}
                  {dataMode === 'database' && !offlineMode && hasPerm('ledger_parse') && <Tooltip title="新增提取记录"><Button type="text" size="small" onClick={() => openExtractionModal(record.requestNo, true)} icon={<PlusOutlined style={{ fontSize: 16 }} />} /></Tooltip>}
                  {hasPerm('ledger_restore') && <Popconfirm title="确认恢复" description="确定要恢复此条台账记录吗？" onConfirm={() => restoreLedgerRecord(record)} okText="恢复" cancelText="取消">
                    <Tooltip title="恢复"><Button type="text" size="small" icon={<UndoOutlined style={{ fontSize: 14 }} />} /></Tooltip>
                  </Popconfirm>}
                </div>
              }
              return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                {hasPerm('ledger_edit') && <Tooltip title="编辑"><Button type="text" size="small" onClick={() => {
                  setLedgerEditRecord({ ...record })
                  ledgerHook.setLedgerEditId(record._dbId ?? null)
                  setLedgerEditOpen(true)
                }} icon={<EditOutlined style={{ fontSize: 16 }} />} /></Tooltip>}
                {!offlineMode && hasPerm('ledger_log') && <Tooltip title="变更日志"><Button type="text" size="small" onClick={() => record._dbId && openLedgerLogModal(record._dbId, record.requestNo)} icon={<FileTextOutlined style={{ fontSize: 16 }} />} /></Tooltip>}
                {dataMode === 'database' && !offlineMode && <Tooltip title="提取记录"><Button type="text" size="small" onClick={() => openExtractionModal(record.requestNo)} icon={<DatabaseOutlined style={{ fontSize: 16 }} />} /></Tooltip>}
                {dataMode === 'database' && !offlineMode && hasPerm('ledger_parse') && <Tooltip title="新增提取记录"><Button type="text" size="small" onClick={() => openExtractionModal(record.requestNo, true)} icon={<PlusOutlined style={{ fontSize: 16 }} />} /></Tooltip>}
                {hasPerm('ledger_delete') && <Popconfirm title="确认删除" description="确定要删除此条台账记录吗？" onConfirm={() => deleteLedgerRecord(record)} okText="删除" cancelText="取消" okButtonProps={{ danger: true, size: 'small' }} cancelButtonProps={{ size: 'small' }}>
                  <Tooltip title="删除"><Button type="text" size="small" danger icon={<DeleteOutlined style={{ fontSize: 16 }} />} /></Tooltip>
                </Popconfirm>}
              </div>
            },
          },
        ]}
      />

      {/* 提取记录弹窗 */}
      <Modal
        open={extractionOpen}
        title={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: 24 }}>
            <span>提取记录 — <Typography.Text code>{extractionRequestNo}</Typography.Text></span>
            {hasPerm('ledger_parse') && (
              <Button type="primary" size="small" icon={extractionAdding ? <UpOutlined /> : <PlusOutlined />} onClick={() => { setExtractionAdding(!extractionAdding); if (!extractionAdding && currentUser?.displayName && !addExtractor) setAddExtractor(currentUser.displayName) }}>
                {extractionAdding ? '收起' : '新增'}
              </Button>
            )}
          </div>
        }
        width="calc(100vw - 2rem)"
        style={{ top: 20, maxWidth: 720 }}
        onCancel={() => { setExtractionOpen(false); setExtractionEditId(null); setExtractionEditRecord(null); setExtractionAdding(false) }}
        footer={null}
      >
        {/* 新增提取记录表单 */}
        <Collapse
          activeKey={extractionAdding ? ['add'] : []}
          onChange={() => {
            if (extractionAdding) { setExtractionAdding(false); setAddRecordCount(''); setAddExtractor(''); setAddSupervisor(''); setAddRemark('') }
            else { setExtractionAdding(true); if (currentUser?.displayName && !addExtractor) setAddExtractor(currentUser.displayName) }
          }}
          ghost
          style={{ marginBottom: extractionAdding ? 16 : 0 }}
        >
          <Collapse.Panel header="" key="add" showArrow={false} style={{ padding: 0 }}>
            <div style={{ padding: '12px 16px', background: '#fafafa', borderRadius: 6, border: '1px dashed #d9d9d9' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 70, flexShrink: 0, textAlign: 'right', fontSize: '0.85rem', color: 'rgba(0,0,0,0.65)' }}>数据条数</span>
                  <Input type="number" value={addRecordCount} onChange={e => setAddRecordCount(e.target.value)} placeholder="请输入数据条数" style={{ flex: 1 }} onPressEnter={handleExtractionAdd} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 70, flexShrink: 0, textAlign: 'right', fontSize: '0.85rem', color: 'rgba(0,0,0,0.65)' }}>取数人</span>
                  <Input value={addExtractor} onChange={e => setAddExtractor(e.target.value)} placeholder="请输入取数人" style={{ flex: 1 }} onPressEnter={handleExtractionAdd} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 70, flexShrink: 0, textAlign: 'right', fontSize: '0.85rem', color: 'rgba(0,0,0,0.65)' }}>监督人</span>
                  <AutoComplete value={addSupervisor} onChange={v => setAddSupervisor(v)} options={supervisorOptions} style={{ flex: 1 }} filterOption={(input, option) => (option?.value ?? '').toLowerCase().includes(input.toLowerCase())} placeholder="请选择或输入监督人" />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 70, flexShrink: 0, textAlign: 'right', fontSize: '0.85rem', color: 'rgba(0,0,0,0.65)' }}>备注</span>
                  <Input value={addRemark} onChange={e => setAddRemark(e.target.value)} placeholder="选填" style={{ flex: 1 }} onPressEnter={handleExtractionAdd} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
                  <Button size="small" onClick={() => { setExtractionAdding(false); setAddRecordCount(''); setAddExtractor(''); setAddSupervisor(''); setAddRemark('') }}>取消</Button>
                  <Button type="primary" size="small" onClick={handleExtractionAdd}>确认新增</Button>
                </div>
              </div>
            </div>
          </Collapse.Panel>
        </Collapse>
        <Table<ExtractionRecord>
          size="small"
          loading={extractionLoading}
          dataSource={extractionData}
          rowKey="id"
          pagination={false}
          scroll={{ x: 730 }}
          locale={{ emptyText: '暂无提取记录' }}
          columns={[
            {
              title: '数据条数', dataIndex: 'recordCount', key: 'recordCount', width: 100, sorter: (a, b) => (a.recordCount || 0) - (b.recordCount || 0),
              render: (v, record) => {
                const style = record.isVisible === false ? { textDecoration: 'line-through', color: 'rgba(0,0,0,0.25)' } : {}
                return <span style={style}>{v}</span>
              },
            },
            {
              title: '取数人', dataIndex: 'extractor', key: 'extractor', width: 100, sorter: (a, b) => (a.extractor || '').localeCompare(b.extractor || ''),
              render: (v, record) => {
                const style = record.isVisible === false ? { textDecoration: 'line-through', color: 'rgba(0,0,0,0.25)' } : {}
                return <span style={style}>{v || '-'}</span>
              },
            },
            {
              title: '监督人', dataIndex: 'supervisor', key: 'supervisor', width: 100, sorter: (a, b) => (a.supervisor || '').localeCompare(b.supervisor || ''),
              render: (v, record) => {
                const style = record.isVisible === false ? { textDecoration: 'line-through', color: 'rgba(0,0,0,0.25)' } : {}
                return <span style={style}>{v || '-'}</span>
              },
            },
            {
              title: '备注', dataIndex: 'remark', key: 'remark', width: 150, ellipsis: true,
              render: (v, record) => {
                const style = record.isVisible === false ? { textDecoration: 'line-through', color: 'rgba(0,0,0,0.25)' } : {}
                return <span style={style}>{v || '-'}</span>
              },
            },
            {
              title: '时间', dataIndex: 'createDate', key: 'createDate', width: 160, sorter: (a, b) => (a.createDate || '').localeCompare(b.createDate || ''),
              render: (v, record) => {
                const style = record.isVisible === false ? { textDecoration: 'line-through', color: 'rgba(0,0,0,0.25)' } : {}
                return <span style={style}>{v ? dayjs(v).format('YYYY-MM-DD HH:mm:ss') : '-'}</span>
              },
            },
            {
              title: '操作', key: 'actions', width: 120, align: 'center' as const, fixed: 'right' as const,
              render: (_, record) => {
                if (record.isVisible === false) {
                  return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                    {hasPerm('ledger_edit') && <Tooltip title="编辑"><Button type="text" size="small" onClick={() => { setExtractionEditId(record.id!); setExtractionEditRecord({ ...record }) }} icon={<EditOutlined style={{ fontSize: 14 }} />} /></Tooltip>}
                    {hasPerm('ledger_restore') && <Tooltip title="恢复"><Button type="text" size="small" onClick={() => handleExtractionRestore(record.id!)} icon={<UndoOutlined style={{ fontSize: 14 }} />} /></Tooltip>}
                  </div>
                }
                return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                  {hasPerm('ledger_edit') && <Tooltip title="编辑"><Button type="text" size="small" onClick={() => { setExtractionEditId(record.id!); setExtractionEditRecord({ ...record }) }} icon={<EditOutlined style={{ fontSize: 14 }} />} /></Tooltip>}
                  {hasPerm('ledger_delete') && <Popconfirm title="确认删除" onConfirm={() => handleExtractionDelete(record.id!)} okText="删除" cancelText="取消" okButtonProps={{ danger: true }}>
                    <Tooltip title="删除"><Button type="text" size="small" danger icon={<DeleteOutlined style={{ fontSize: 14 }} />} /></Tooltip>
                  </Popconfirm>}
                </div>
              },
            },
          ]}
        />

        {/* 提取记录编辑弹窗 */}
        <Modal
          open={extractionEditId !== null && extractionEditRecord !== null}
          title="编辑提取记录"
          width="calc(100vw - 2rem)"
          style={{ top: 20, maxWidth: 400 }}
          onCancel={() => { setExtractionEditId(null); setExtractionEditRecord(null) }}
          onOk={handleExtractionUpdate}
        >
          {extractionEditRecord && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 70, flexShrink: 0, textAlign: 'right', fontSize: '0.85rem', color: 'rgba(0,0,0,0.65)' }}>数据条数</span>
                <Input type="number" value={extractionEditRecord.recordCount || ''} onChange={e => setExtractionEditRecord({ ...extractionEditRecord, recordCount: parseInt(e.target.value) || 0 })} style={{ flex: 1 }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 70, flexShrink: 0, textAlign: 'right', fontSize: '0.85rem', color: 'rgba(0,0,0,0.65)' }}>取数人</span>
                <Input value={extractionEditRecord.extractor || ''} onChange={e => setExtractionEditRecord({ ...extractionEditRecord, extractor: e.target.value })} style={{ flex: 1 }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 70, flexShrink: 0, textAlign: 'right', fontSize: '0.85rem', color: 'rgba(0,0,0,0.65)' }}>监督人</span>
                <AutoComplete value={extractionEditRecord.supervisor || ''} onChange={v => setExtractionEditRecord({ ...extractionEditRecord, supervisor: v })} options={supervisorOptions} style={{ flex: 1 }} filterOption={(input, option) => (option?.value ?? '').toLowerCase().includes(input.toLowerCase())} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 70, flexShrink: 0, textAlign: 'right', fontSize: '0.85rem', color: 'rgba(0,0,0,0.65)' }}>备注</span>
                <Input value={extractionEditRecord.remark || ''} onChange={e => setExtractionEditRecord({ ...extractionEditRecord, remark: e.target.value })} placeholder="选填" style={{ flex: 1 }} />
              </div>
            </div>
          )}
        </Modal>
      </Modal>

      <Modal
        open={ledgerEditOpen}
        title="编辑台账记录"
        width="calc(100vw - 2rem)"
        style={{ top: 20, maxWidth: 720 }}
        onCancel={() => setLedgerEditOpen(false)}
        onOk={async () => {
          if (ledgerEditId === null || !ledgerEditRecord) return
          const fields: Partial<Record<string, string>> = {}
          const original = ledgerData.find(r => r._dbId === ledgerEditId)
          LEDGER_FIELDS.forEach(f => {
            const newVal = ledgerEditRecord[f.key] || ''
            const oldVal = original ? original[f.key] || '' : ''
            if (newVal !== oldVal) fields[f.key] = newVal
          })
          if (Object.keys(fields).length === 0) { setLedgerEditOpen(false); return }
          await updateLedgerRecord(ledgerEditId, fields as Partial<LedgerRecord>)
          setLedgerEditOpen(false)
        }}
      >
        {ledgerEditRecord && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {LEDGER_FIELDS.map(f => (
              <div key={f.key} style={{ display: 'flex', alignItems: f.key === 'requestTitle' || f.key === 'requestReason' || f.key === 'requestDataContent' ? 'flex-start' : 'center', gap: 8 }}>
                <span style={{ width: 100, flexShrink: 0, textAlign: 'right', fontSize: '0.85rem', color: 'rgba(0,0,0,0.65)' }}>{f.label}</span>
                {f.key === 'requestTitle' || f.key === 'requestReason' || f.key === 'requestDataContent' ? (
                  <Input.TextArea value={ledgerEditRecord[f.key] || ''} onChange={e => setLedgerEditRecord({ ...ledgerEditRecord, [f.key]: e.target.value })} autoSize={{ minRows: 2, maxRows: 6 }} style={{ flex: 1 }} />
                ) : (f as any).readonly ? (
                  <Input value={ledgerEditRecord[f.key] || ''} disabled style={{ flex: 1 }} />
                ) : (
                  <Input value={ledgerEditRecord[f.key] || ''} onChange={e => setLedgerEditRecord({ ...ledgerEditRecord, [f.key]: e.target.value })} style={{ flex: 1 }} />
                )}
              </div>
            ))}
          </div>
        )}
      </Modal>

      <Modal
        open={ledgerLogOpen}
        title="台账变更日志"
        width="calc(100vw - 2rem)"
        style={{ top: 20, maxWidth: 720 }}
        onCancel={() => setLedgerLogOpen(false)}
        footer={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
            <Button type="default" size="small" onClick={() => { logPaginationRef.current = true; setLedgerLogPage(Math.max(1, ledgerLogPage - 1)) }} disabled={ledgerLogPage <= 1}>上一页</Button>
            <span style={{ fontSize: '0.85rem', color: 'rgba(0,0,0,0.45)' }}>每页 {LOG_PAGE_SIZE} 条 | {ledgerLogPage} / {ledgerLogTotalPages}</span>
            <Button type="default" size="small" onClick={() => { logPaginationRef.current = true; setLedgerLogPage(Math.min(ledgerLogTotalPages, ledgerLogPage + 1)) }} disabled={ledgerLogPage >= ledgerLogTotalPages}>下一页</Button>
          </div>
        }
      >
        <p style={{ fontSize: '0.85rem', color: 'rgba(0,0,0,0.45)', marginBottom: 12, textAlign: 'center' }}>
          {ledgerLogFieldName ? <span>单号 <Typography.Text code>{ledgerLogFieldName}</Typography.Text></span> : ledgerLogRecordId ? `记录 #${ledgerLogRecordId}` : '全部'}的变更日志，共 <Typography.Text strong>{ledgerLogTotal}</Typography.Text> 条
        </p>
        {ledgerLogData.length === 0 ? (
          <p style={{ fontSize: '0.85rem', color: '#bfbfbf', textAlign: 'center', padding: '2rem 0' }}>暂无日志记录</p>
        ) : (
          <Table<LogEntry>
            size="small"
            dataSource={ledgerLogData}
            rowKey={(record) => String(record.id)}
            pagination={false}
            scroll={{ x: 750 }}
            columns={[
              {
                title: '操作', key: 'operation', width: 56, align: 'center' as const,
                render: (_, log) => {
                  const opLabel = log.operation === 'INSERT' ? '新增' : log.operation === 'UPDATE' ? '修改' : log.operation === 'DELETE' ? '删除' : '恢复'
                  const tagColor = log.operation === 'INSERT' ? 'success' : log.operation === 'UPDATE' ? 'processing' : log.operation === 'DELETE' ? 'error' : 'warning'
                  return <Tag color={tagColor}>{opLabel}</Tag>
                },
              },
              { title: '字段', dataIndex: 'fieldName', key: 'fieldName', width: 100, sorter: (a, b) => (a.fieldName || '').localeCompare(b.fieldName || ''), render: v => v || '-' },
              {
                title: '旧值', key: 'oldValue', width: 180,
                render: (_, log) => {
                  if (log.operation === 'INSERT' || log.operation === 'DELETE' || log.operation === 'RESTORE') return <Typography.Text type="secondary">-</Typography.Text>
                  const v = formatLogValue(log.oldValue)
                  return v.length > 30 ? <Tooltip title={v}><Typography.Text type="secondary" style={{ wordBreak: 'break-all' }}>{v.slice(0, 30)}…</Typography.Text></Tooltip> : <Typography.Text type="secondary" style={{ wordBreak: 'break-all' }}>{v}</Typography.Text>
                },
              },
              {
                title: '新值', key: 'newValue', width: 180,
                render: (_, log) => {
                  if (log.operation === 'INSERT' || log.operation === 'DELETE' || log.operation === 'RESTORE') return <Typography.Text type="secondary">-</Typography.Text>
                  const v = formatLogValue(log.newValue)
                  return v.length > 30 ? <Tooltip title={v}><span style={{ wordBreak: 'break-all' }}>{v.slice(0, 30)}…</span></Tooltip> : <span style={{ wordBreak: 'break-all' }}>{v}</span>
                },
              },
              {
                title: '操作人', dataIndex: 'userName', key: 'userName', width: 80, ellipsis: true, sorter: (a, b) => (a.userName || '').localeCompare(b.userName || ''), render: v => v || '-',
              },
              {
                title: '时间', key: 'time', width: 150, align: 'center' as const, sorter: (a, b) => (a.operationDate || '').localeCompare(b.operationDate || ''),
                render: (_, log) => <Typography.Text type="secondary">{log.operationDate ? dayjs(log.operationDate).format('YYYY-MM-DD HH:mm:ss') : '-'}</Typography.Text>,
              },
            ]}
          />
        )}
      </Modal>
    </div>
  )
}
