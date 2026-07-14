import { useState, useEffect, useMemo } from 'react'
import { Typography, Button, Table, Modal, Tag, Input, Tree, Popconfirm, Tooltip } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import type { MessageInstance } from 'antd/es/message/interface'
import { Api } from '../../api'

interface RolesPageProps {
  rolesData: any[]
  allPerms: any[]
  fetchRoles: () => void
  message: MessageInstance
}

export default function RolesPage({ rolesData, allPerms, fetchRoles, message }: RolesPageProps) {
  const [roleModalOpen, setRoleModalOpen] = useState(false)
  const [roleEditMode, setRoleEditMode] = useState<'add' | 'edit'>('add')
  const [roleEditId, setRoleEditId] = useState<number | null>(null)
  const [roleForm, setRoleForm] = useState({ roleKey: '', roleName: '', permissions: [] as string[] })

  const { permTreeData, permLabelMap, permLeafKeys } = useMemo(() => {
    const treeData: any[] = []
    const labelMap: Record<string, string> = {}
    const leafKeys = new Set<string>()
    const fullNameMap: Record<string, string> = {
      translate: '翻译',
      manage_view: '对照查看', manage_import: '对照导入', manage_edit: '对照编辑',
      manage_delete: '对照删除', manage_restore: '对照恢复', manage_log: '对照日志',
      insertgen: '生成INSERT', multidate: '多账期SQL',
      ledger_parse: '解析录入',
      ledger_view: '台账查看', ledger_edit: '台账编辑',
      ledger_delete: '台账删除', ledger_restore: '台账恢复', ledger_log: '台账日志',
      user_manage: '用户管理', role_manage: '角色管理',
      announcement_manage: '公告管理',
    }
    const buildNode = (item: any): any => {
      if (item.children) {
        return {
          key: item.key,
          title: item.label,
          children: item.children.map(buildNode),
        }
      }
      leafKeys.add(item.key)
      labelMap[item.key] = fullNameMap[item.key] || item.label
      return { key: item.key, title: item.label }
    }
    for (const group of allPerms) {
      treeData.push(buildNode(group))
    }
    return { permTreeData: treeData, permLabelMap: labelMap, permLeafKeys: leafKeys }
  }, [allPerms])

  const [permExpandedKeys, setPermExpandedKeys] = useState<string[]>([])
  useEffect(() => { if (roleModalOpen) setPermExpandedKeys([]) }, [roleModalOpen])

  return (
    <div>
      <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography.Text strong>角色列表（共 {rolesData.length} 个）</Typography.Text>
        <Button type="primary" size="small" icon={<PlusOutlined style={{ fontSize: 14 }} />} onClick={() => {
          setRoleEditMode('add'); setRoleEditId(null); setRoleForm({ roleKey: '', roleName: '', permissions: [] }); setRoleModalOpen(true)
        }}>新增角色</Button>
      </div>
      <Table
        size="small"
        dataSource={rolesData}
        rowKey="id"
        pagination={false}
        scroll={{ x: 800 }}
        columns={[
          { title: 'ID', dataIndex: 'id', key: 'id', width: 50, sorter: (a, b) => a.id - b.id },
          { title: '标识', dataIndex: 'role_key', key: 'role_key', width: 100, sorter: (a, b) => (a.role_key || '').localeCompare(b.role_key || ''), render: (v: string) => <Typography.Text code>{v}</Typography.Text> },
          { title: '名称', dataIndex: 'role_name', key: 'role_name', width: 120, sorter: (a, b) => (a.role_name || '').localeCompare(b.role_name || '') },
          { title: '权限', dataIndex: 'permissions', key: 'permissions', width: 300, ellipsis: true, render: (v: string[]) => <span>{(v || []).filter((p: string) => permLeafKeys.has(p)).map(p => permLabelMap[p] || p).join('、') || '-'}</span> },
          { title: '类型', dataIndex: 'is_builtin', key: 'is_builtin', width: 80, render: (v: boolean) => <Tag color={v ? 'blue' : 'default'}>{v ? '内置' : '自定义'}</Tag> },
          {
            title: '操作', key: 'action', width: 80, align: 'center' as const, fixed: 'right' as const,
            render: (_: any, r: any) => (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                <Tooltip title="编辑"><Button type="text" size="small" onClick={() => {
                  setRoleEditMode('edit'); setRoleEditId(r.id)
                  setRoleForm({ roleKey: r.role_key, roleName: r.role_name, permissions: (r.permissions || []).filter((k: string) => permLeafKeys.has(k)) })
                  setRoleModalOpen(true)
                }} icon={<EditOutlined style={{ fontSize: 14 }} />} /></Tooltip>
                <Popconfirm title="确定删除？" onConfirm={async () => {
                  try { await Api.roleDelete(r.id); message.success('已删除'); fetchRoles() } catch (err: any) { message.error(err.message) }
                }}>
                  <Tooltip title="删除"><Button type="text" size="small" danger disabled={r.is_builtin} icon={<DeleteOutlined style={{ fontSize: 14 }} />} /></Tooltip>
                </Popconfirm>
              </div>
            ),
          },
        ]}
      />

      <Modal
        open={roleModalOpen}
        title={roleEditMode === 'add' ? '新增角色' : '编辑角色'}
        onCancel={() => setRoleModalOpen(false)}
        centered
        getContainer={() => document.body}
        onOk={async () => {
          const cleanPerms = (roleForm.permissions || []).filter((k: string) => permLeafKeys.has(k))
          if (roleEditMode === 'add') {
            if (!roleForm.roleKey || !roleForm.roleName) { message.warning('角色标识和名称必填'); return }
            try { await Api.roleAdd(roleForm.roleKey, roleForm.roleName, cleanPerms); message.success('添加成功'); setRoleModalOpen(false); fetchRoles() }
            catch (err: any) { message.error(err.message) }
          } else {
            try { await Api.roleUpdate(roleEditId!, { roleName: roleForm.roleName, permissions: cleanPerms }); message.success('修改成功'); setRoleModalOpen(false); fetchRoles() }
            catch (err: any) { message.error(err.message) }
          }
        }}
        width={520}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 12 }}>
          <Input placeholder="角色标识（英文，如 editor）" value={roleForm.roleKey} onChange={e => setRoleForm(f => ({ ...f, roleKey: e.target.value }))} disabled={roleEditMode === 'edit'} />
          <Input placeholder="角色名称（中文，如 编辑员）" value={roleForm.roleName} onChange={e => setRoleForm(f => ({ ...f, roleName: e.target.value }))} />
          <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 8 }}>
            <Typography.Text strong style={{ fontSize: '0.85rem' }}>权限配置</Typography.Text>
            <Tree
              checkable
              expandedKeys={permExpandedKeys}
              onExpand={(keys) => setPermExpandedKeys(keys as string[])}
              checkedKeys={roleForm.permissions.filter((k: string) => permLeafKeys.has(k))}
              onCheck={(checked: any) => {
                const keys: string[] = Array.isArray(checked) ? checked : checked.checked
                setRoleForm(f => ({ ...f, permissions: keys.filter((k: string) => permLeafKeys.has(k)) }))
              }}
              treeData={permTreeData}
              style={{ marginTop: 8 }}
            />
          </div>
        </div>
      </Modal>
    </div>
  )
}
