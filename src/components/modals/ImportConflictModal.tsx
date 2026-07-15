import { useState } from 'react'
import { Modal, Button, Table, Radio, Typography } from 'antd'
import type { ImportConflict } from '../../types'
import { COLORS } from '../../constants'

interface ConflictRow extends ImportConflict {
  action: 'skip' | 'add'
}

interface ImportConflictModalProps {
  open: boolean
  conflicts: ImportConflict[]
  onConfirm: () => void
  onCancel: () => void
}

export default function ImportConflictModal({ open, conflicts, onConfirm, onCancel }: ImportConflictModalProps) {
  const [rows, setRows] = useState<ConflictRow[]>([])

  const openProxy = open
  if (openProxy && rows.length === 0 && conflicts.length > 0) {
    setRows(conflicts.map(c => ({ ...c, action: 'skip' as const })))
  }

  const addCount = rows.filter(r => r.action === 'add').length

  return (
    <Modal
      open={open}
      title="导入冲突"
      width={680}
      getContainer={() => document.body}
      onCancel={onCancel}
      footer={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Button type="default" size="small" onClick={() => setRows(prev => prev.map(c => ({ ...c, action: 'skip' as const })))}>全部跳过</Button>
            <Button type="default" size="small" onClick={() => setRows(prev => prev.map(c => ({ ...c, action: 'add' as const })))}>全部新增</Button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Button type="default" size="small" onClick={onCancel}>取消导入</Button>
            <Button type="default" size="small" onClick={onConfirm}>确认导入（{addCount} 条冲突新增）</Button>
          </div>
        </div>
      }
    >
      <p style={{ fontSize: '0.85rem', color: COLORS.textTertiary, marginBottom: 12, textAlign: 'center' }}>
        以下 {conflicts.length} 条记录的字段名已存在但翻译不同，请选择对冲突记录的处理方式：
      </p>
      <Table
        size="small"
        dataSource={rows}
        rowKey={(_, index) => String(index ?? 0)}
        pagination={false}
        columns={[
          {
            title: '英文字段',
            dataIndex: 'original',
            key: 'original',
          },
          {
            title: '已有翻译',
            dataIndex: 'existing',
            key: 'existing',
            render: (v) => <Typography.Text type="secondary">{v}</Typography.Text>,
          },
          {
            title: '导入翻译',
            dataIndex: 'incoming',
            key: 'incoming',
          },
          {
            title: '处理方式',
            key: 'action',
            width: 128,
            align: 'center',
            render: (_, c, idx) => (
              <Radio.Group value={c.action} onChange={e => { setRows(prev => prev.map((item, i) => i === idx ? { ...item, action: e.target.value } : item)) }}>
                <Radio value="skip">跳过</Radio>
                <Radio value="add">新增</Radio>
              </Radio.Group>
            ),
          },
        ]}
      />
    </Modal>
  )
}
