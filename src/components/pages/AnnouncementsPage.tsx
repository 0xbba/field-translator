import { useState, useEffect, useCallback } from 'react'
import { Typography, Button, Table, Modal, Input, Tag, Popconfirm, Tooltip, Switch, DatePicker } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, UndoOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { Api } from '../../api'
import { useAppContext } from '../../contexts/AppContext'
import type { Announcement } from '../../types'

const PAGE_SIZE = 10

export default function AnnouncementsPage() {
  const { message } = useAppContext()
  const [data, setData] = useState<Announcement[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)

  const [modalOpen, setModalOpen] = useState(false)
  const [editMode, setEditMode] = useState<'add' | 'edit'>('add')
  const [editId, setEditId] = useState<number | null>(null)
  const [formContent, setFormContent] = useState('')
  const [formIsActive, setFormIsActive] = useState(true)
  const [formExpiresAt, setFormExpiresAt] = useState<string | null>(null)

  const fetchData = useCallback(async (p?: number) => {
    setLoading(true)
    try {
      const res = await Api.announcementAll(p || page, PAGE_SIZE)
      setData(res.data)
      setTotal(res.total)
    } catch (err: any) {
      message.error(err.message)
    } finally {
      setLoading(false)
    }
  }, [page, message])

  useEffect(() => { fetchData() }, [page]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleAdd = () => {
    setEditMode('add'); setEditId(null); setFormContent(''); setFormIsActive(true); setFormExpiresAt(null); setModalOpen(true)
  }

  const handleEdit = (record: Announcement) => {
    setEditMode('edit'); setEditId(record.id)
    setFormContent(record.content); setFormIsActive(record.isActive ?? true); setFormExpiresAt(record.expiresAt ?? null)
    setModalOpen(true)
  }

  const handleSave = async () => {
    if (!formContent.trim()) { message.warning('公告内容不能为空'); return }
    try {
      if (editMode === 'add') {
        await Api.announcementAdd(formContent.trim(), formIsActive, formExpiresAt)
        message.success('添加成功')
      } else {
        await Api.announcementUpdate(editId!, { content: formContent.trim(), isActive: formIsActive, expiresAt: formExpiresAt })
        message.success('修改成功')
      }
      setModalOpen(false)
      fetchData()
    } catch (err: any) {
      message.error(err.message)
    }
  }

  const handleDelete = async (id: number) => {
    try { await Api.announcementDelete(id); message.success('已删除'); fetchData() }
    catch (err: any) { message.error(err.message) }
  }

  const handleRestore = async (id: number) => {
    try { await Api.announcementRestore(id); message.success('已恢复'); fetchData() }
    catch (err: any) { message.error(err.message) }
  }

  const handleToggleActive = async (record: Announcement) => {
    try {
      await Api.announcementUpdate(record.id, { isActive: !record.isActive })
      message.success(record.isActive ? '已禁用' : '已启用')
      fetchData()
    } catch (err: any) {
      message.error(err.message)
    }
  }

  // 判断公告是否已过期
  const isExpired = (expiresAt?: string | null) => {
    if (!expiresAt) return false
    return dayjs(expiresAt).isBefore(dayjs())
  }

  return (
    <div>
      <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography.Text strong>公告列表（共 {total} 条）</Typography.Text>
        <Button type="primary" size="small" icon={<PlusOutlined style={{ fontSize: 14 }} />} onClick={handleAdd}>新增公告</Button>
      </div>

      <Table
        size="small"
        dataSource={data}
        rowKey="id"
        loading={loading}
        pagination={{
          current: page,
          pageSize: PAGE_SIZE,
          total,
          showSizeChanger: false,
          onChange: (p) => setPage(p),
          showTotal: (t) => `共 ${t} 条`,
        }}
        scroll={{ x: 800 }}
        columns={[
          {
            title: '序号', key: '_idx', width: 60, align: 'center',
            render: (_, __, idx) => (page - 1) * PAGE_SIZE + idx + 1,
          },
          {
            title: '内容', dataIndex: 'content', key: 'content', ellipsis: true,
            render: (v: string, record: Announcement) => (
              <span style={record.isVisible === false ? { textDecoration: 'line-through', color: 'rgba(0,0,0,0.25)' } : {}}>
                {v}
              </span>
            ),
          },
          {
            title: '启用', key: 'isActive', width: 70, align: 'center',
            render: (_, record: Announcement) => record.isVisible === false ? '-' : (
              <Switch size="small" checked={record.isActive} onChange={() => handleToggleActive(record)} />
            ),
          },
          {
            title: '到期时间', dataIndex: 'expiresAt', key: 'expiresAt', width: 170,
            render: (v: string | null) => {
              if (!v) return <span style={{ color: '#999' }}>永久</span>
              return <span style={{ whiteSpace: 'nowrap' }}>
                {dayjs(v).format('YYYY-MM-DD HH:mm')}
              </span>
            },
          },
          {
            title: '状态', key: 'status', width: 80, align: 'center',
            render: (_, record: Announcement) => {
              if (record.isVisible === false) return <Tag color="default">已删除</Tag>
              if (!record.isActive) return <Tag color="warning">已禁用</Tag>
              if (isExpired(record.expiresAt)) return <Tag color="error">已过期</Tag>
              return <Tag color="success">生效中</Tag>
            },
          },
          { title: '操作人', dataIndex: 'userName', key: 'userName', width: 100 },
          {
            title: '操作', key: 'action', width: 100, align: 'center', fixed: 'right',
            render: (_: any, record: Announcement) => (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                <Tooltip title="编辑">
                  <Button type="text" size="small" onClick={() => handleEdit(record)} icon={<EditOutlined style={{ fontSize: 14 }} />} />
                </Tooltip>
                {record.isVisible !== false ? (
                  <Popconfirm title="确定删除？" onConfirm={() => handleDelete(record.id)}>
                    <Tooltip title="删除"><Button type="text" size="small" danger icon={<DeleteOutlined style={{ fontSize: 14 }} />} /></Tooltip>
                  </Popconfirm>
                ) : (
                  <Tooltip title="恢复">
                    <Button type="text" size="small" onClick={() => handleRestore(record.id)} icon={<UndoOutlined style={{ fontSize: 14 }} />} />
                  </Tooltip>
                )}
              </div>
            ),
          },
        ]}
      />

      <Modal
        open={modalOpen}
        title={editMode === 'add' ? '新增公告' : '编辑公告'}
        onCancel={() => setModalOpen(false)}
        onOk={handleSave}
        centered
        width={560}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 12 }}>
          <Input.TextArea
            value={formContent}
            onChange={e => setFormContent(e.target.value)}
            placeholder="请输入公告内容"
            autoSize={{ minRows: 3, maxRows: 8 }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: '0.85rem', color: '#333', flexShrink: 0 }}>到期时间</span>
            <DatePicker
              showTime
              placeholder="不设置则永久有效"
              style={{ flex: 1 }}
              value={formExpiresAt ? dayjs(formExpiresAt) : undefined}
              onChange={(_date, dateString) => {
                const str = Array.isArray(dateString) ? dateString[0] : dateString
                setFormExpiresAt(str ? dayjs(str).format('YYYY-MM-DD HH:mm:ss') : null)
              }}
            />
            <span style={{ fontSize: '0.85rem', color: '#333', flexShrink: 0 }}>启用</span>
            <Switch checked={formIsActive} onChange={v => setFormIsActive(v)} />
          </div>
        </div>
      </Modal>
    </div>
  )
}
