import { useState, useCallback, useEffect, useMemo, Component } from 'react'
import type { ReactNode } from 'react'
import { ConfigProvider, App as AntApp } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import {
  TranslationOutlined, CodeOutlined, CalendarOutlined,
  UserOutlined, TeamOutlined, HddOutlined,
  DatabaseOutlined, SettingOutlined,
  TableOutlined, FormOutlined,
  NotificationOutlined, BarChartOutlined,
} from '@ant-design/icons'
import { AppContext } from './contexts/AppContext'
import { useAuth } from './hooks/useAuth'
import { useMapping } from './hooks/useMapping'
import { useManage } from './hooks/useManage'
import { useInsert } from './hooks/useInsert'
import { useMultidate } from './hooks/useMultidate'
import { useLedger } from './hooks/useLedger'
import { Api } from './api'
import { loadToken } from './utils/auth'
import { APP_VERSION, TAB_LABELS } from './constants'
import Login from './Login'
import type { MappingItem, TabItem } from './types'

// 页面组件
import TranslatePage from './components/pages/TranslatePage'
import ManagePage from './components/pages/ManagePage'
import InsertGenPage from './components/pages/InsertGenPage'
import MultidatePage from './components/pages/MultidatePage'
import LedgerParsePage from './components/pages/LedgerParsePage'
import LedgerManagePage from './components/pages/LedgerManagePage'
import LedgerStatsPage from './components/pages/LedgerStatsPage'
import UsersPage from './components/pages/UsersPage'
import RolesPage from './components/pages/RolesPage'
import AnnouncementsPage from './components/pages/AnnouncementsPage'

// 布局组件
import AppLayout from './components/layout/AppLayout'

// 弹窗组件
import ImportConflictModal from './components/modals/ImportConflictModal'
import LogModal from './components/modals/LogModal'
import PasswordModal from './components/modals/PasswordModal'
import TokenModal from './components/modals/TokenModal'


// 错误边界组件
class PageErrorBoundary extends Component<{ name: string; children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }
  static getDerivedStateFromError(error: Error) { return { error } }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 20, color: '#cf1322', background: '#fff2f0', borderRadius: 8, margin: 10 }}>
          <strong>[{this.props.name}] 渲染崩溃</strong>
          <pre style={{ marginTop: 8, fontSize: 12, whiteSpace: 'pre-wrap', color: '#666' }}>{this.state.error.message}{'\n\n'}{this.state.error.stack}</pre>
          <button onClick={() => this.setState({ error: null })} style={{ marginTop: 8, padding: '4px 12px' }}>重试</button>
        </div>
      )
    }
    return this.props.children
  }
}

function AppContent() {
  const { message, modal } = AntApp.useApp()

  // ============ 认证 ============
  const auth = useAuth(message)
  const { currentUser, authChecking, setAuthChecking, login, logout, fetchMe,
    passwordModalOpen, setPasswordModalOpen, pwdOld, pwdNew, pwdNew2, pwdLoading,
    setPwdOld, setPwdNew, setPwdNew2, handleChangePassword, setLocalUser } = auth

  // ============ 数据库连接状态 ============
  const [dataMode] = useState<'local' | 'database'>('database')
  const [dbUrl] = useState(() => { try { return localStorage.getItem('fieldTranslator_dbUrl') || '' } catch { return '' } })
  const [dbConnected, setDbConnected] = useState(false)
  const [dbError, setDbError] = useState('')
  const [dbLoading, setDbLoading] = useState(false)
  const [offlineMode, setOfflineMode] = useState(false)

  // 检测 API 可用性
  useEffect(() => {
    if (dataMode === 'local') { setOfflineMode(true); return }
    setDbLoading(true)
    Api.test().then(() => { setDbConnected(true); setDbError(''); setOfflineMode(false) })
      .catch(() => { setDbConnected(false); setDbError('API 不可用，已切换到本地模式'); setOfflineMode(true) })
      .finally(() => setDbLoading(false))
  }, [dataMode])

  // dbUrl 变化时保存
  useEffect(() => { try { localStorage.setItem('fieldTranslator_dbUrl', dbUrl) } catch { /* ignore */ } }, [dbUrl])

  // ============ 权限判断 ============
  const perms = currentUser?.permissions || []
  const hasPerm = useCallback((key: string) => perms.includes(key), [perms])
  const isAdmin = useCallback(() => currentUser?.role === 'admin', [currentUser])

  // 默认标签页（根据权限）
  const getDefaultTab = useCallback((): string => {
    for (const [key] of Object.entries(TAB_LABELS)) { if (hasPerm(key) || hasPerm(TAB_TO_PERM[key] || key)) return key }
    return 'translate'
  }, [hasPerm])

  // Tab key → 权限 key 映射（用于权限守卫）
  const TAB_TO_PERM: Record<string, string> = {
    manage: 'manage_view',
    ledgerParse: 'ledger_parse',
    ledgerManage: 'ledger_view',
    ledgerStats: 'ledger_view',
    users: 'user_manage',
    roles: 'role_manage',
    announcements: 'announcement_manage',
  }

  // ============ 已删除记录状态（翻译管理） ============
  const [showDeleted, setShowDeleted] = useState(false)
  const [deletedData, setDeletedData] = useState<MappingItem[]>([])
  const [tokenModalOpen, setTokenModalOpen] = useState(false)

  // ============ 各功能 Hooks ============
  const mappingHook = useMapping(dataMode, offlineMode, dbUrl, message)
  const manageHook = useManage(
    mappingHook.mappingData, mappingHook.setMappingData,
    dataMode, offlineMode, dbUrl,
    showDeleted, setShowDeleted, deletedData, setDeletedData,
    mappingHook.fetchDbMapping, mappingHook.persistMapping, message
  )
  const insertHook = useInsert(message)
  const multidateHook = useMultidate(message)
  const ledgerHook = useLedger(dataMode, offlineMode, dbUrl, message, modal)

  // ============ 用户/角色数据 ============
  const [rolesData, setRolesData] = useState<any[]>([])
  const [allPerms, setAllPerms] = useState<any[]>([])
  const [usersData, setUsersData] = useState<any[]>([])
  const fetchRoles = useCallback(async () => {
    const [roles, perms] = await Promise.all([Api.rolesList(), Api.permissionsList()])
    setRolesData(roles); setAllPerms(perms)
  }, [])
  const fetchUsers = useCallback(async () => {
    setUsersData(await Api.usersList())
  }, [])

  // ============ 标签页 & 菜单 ============
  const [tab, setTab] = useState(getDefaultTab())
  const [openTabs, setOpenTabs] = useState<TabItem[]>([{ key: 'translate', label: '翻译' }])
  const [siderCollapsed, setSiderCollapsed] = useState(window.innerWidth < 768)
  const [siderOpenKeys, setSiderOpenKeys] = useState<string[]>(window.innerWidth < 768 ? [] : ['field-group', 'ledger-group', 'system-group'])

  const handleToggleSider = useCallback(() => {
    setSiderCollapsed(prev => {
      const next = !prev
      if (next) {
        // 折叠时立即清空 openKeys
        setSiderOpenKeys([])
      } else {
        // 展开时先清空，等 Sider 过渡动画完成后再恢复（避免窄容器中渲染子菜单导致闪乱）
        setSiderOpenKeys([])
        setTimeout(() => {
          setSiderOpenKeys(['field-group', 'ledger-group', 'system-group'])
        }, 250)
      }
      return next
    })
  }, [])

  const handleSiderOpenChange = useCallback((keys: string[]) => {
    setSiderOpenKeys(keys)
  }, [])

  const hasManagePerm = useMemo(() => ['manage_edit','manage_delete','manage_restore','manage_log'].some(hasPerm), [hasPerm])
  const hasLedgerManagePerm = useMemo(() => ['ledger_edit','ledger_delete','ledger_restore','ledger_log'].some(hasPerm), [hasPerm])

  const menuItems = useMemo(() => [
    { key: 'field-group', label: '字段翻译', icon: <TranslationOutlined />, children: [
      { key: 'translate', label: '翻译', icon: <TranslationOutlined /> },
      ...(hasManagePerm ? [{ key: 'manage', label: '管理对照记录', icon: <TableOutlined /> }] : []),
    ]},
    { key: 'insertgen', label: '生成INSERT', icon: <CodeOutlined /> },
    { key: 'multidate', label: '多账期SQL', icon: <CalendarOutlined /> },
    { key: 'ledger-group', label: '数据需求台账', icon: <DatabaseOutlined />, children: [
      { key: 'ledgerParse', label: '解析录入', icon: <FormOutlined /> },
      ...(hasLedgerManagePerm ? [{ key: 'ledgerManage', label: '管理台账', icon: <HddOutlined /> }] : []),
      ...(hasLedgerManagePerm ? [{ key: 'ledgerStats', label: '台账统计', icon: <BarChartOutlined /> }] : []),
    ]},
    ...((isAdmin() || hasPerm('announcement_manage')) ? [{ key: 'system-group', label: '系统管理', icon: <SettingOutlined />, children: [
      ...(isAdmin() ? [
        { key: 'users', label: '用户管理', icon: <UserOutlined /> },
        { key: 'roles', label: '角色管理', icon: <TeamOutlined /> },
      ] : []),
      ...(hasPerm('announcement_manage') ? [{ key: 'announcements', label: '公告管理', icon: <NotificationOutlined /> }] : []),
    ]}] : []),
  ], [hasPerm, isAdmin, hasManagePerm, hasLedgerManagePerm])

  const contentMap: Record<string, ReactNode> = useMemo(() => ({
    translate: <PageErrorBoundary name="TranslatePage"><TranslatePage mappingHook={mappingHook} /></PageErrorBoundary>,
    manage: <PageErrorBoundary name="ManagePage"><ManagePage manageHook={manageHook} showDeleted={showDeleted} setShowDeleted={setShowDeleted} /></PageErrorBoundary>,
    insertgen: <PageErrorBoundary name="InsertGenPage"><InsertGenPage insertHook={insertHook} /></PageErrorBoundary>,
    multidate: <PageErrorBoundary name="MultidatePage"><MultidatePage multidateHook={multidateHook} /></PageErrorBoundary>,
    ledgerParse: <PageErrorBoundary name="LedgerParsePage"><LedgerParsePage ledgerHook={ledgerHook} /></PageErrorBoundary>,
    ledgerManage: <PageErrorBoundary name="LedgerManagePage"><LedgerManagePage ledgerHook={ledgerHook} /></PageErrorBoundary>,
    ledgerStats: <PageErrorBoundary name="LedgerStatsPage"><LedgerStatsPage /></PageErrorBoundary>,
    users: <PageErrorBoundary name="UsersPage"><UsersPage usersData={usersData} rolesData={rolesData} fetchUsers={fetchUsers} message={message} currentUser={currentUser} /></PageErrorBoundary>,
    roles: <PageErrorBoundary name="RolesPage"><RolesPage rolesData={rolesData} allPerms={allPerms} fetchRoles={fetchRoles} message={message} /></PageErrorBoundary>,
    announcements: <PageErrorBoundary name="AnnouncementsPage"><AnnouncementsPage /></PageErrorBoundary>,
  }), [mappingHook, manageHook, insertHook, multidateHook, ledgerHook, usersData, rolesData, fetchUsers, fetchRoles, showDeleted, message, currentUser])

  // 标签页交互
  const handleMenuClick = useCallback((key: string) => {
    setTab(key)
    const label = TAB_LABELS[key]
    if (label && !openTabs.find(t => t.key === key)) setOpenTabs(prev => [...prev, { key, label }])
  }, [openTabs])
  const handleTabClose = useCallback((targetKey: string) => {
    const nextTabs = openTabs.filter(t => t.key !== targetKey)
    setOpenTabs(nextTabs)
    if (tab === targetKey) setTab(nextTabs.length > 0 ? nextTabs[nextTabs.length - 1].key : getDefaultTab())
  }, [openTabs, tab, getDefaultTab])
  const handleTabChange = useCallback((key: string) => setTab(key), [])

  // 标签页权限保护
  useEffect(() => {
    const permKey = TAB_TO_PERM[tab] || tab
    if (!hasPerm(tab) && !hasPerm(permKey)) { const valid = getDefaultTab(); setTab(valid); handleMenuClick(valid) }
  }, [tab, hasPerm, getDefaultTab, handleMenuClick])

  // 初始化：自动登录
  useEffect(() => {
    if (loadToken()) {
      fetchMe().finally(() => setAuthChecking(false))
    } else if (offlineMode) {
      // 离线模式无需登录，使用本地默认用户
      setLocalUser()
      setAuthChecking(false)
    } else {
      setAuthChecking(false)
    }
  }, [offlineMode]) // eslint-disable-line react-hooks/exhaustive-deps

  // tab=users 时加载用户数据，tab=users或roles 时加载角色数据
  useEffect(() => { if (tab === 'users') fetchUsers() }, [tab, fetchUsers])
  useEffect(() => { if (tab === 'users' || tab === 'roles') fetchRoles() }, [tab, fetchRoles])

  // tab=ledgerManage 或 ledgerParse 时加载台账数据（按需，仅首次）
  useEffect(() => {
    if (tab === 'ledgerManage' || tab === 'ledgerParse') {
      ledgerHook.markLedgerLoaded()
      ledgerHook.fetchLedger()
    }
  }, [tab]) // eslint-disable-line react-hooks/exhaustive-deps

  // ============ Context Value ============
  const contextValue = useMemo(() => ({ message, modal, currentUser, hasPerm, isAdmin,
    dataMode, offlineMode, dbUrl, dbConnected, dbError, dbLoading,
    mappingData: mappingHook.mappingData, fetchDbMapping: mappingHook.fetchDbMapping, persistMapping: mappingHook.persistMapping }),
  [message, modal, currentUser, hasPerm, isAdmin, dataMode, offlineMode, dbUrl, dbConnected, dbError, dbLoading,
    mappingHook.mappingData, mappingHook.fetchDbMapping, mappingHook.persistMapping])

  // ============ 登录守卫 ============
  if (!currentUser && !authChecking) return <Login onLogin={login} />
  if (authChecking) return null

  return (
    <AppContext.Provider value={contextValue}>
      <AppLayout
        tab={tab}
        openTabs={openTabs}
        siderCollapsed={siderCollapsed}
        siderOpenKeys={siderOpenKeys}
        menuItems={menuItems}
        currentUser={currentUser}
        isAdmin={isAdmin()}
        offlineMode={offlineMode}
        dbError={dbError}
        appVersion={APP_VERSION}
        contentMap={contentMap}
        onMenuClick={handleMenuClick}
        onTabClose={handleTabClose}
        onTabChange={handleTabChange}
        onToggleSider={handleToggleSider}
        onSiderOpenChange={handleSiderOpenChange}

        onLogout={() => { logout(); setTab('translate'); setOpenTabs([{ key: 'translate', label: '翻译' }]) }}
        onChangePassword={() => setPasswordModalOpen(true)}
        onDismissDbError={() => setDbError('')}
        onTokenManage={() => setTokenModalOpen(true)}
      />

      {/* 公共弹窗 */}
      <ImportConflictModal open={!!manageHook.importConflicts} conflicts={manageHook.importConflicts || []} onConfirm={manageHook.confirmImportConflicts} onCancel={() => manageHook.setImportConflicts(null)} />
      <LogModal open={manageHook.logModalOpen} data={manageHook.logData} total={manageHook.logTotal} page={manageHook.logPage} totalPages={manageHook.logTotalPages} onPageChange={manageHook.handleLogPageChange} onClose={() => manageHook.setLogModalOpen(false)} />
      <PasswordModal open={passwordModalOpen} loading={pwdLoading} oldPwd={pwdOld} newPwd={pwdNew} newPwd2={pwdNew2} onOldPwdChange={setPwdOld} onNewPwdChange={setPwdNew} onNewPwd2Change={setPwdNew2} onOk={handleChangePassword} onCancel={() => setPasswordModalOpen(false)} />
      <TokenModal open={tokenModalOpen} onCancel={() => setTokenModalOpen(false)} />
    </AppContext.Provider>
  )
}

function App() {
  return (
    <ConfigProvider locale={zhCN} getPopupContainer={node => {
      if (node) {
        let el: HTMLElement | null = node
        while (el) {
          if (el.id === 'main-content-area') return el
          el = el.parentElement
        }
      }
      return document.body
    }}>
      <AntApp>
        <AppContent />
      </AntApp>
    </ConfigProvider>
  )
}

export default App
