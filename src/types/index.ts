// ============ 翻译对照记录 ============
export interface MappingItem {
  original: string
  chinese: string
  _dbId?: number
  _deleted?: boolean
}

// ============ 数据需求台账 ============
export interface LedgerRecord {
  _dbId?: number
  _deleted?: boolean
  requestNo: string
  requestTime: string
  applicant: string
  applicantPhone: string
  applicantDept: string
  requestTitle: string
  requestReason: string
  requestDataContent: string
  processor: string
  finishTime?: string
  createDate?: string
}

// ============ 提取记录 ============
export interface ExtractionRecord {
  id?: number
  requestNo: string
  recordCount: number
  extractor: string
  supervisor: string
  remark: string
  createDate?: string
  isVisible?: boolean
}

// ============ 翻译列数据 ============
export interface ColumnData {
  original: string
  translated: string
  alternatives: MappingItem[]
  selectedAlt: number
}

// ============ 操作日志 ============
export interface LogEntry {
  id: number
  operation: string
  recordId: number | null
  fieldName: string | null
  oldValue: string | null
  newValue: string | null
  userName: string | null
  operationDate: string
}

// ============ INSERT 字段配置 ============
export interface InsertField {
  name: string
  quoted: boolean
  enabled: boolean
}

export type InsertDialect = 'pg' | 'hive'

// ============ 批量翻译解析项 ============
export interface BatchParseItem {
  original: string
  chinese: string
  matchedIdx: number
}

// ============ 导入冲突项 ============
export interface ImportConflict {
  original: string
  existing: string
  incoming: string
}

// ============ 多账期选择器类型 ============
export type MdPicker = 'date' | 'month' | 'year'

// ============ 标签页项 ============
export interface TabItem {
  key: string
  label: string
}

// ============ 用户/角色表单 ============
export interface UserForm {
  username: string
  password: string
  role: string
  displayName: string
  isActive: boolean
}

export interface RoleForm {
  roleKey: string
  roleName: string
  permissions: string[]
}

// ============ API Token ============
export interface ApiToken {
  id: number
  name: string
  token?: string      // 仅在创建时返回
  lastUsed?: string | null
  expiresAt?: string | null
  expired?: boolean
  createDate: string
}

// ============ 公告 ============
export interface Announcement {
  id: number
  content: string
  isActive?: boolean
  expiresAt?: string | null
  isVisible?: boolean
  userName?: string
  createDate?: string
  lastModified?: string
}

// ============ 用户信息（认证/管理） ============
export interface AuthUser {
  id: number
  username: string
  displayName: string
  role: string
  roleName: string
  permissions: string[]
}

export interface UserItem {
  id: number
  username: string
  role: string
  displayName: string
  isActive: boolean
  createDate: string
  lastModified: string
}

// ============ 角色信息（管理） ============
export interface RoleItem {
  id: number
  role_key: string
  role_name: string
  permissions: string[]
  is_builtin: boolean
  create_date: string
  last_modified: string
}

// ============ 权限树节点 ============
export interface PermissionNode {
  key: string
  label: string
  children?: PermissionNode[]
}
