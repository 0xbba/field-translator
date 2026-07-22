// ============ 存储键 ============
export const STORAGE_KEY = 'fieldTranslator_mapping'
export const DB_URL_KEY = 'fieldTranslator_dbUrl'
export const TOKEN_KEY = 'fieldTranslator_token'
export const LOCAL_LEDGER_KEY = 'fieldTranslator_ledger'

// ============ 分页常量 ============
export const LOG_PAGE_SIZE = 5
export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const

// ============ 版本号 ============
export const APP_VERSION = 'v1.13.0.20260722'

// ============ 多账期占位符 ============
export const MD_PLACEHOLDERS: Record<string, string> = {
  date: '${yyyyMMdd}',
  month: '${yyyyMM}',
  year: '${yyyy}',
}
export const MD_FORMAT: Record<string, string> = { date: 'YYYYMMDD', month: 'YYYYMM', year: 'YYYY' }
export const MD_STEP: Record<string, string> = { date: 'day', month: 'month', year: 'year' }

// ============ 台账字段定义 ============
export const LEDGER_FIELDS = [
  { key: 'requestNo', label: '数据单号', width: 140 },
  { key: 'requestTime', label: '申请时间', width: 150 },
  { key: 'applicant', label: '申请员工', width: 100 },
  { key: 'applicantPhone', label: '申请员工电话', width: 130 },
  { key: 'applicantDept', label: '申请部门', width: 160 },
  { key: 'requestTitle', label: '申请标题', width: 200 },
  { key: 'requestReason', label: '申请事由', width: 200 },
  { key: 'requestDataContent', label: '申请数据内容', width: 250 },
  { key: 'processor', label: '处理人', width: 100 },
  { key: 'finishTime', label: '完成时间', width: 150 },
  { key: 'createDate', label: '创建时间', width: 150, readonly: true },
] as const

// ============ 标签页标签映射 ============
export const TAB_LABELS: Record<string, string> = {
  translate: '翻译',
  manage: '管理对照记录',
  insertgen: '生成INSERT',
  multidate: '多账期SQL',
  ledgerParse: '解析录入',
  ledgerManage: '管理台账',
  ledgerStats: '台账统计',
  users: '用户管理',
  roles: '角色管理',
  announcements: '公告管理',
}

// ============ 语义化颜色常量（对齐 antd 5 默认主题 token） ============
// 替代硬编码颜色值，换主题只需改这里
export const COLORS = {
  primary: '#1677ff',                  // colorPrimary
  textPrimary: 'rgba(0,0,0,0.88)',     // colorText
  textSecondary: 'rgba(0,0,0,0.65)',   // colorTextSecondary
  textTertiary: 'rgba(0,0,0,0.45)',    // colorTextTertiary
  textQuaternary: 'rgba(0,0,0,0.25)',  // colorTextQuaternary
} as const
