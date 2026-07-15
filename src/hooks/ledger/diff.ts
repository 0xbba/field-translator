// 台账差异比较工具函数（供 useLedgerEntry 使用）

// 重复检测用的字段标签（台账所有可比较字段）
export const DIFF_LABELS: Record<string, string> = {
  requestTime: '申请时间', applicant: '申请员工', applicantPhone: '申请员工电话',
  applicantDept: '申请部门', requestTitle: '申请标题', requestReason: '申请事由',
  requestDataContent: '申请数据内容', processor: '处理人', finishTime: '完成时间',
}

/** 比较两条台账记录的变动字段，返回有差异的字段 key → 新值 */
export function computeDiff(newRecord: any, oldRecord: any): Record<string, string> {
  const fields: Record<string, string> = {}
  for (const key of Object.keys(DIFF_LABELS)) {
    const newVal = (newRecord as any)[key] ?? ''
    const oldVal = (oldRecord as any)[key] ?? ''
    if (key === 'finishTime' && (!newVal || oldVal)) continue
    if ((key === 'requestTime' || key === 'finishTime') && oldVal && newVal) {
      const oldTs = new Date(oldVal).getTime()
      const newTs = new Date(newVal).getTime()
      if (!isNaN(oldTs) && !isNaN(newTs) && oldTs === newTs) continue
    }
    if (newVal !== oldVal && newVal !== '') fields[key] = newVal
  }
  return fields
}
