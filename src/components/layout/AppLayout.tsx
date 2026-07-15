import React from 'react'
import { Layout, Menu, Typography, Button, Tag, Tooltip, Popover, Tabs, Avatar, Dropdown, Space } from 'antd'
import {
  MenuFoldOutlined, MenuUnfoldOutlined, UserOutlined, LogoutOutlined,
  LockOutlined as LockOutlinedRev, GlobalOutlined, KeyOutlined,
} from '@ant-design/icons'
import type { AuthUser } from '../../Login'
import type { TabItem } from '../../types'
import { COLORS } from '../../constants'
import AnnouncementBanner from './AnnouncementBanner'

export interface MenuItemDef {
  key: string
  icon?: React.ReactNode
  label: string
  children?: MenuItemDef[]
}

export interface AppLayoutProps {
  tab: string
  openTabs: TabItem[]
  siderCollapsed: boolean
  siderOpenKeys: string[]
  menuItems: MenuItemDef[]
  currentUser: AuthUser | null
  isAdmin: boolean
  offlineMode: boolean
  dbError: string
  appVersion: string
  contentMap: Record<string, React.ReactNode>
  onMenuClick: (key: string) => void
  onTabClose: (key: string) => void
  onTabChange: (key: string) => void
  onToggleSider: () => void
  onSiderOpenChange: (keys: string[]) => void
  onLogout: () => void
  onChangePassword: () => void
  onTokenManage: () => void
  onDismissDbError: () => void
}

const AppLayout: React.FC<AppLayoutProps> = ({
  tab,
  openTabs,
  siderCollapsed,
  siderOpenKeys,
  menuItems,
  currentUser,
  isAdmin,
  offlineMode,
  dbError,
  appVersion,
  contentMap,
  onMenuClick,
  onTabClose,
  onTabChange,
  onToggleSider,
  onSiderOpenChange,
  onLogout,
  onChangePassword,
  onTokenManage,
  onDismissDbError,
}) => {
  return (
    <Layout style={{ height: '100vh' }}>
      {/* ====== 顶部导航条 ====== */}
      <Layout.Header style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '0 1rem', height: 48, lineHeight: '48px',
        background: '#fff', borderBottom: '1px solid #f0f0f0',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 28, height: 28, borderRadius: 6,
            background: COLORS.primary, color: '#fff',
          }}>
            <GlobalOutlined style={{ fontSize: 16 }} />
          </div>
          <span style={{ fontSize: '0.95rem', fontWeight: 800, color: COLORS.textPrimary }}>数据组常用工具</span>
          <Popover
            content={offlineMode ? '单机版，数据使用 localStorage 存储，清除浏览器数据后会被清除，请及时备份' : '点击下载单机文件'}
            trigger="hover"
          >
            <Typography.Text
              style={{ fontSize: '0.75rem', fontFamily: 'monospace', cursor: offlineMode ? 'default' : 'pointer' }}
              type="secondary"
              {...(!offlineMode && {
                onClick: () => {
                  const a = document.createElement('a')
                  a.href = '/单机版.html'
                  a.download = '数据组常用工具.html'
                  document.body.appendChild(a); a.click(); document.body.removeChild(a)
                }
              })}
            >{appVersion}</Typography.Text>
          </Popover>
        </div>

        <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
          <AnnouncementBanner />
        </div>

        {/* 用户头像 + 下拉菜单 */}
        {!offlineMode && currentUser && (
          <Dropdown
            menu={{
              items: [
                { key: 'info', label: <Space size={4}><span style={{ fontWeight: 600 }}>{currentUser.displayName}</span><Tag color={isAdmin ? 'blue' : 'default'}>{currentUser.roleName || currentUser.role}</Tag></Space>, disabled: true },
                { type: 'divider' as const },
                { key: 'password', icon: <LockOutlinedRev />, label: '修改密码', onClick: onChangePassword },
                { key: 'tokens', icon: <KeyOutlined />, label: 'API Token', onClick: onTokenManage },
                { key: 'logout', icon: <LogoutOutlined />, label: '退出登录', danger: true, onClick: onLogout },
              ],
            }}
            placement="bottomRight"
            trigger={['click']}
          >
            <Avatar
              size="small"
              icon={<UserOutlined />}
              style={{ cursor: 'pointer', flexShrink: 0, backgroundColor: isAdmin ? COLORS.primary : '#87a3c3' }}
            />
          </Dropdown>
        )}
      </Layout.Header>

      {/* ====== 下方左右布局 ====== */}
      <Layout style={{ flex: 1 }}>
        {/* 左侧菜单 — inline 模式，可缩起/展开 */}
        <Layout.Sider
          collapsible
          width={180}
          collapsedWidth={64}
          collapsed={siderCollapsed}
          theme="light"
          style={{ borderRight: '1px solid #f0f0f0' }}
          trigger={siderCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
          onCollapse={() => onToggleSider()}
        >
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
              <Menu
                mode="inline"
                selectedKeys={[tab]}
                openKeys={siderOpenKeys}
                onOpenChange={onSiderOpenChange}
                onClick={({ key }) => onMenuClick(key)}
                items={menuItems as any}
                style={{ borderInlineEnd: 'none' }}
              />
            </div>
          </div>
        </Layout.Sider>

        {/* 右侧内容 */}
        <Layout id="main-content-area" style={{ position: 'relative', zIndex: 2 }}>
          {/* 标签页栏 */}
          <div style={{ background: '#fff', borderBottom: '1px solid #f0f0f0', padding: '4px 16px 0' }}>
            <Tabs
              type="editable-card"
              hideAdd
              activeKey={tab}
              onChange={onTabChange}
              onEdit={(targetKey, action) => { if (action === 'remove') onTabClose(String(targetKey)) }}
              items={openTabs.map(t => ({
                key: t.key,
                label: t.label,
                closable: openTabs.length > 1,
              }))}
              size="small"
              style={{ marginBottom: 0 }}
            />
          </div>

          {/* 错误提示 */}
          {dbError && (
            <div style={{ padding: '0.5rem 1.5rem 0' }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 16px', borderRadius: 8,
                background: 'rgba(255,77,79,0.08)', border: '1px solid rgba(255,77,79,0.25)',
                fontSize: '0.85rem', color: '#ff4d4f',
              }}>
                <span style={{ flexShrink: 0, width: 16, height: 16, display: 'inline-flex', alignItems: 'center' }}>⚠</span>
                <span>{dbError}</span>
                <Tooltip title="关闭">
                  <Button type="text" size="small" onClick={onDismissDbError} danger style={{ marginLeft: 'auto' }}>✕</Button>
                </Tooltip>
              </div>
            </div>
          )}

          <Layout.Content style={{ padding: '1.5rem', background: '#f5f5f5', overflow: 'auto', flex: 1 }}>
            {contentMap[tab]}
          </Layout.Content>
        </Layout>
      </Layout>
    </Layout>
  )
}

export default AppLayout
