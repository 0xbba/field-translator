import { Modal, Button, Table, Tag, Tooltip, Typography } from 'antd'
import type { LogEntry } from '../../types'
import { formatLogValue } from '../../utils/format'
import { COLORS } from '../../constants'
import dayjs from 'dayjs'

interface LogModalProps {
  open: boolean
  data: LogEntry[]
  total: number
  page: number
  totalPages: number
  onPageChange: (p: number) => void
  onClose: () => void
}

export default function LogModal({ open, data, total, page, totalPages, onPageChange, onClose }: LogModalProps) {
  return (
    <Modal
      open={open}
      title="变更日志"
      width="calc(100vw - 2rem)"
      centered
      style={{ maxWidth: 720 }}
      getContainer={() => document.body}
      onCancel={onClose}
      footer={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
          <Button type="default" size="small" onClick={() => onPageChange(Math.max(1, page - 1))} disabled={page <= 1}>上一页</Button>
          <span style={{ fontSize: '0.85rem', color: COLORS.textTertiary }}>{page} / {totalPages}</span>
          <Button type="default" size="small" onClick={() => onPageChange(Math.min(totalPages, page + 1))} disabled={page >= totalPages}>下一页</Button>
        </div>
      }
    >
      <p style={{ fontSize: '0.85rem', color: COLORS.textTertiary, marginBottom: 12, textAlign: 'center' }}>
        共 <Typography.Text strong>{total}</Typography.Text> 条变更日志
      </p>
      {data.length === 0 ? (
        <p style={{ fontSize: '0.85rem', color: '#bfbfbf', textAlign: 'center', padding: '2rem 0' }}>暂无日志记录</p>
      ) : (
        <Table<LogEntry>
          size="small"
          dataSource={data}
          rowKey={(record) => String(record.id)}
          pagination={false}
          scroll={{ x: 700 }}
          columns={[
            {
              title: '操作',
              key: 'operation',
              width: 56,
              align: 'center',
              render: (_, log) => {
                const opLabel = log.operation === 'INSERT' ? '新增' : log.operation === 'UPDATE' ? '修改' : log.operation === 'DELETE' ? '删除' : '恢复'
                const tagColor = log.operation === 'INSERT' ? 'success' : log.operation === 'UPDATE' ? 'processing' : log.operation === 'DELETE' ? 'error' : 'warning'
                return <Tag color={tagColor}>{opLabel}</Tag>
              },
            },
            {
              title: '旧值',
              key: 'oldValue',
              width: 200,
              render: (_, log) => {
                // 新增/删除/恢复：不展示具体值
                if (log.operation === 'INSERT' || log.operation === 'DELETE' || log.operation === 'RESTORE') return <Typography.Text type="secondary">-</Typography.Text>
                const v = formatLogValue(log.oldValue)
                return v.length > 30 ? <Tooltip title={v}><Typography.Text type="secondary" style={{ wordBreak: 'break-all' }}>{v.slice(0, 30)}…</Typography.Text></Tooltip> : <Typography.Text type="secondary" style={{ wordBreak: 'break-all' }}>{v}</Typography.Text>
              },
            },
            {
              title: '新值',
              key: 'newValue',
              width: 200,
              render: (_, log) => {
                // 新增/删除/恢复：不展示具体值
                if (log.operation === 'INSERT' || log.operation === 'DELETE' || log.operation === 'RESTORE') return <Typography.Text type="secondary">-</Typography.Text>
                const v = formatLogValue(log.newValue)
                return v.length > 30 ? <Tooltip title={v}><span style={{ wordBreak: 'break-all' }}>{v.slice(0, 30)}…</span></Tooltip> : <span style={{ wordBreak: 'break-all' }}>{v}</span>
              },
            },
            {
              title: '修改人',
              dataIndex: 'userName',
              key: 'userName',
              width: 80,
              ellipsis: true,
              sorter: (a, b) => (a.userName || '').localeCompare(b.userName || ''),
              render: (v) => v || '-',
            },
            {
              title: '时间',
              key: 'time',
              width: 150,
              align: 'center',
              sorter: (a, b) => (a.operationDate || '').localeCompare(b.operationDate || ''),
              render: (_, log) => <Typography.Text type="secondary">{log.operationDate ? dayjs(log.operationDate).format('YYYY-MM-DD HH:mm:ss') : '-'}</Typography.Text>,
            },
          ]}
        />
      )}
    </Modal>
  )
}
