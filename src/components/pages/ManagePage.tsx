import { useState, useEffect, useCallback, useRef } from 'react'
import { Card, Typography, Button, Divider, Input, Table, Switch, Tooltip, Popconfirm, Upload as AntUpload, Dropdown, Modal } from 'antd'
import type { UploadProps } from 'antd'
import { InboxOutlined, DownloadOutlined, TableOutlined, PlusOutlined, ReloadOutlined, SearchOutlined, EditOutlined, FileTextOutlined, DeleteOutlined, CheckOutlined, CloseOutlined, UndoOutlined, MoreOutlined } from '@ant-design/icons'
import * as XLSX from 'xlsx'
import type { UseManageReturn } from '../../hooks/useManage'
import type { MappingItem, ImportConflict } from '../../types'
import { downloadMappingTemplate, parseMappingXLSX } from '../../utils/translation'
import { useAppContext } from '../../contexts/AppContext'
import { PAGE_SIZE_OPTIONS } from '../../constants'
import { useIsSmallScreen } from '../../hooks/useResponsive'
import { Api } from '../../api'

interface ManagePageProps {
  manageHook: UseManageReturn
  showDeleted: boolean
  setShowDeleted: (v: boolean) => void
}

export default function ManagePage({ manageHook, showDeleted, setShowDeleted }: ManagePageProps) {
  const { hasPerm, message, mappingData, dataMode, offlineMode, dbLoading, fetchDbMapping, persistMapping } = useAppContext()
  const isSmall = useIsSmallScreen()

  const [page, setPage] = useState(manageHook.safeCurrentPage)

  useEffect(() => { setPage(manageHook.safeCurrentPage) }, [manageHook.safeCurrentPage])

  const hookRef = useRef(manageHook)
  hookRef.current = manageHook

  const safePage = Math.min(page, manageHook.totalPages)

  const draggerCustomRequest: UploadProps['customRequest'] = ({ onSuccess }) => { setTimeout(() => onSuccess?.('ok'), 0) }

  const openFieldLogModal = useCallback((recordId: number, fieldName: string) => {
    const h = hookRef.current
    h.setLogRecordId(recordId)
    h.setLogFieldName(fieldName)
    h.setLogModalOpen(true)
    h.setLogPage(1)
    setTimeout(() => hookRef.current.fetchLogs(recordId, fieldName), 0)
  }, [])

  const handleImportFile = useCallback(async (file: File) => {
    const existingMap = new Map<string, string>()
    for (const m of mappingData) existingMap.set(m.original.toLowerCase(), m.chinese)

    const reader = new FileReader()
    reader.onload = async (evt) => {
      const data = new Uint8Array(evt.target?.result as ArrayBuffer)
      const workbook = XLSX.read(data, { type: 'array' })
      const items = parseMappingXLSX(workbook)
      if (items.length === 0) { message.warning('未解析到有效数据'); return }

      const newItems: MappingItem[] = []
      const conflicts: ImportConflict[] = []
      for (const item of items) {
        const existingChinese = existingMap.get(item.original.toLowerCase())
        if (existingChinese === undefined) newItems.push(item)
        else if (existingChinese !== item.chinese) conflicts.push({ original: item.original, existing: existingChinese, incoming: item.chinese })
      }

      const h = hookRef.current
      h.setImportNewItems(newItems)

      if (conflicts.length === 0) {
        if (newItems.length === 0) { message.info('无新增数据'); return }
        if (dataMode === 'database' && !offlineMode) {
          try { await Api.importItems(newItems); await fetchDbMapping(); message.success(`导入完成，共 ${newItems.length} 条`) }
          catch (e: any) { message.error(e.message || '导入失败') }
        } else {
          (persistMapping as (d: MappingItem[]) => void)([...mappingData, ...newItems])
          message.success(`导入完成，共 ${newItems.length} 条`)
        }
      } else {
        h.setImportConflicts(conflicts)
        message.info(`发现 ${conflicts.length} 个冲突，请处理`)
      }
    }
    reader.readAsArrayBuffer(file)
  }, [mappingData, dataMode, offlineMode, fetchDbMapping, persistMapping, message])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {hasPerm('manage_import') && <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <Typography.Text strong style={{ fontSize: '0.95rem' }}>导入对照表</Typography.Text>
        </div>
        <p style={{ fontSize: '0.75rem', color: 'rgba(0,0,0,0.45)', marginBottom: 12 }}>
          上传 Excel 文件批量导入对照记录，有表头时自动忽略首行
        </p>
        <AntUpload.Dragger
          accept=".xlsx,.xls,.csv"
          showUploadList={false}
          customRequest={draggerCustomRequest}
          beforeUpload={(file) => { handleImportFile(file); return false }}
          style={{ marginBottom: 0 }}
        >
          <p className="ant-upload-drag-icon"><InboxOutlined /></p>
          <p className="ant-upload-text" style={{ fontSize: '0.85rem' }}>点击或拖拽文件到此处上传</p>
          <p className="ant-upload-hint" style={{ fontSize: '0.75rem' }}>支持 .xlsx / .xls / .csv</p>
        </AntUpload.Dragger>
        <Divider style={{ margin: '12px 0' }} />
        <Button type="dashed" size="small" onClick={downloadMappingTemplate} icon={<DownloadOutlined style={{ fontSize: 14 }} />}>下载模板</Button>
      </Card>}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', color: 'rgba(0,0,0,0.88)' }}>
          <TableOutlined style={{ fontSize: 16, color: '#1677ff' }} />
          <span style={{ fontWeight: 700 }}>{showDeleted ? `共 ${manageHook.filteredData.length} 条已删除记录` : `共 ${mappingData.length} 条对照记录`}</span>
        </div>

        {hasPerm('manage_edit') && <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Input size="small" value={manageHook.addOriginal} onChange={e => manageHook.setAddOriginal(e.target.value)} placeholder="英文字段" style={{ width: 120 }} onKeyDown={e => { if (e.key === 'Enter' && manageHook.addChinese.trim()) manageHook.addItem() }} />
          <Input size="small" value={manageHook.addChinese} onChange={e => manageHook.setAddChinese(e.target.value)} placeholder="中文名称" style={{ width: 120 }} onKeyDown={e => { if (e.key === 'Enter' && manageHook.addOriginal.trim() && manageHook.addChinese.trim()) manageHook.addItem() }} />
          <Button type="default" size="small" onClick={manageHook.addItem} disabled={!manageHook.addOriginal.trim() || !manageHook.addChinese.trim()} icon={<PlusOutlined style={{ fontSize: 14 }} />}>新增</Button>
        </div>}

        <Divider type="vertical" style={{ height: 24 }} />

        <Button type="dashed" size="small" onClick={manageHook.handleExportMapping} disabled={mappingData.length === 0} icon={<DownloadOutlined style={{ fontSize: 14 }} />}>导出对照记录</Button>

        <Divider type="vertical" style={{ height: 24 }} />

        <Button.Group size="small">
          <Button type={manageHook.searchExact ? 'primary' : 'default'} onClick={() => manageHook.setSearchExact(true)}>精确</Button>
          <Button type={!manageHook.searchExact ? 'primary' : 'default'} onClick={() => manageHook.setSearchExact(false)}>模糊</Button>
        </Button.Group>
        <Input.Search size="small" value={manageHook.manageSearchInput} onChange={e => manageHook.setManageSearchInput(e.target.value)} onSearch={() => manageHook.applySearch()} placeholder="搜索..." style={{ width: 200 }} allowClear onClear={() => { manageHook.setManageSearchInput(''); setTimeout(() => hookRef.current.applySearch(), 0) }} enterButton />

        {dataMode === 'database' && (
          <Button type="default" size="small" onClick={fetchDbMapping} disabled={dbLoading} icon={<ReloadOutlined style={{ fontSize: 14 }} className={dbLoading ? 'icon-spin' : ''} />}>刷新</Button>
        )}

        {(hasPerm('manage_delete') || hasPerm('manage_restore')) && !offlineMode && dataMode === 'database' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.8rem', color: 'rgba(0,0,0,0.65)' }}>
            <Switch size="small" checked={showDeleted} onChange={setShowDeleted} />
            <span>已删除</span>
          </div>
        )}
      </div>

      <Table<MappingItem>
        size="small"
        loading={dbLoading}
        dataSource={manageHook.filteredData}
        rowKey={(record, index) => String(record._dbId ?? index ?? 0)}
        rowClassName={() => ''}
        scroll={{ x: 800, y: 'calc(100vh - 260px)' }}
        pagination={{
          current: safePage,
          pageSize: manageHook.managePageSize,
          total: manageHook.filteredData.length,
          showSizeChanger: !isSmall,
          pageSizeOptions: PAGE_SIZE_OPTIONS.map(String),
          showQuickJumper: !isSmall,
          simple: isSmall,
          showTotal: isSmall ? undefined : ((total, range) => `显示第 ${range[0]}-${range[1]} 条，共 ${total} 条${manageHook.manageSearch ? '（筛选中）' : ''}`),
          onChange: (p, ps) => { setPage(p); if (ps !== manageHook.managePageSize) { manageHook.setManagePageSize(ps); setPage(1) } },
          size: 'small',
        }}
        locale={{ emptyText: manageHook.manageSearch ? '无匹配结果' : '暂无对照记录' }}
        columns={[
          {
            title: '序号',
            key: '_idx',
            width: 48,
            align: 'center',
            render: (_, __, index) => (safePage - 1) * manageHook.managePageSize + index + 1,
          },
          {
            title: '英文字段',
            dataIndex: 'original',
            key: 'original',
            width: 280,
            ellipsis: true,
            sorter: (a, b) => (a.original || '').localeCompare(b.original || ''),
            render: (v, record) => {
              const globalIdx = manageHook.filteredData.indexOf(record)
              if (record._deleted) return <Typography.Text code>{v}</Typography.Text>
              const isEditing = manageHook.editingGlobalIdx === globalIdx
              return isEditing
                ? <Typography.Text code>{manageHook.editOriginal}</Typography.Text>
                : <Typography.Text code>{v}</Typography.Text>
            },
          },
          {
            title: '中文名称',
            dataIndex: 'chinese',
            key: 'chinese',
            ellipsis: true,
            sorter: (a, b) => (a.chinese || '').localeCompare(b.chinese || ''),
            render: (v, record) => {
              const globalIdx = manageHook.filteredData.indexOf(record)
              if (record._deleted) return v
              const isEditing = manageHook.editingGlobalIdx === globalIdx
              return isEditing
                ? <Input size="small" value={manageHook.editChinese} onChange={e => manageHook.setEditChinese(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') manageHook.saveEdit(); if (e.key === 'Escape') manageHook.setEditingGlobalIdx(null) }} />
                : v
            },
          },
          {
            title: '操作',
            key: 'actions',
            width: isSmall ? 50 : 160,
            align: 'center' as const,
            fixed: 'right' as const,
            render: (_, record) => {
              const globalIdx = manageHook.filteredData.indexOf(record)

              // ---- 小屏：收进 Dropdown ----
              if (isSmall) {
                if (record._deleted) {
                  const items: any[] = []
                  if (!offlineMode && hasPerm('manage_log')) items.push({ key: 'log', icon: <FileTextOutlined />, label: '变更日志', onClick: () => record._dbId && openFieldLogModal(record._dbId, record.original) })
                  if (hasPerm('manage_restore')) items.push({ key: 'restore', icon: <UndoOutlined />, label: '恢复', onClick: () => { Modal.confirm({ title: '确认恢复', content: `确定要恢复字段 ${record.original} 吗？`, okText: '恢复', cancelText: '取消', getContainer: () => document.body, onOk: () => manageHook.restoreItem(record) }) } })
                  return <Dropdown menu={{ items }} trigger={['click']} getPopupContainer={() => document.body}><Button type="text" size="small" icon={<MoreOutlined style={{ fontSize: 16 }} />} /></Dropdown>
                }
                const isEditing = manageHook.editingGlobalIdx === globalIdx
                if (isEditing) {
                  return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                    <Tooltip title="保存"><Button type="text" size="small" onClick={manageHook.saveEdit} icon={<CheckOutlined style={{ fontSize: 16 }} />} /></Tooltip>
                    <Tooltip title="取消"><Button type="text" size="small" onClick={() => manageHook.setEditingGlobalIdx(null)} icon={<CloseOutlined style={{ fontSize: 16 }} />} /></Tooltip>
                  </div>
                }
                const items: any[] = []
                if (hasPerm('manage_edit')) items.push({ key: 'edit', icon: <EditOutlined />, label: '编辑', onClick: () => manageHook.startEdit(globalIdx) })
                items.push({ key: 'search', icon: <SearchOutlined />, label: '查看同名字段', onClick: () => { manageHook.setSearchExact(true); manageHook.setManageSearchInput(record.original); setTimeout(() => hookRef.current.applySearch(), 0); setPage(1); message.info(`已搜索「${record.original}」，清空搜索框可恢复全部查看`) } })
                if (!offlineMode && hasPerm('manage_log')) items.push({ key: 'log', icon: <FileTextOutlined />, label: '变更日志', onClick: () => record._dbId && openFieldLogModal(record._dbId, record.original) })
                if (hasPerm('manage_delete')) items.push({ key: 'delete', icon: <DeleteOutlined />, label: '删除', danger: true, onClick: () => { Modal.confirm({ title: '确认删除', content: `确定要删除字段 ${record.original} 吗？`, okText: '删除', okButtonProps: { danger: true }, cancelText: '取消', getContainer: () => document.body, onOk: () => manageHook.deleteItem(record) }) } })
                return <Dropdown menu={{ items }} trigger={['click']} getPopupContainer={() => document.body}><Button type="text" size="small" icon={<MoreOutlined style={{ fontSize: 16 }} />} /></Dropdown>
              }

              // ---- 大屏：保持原样 ----
              if (record._deleted) {
                return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                  {!offlineMode && hasPerm('manage_log') && <Tooltip title="变更日志"><Button type="text" size="small" onClick={() => record._dbId && openFieldLogModal(record._dbId, record.original)} icon={<FileTextOutlined style={{ fontSize: 16 }} />} /></Tooltip>}
                  {hasPerm('manage_restore') && <Popconfirm
                    title="确认恢复"
                    description={<span>确定要恢复字段 <strong>{record.original}</strong> 吗？</span>}
                    onConfirm={() => manageHook.restoreItem(record)}
                    okText="恢复"
                    cancelText="取消"
                  >
                    <Tooltip title="恢复"><Button type="text" size="small" icon={<UndoOutlined style={{ fontSize: 14 }} />} /></Tooltip>
                  </Popconfirm>}
                </div>
              }
              const isEditing = manageHook.editingGlobalIdx === globalIdx
              return isEditing
                ? <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                    <Tooltip title="保存"><Button type="text" size="small" onClick={manageHook.saveEdit} icon={<CheckOutlined style={{ fontSize: 16 }} />} /></Tooltip>
                    <Tooltip title="取消"><Button type="text" size="small" onClick={() => manageHook.setEditingGlobalIdx(null)} icon={<CloseOutlined style={{ fontSize: 16 }} />} /></Tooltip>
                  </div>
                : <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                    {hasPerm('manage_edit') && <Tooltip title="编辑"><Button type="text" size="small" onClick={() => manageHook.startEdit(globalIdx)} icon={<EditOutlined style={{ fontSize: 16 }} />} /></Tooltip>}
                    <Tooltip title="查看同名字段"><Button type="text" size="small" onClick={() => { manageHook.setSearchExact(true); manageHook.setManageSearchInput(record.original); setTimeout(() => hookRef.current.applySearch(), 0); setPage(1); message.info(`已搜索「${record.original}」，清空搜索框可恢复全部查看`) }} icon={<SearchOutlined style={{ fontSize: 16 }} />} /></Tooltip>
                    {!offlineMode && hasPerm('manage_log') && <Tooltip title="变更日志"><Button type="text" size="small" onClick={() => record._dbId && openFieldLogModal(record._dbId, record.original)} icon={<FileTextOutlined style={{ fontSize: 16 }} />} /></Tooltip>}
                    {hasPerm('manage_delete') && <Popconfirm
                      title="确认删除"
                      description={<span>确定要删除字段 <strong>{record.original}</strong> 吗？</span>}
                      onConfirm={() => manageHook.deleteItem(record)}
                      okText="删除"
                      cancelText="取消"
                      okButtonProps={{ danger: true, size: 'small' }}
                      cancelButtonProps={{ size: 'small' }}
                    >
                      <Tooltip title="删除"><Button type="text" size="small" danger icon={<DeleteOutlined style={{ fontSize: 16 }} />} /></Tooltip>
                    </Popconfirm>}
                  </div>
            },
          },
        ]}
      />
    </div>
  )
}
