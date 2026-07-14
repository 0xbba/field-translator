// 从 ledger.ts 移植的纯 JS 版本解析函数
function parseLedgerText(text) {
  const rawLines = text.split('\n')
  const lines = []
  for (const l of rawLines) { const t = l.trim(); if (t) lines.push(t) }
  if (lines.length < 2) return null

  const result = {}

  const standaloneLabels = new Set([
    '标题', '需求分类', '需求类型', '清单条数', '清单交付方式',
    '申请事由', '数据内容', '备注', '说明', '附件',
    '分管申请部门的公司领导', '省公司分管申请部门领导',
  ])

  const knownLabels = new Set([
    '单号', '数据单号', '需求单号', '申请时间', '需求时间',
    '标题', '需求分类', '需求类型', '清单条数', '清单交付方式',
    '申请事由', '数据内容', '备注', '附件',
    '基本信息', '附件信息', '审核过程',
    '分管申请部门的公司领导', '省公司分管申请部门领导',
  ])

  const shouldStopContinuation = (line) => {
    if (!line) return true
    if (/^\d{1,2}:\d{2}/.test(line)) return false
    const colonMatch = line.match(/^([^：:\n]+)[：:]\s*(.*)$/)
    if (colonMatch) {
      const beforeColon = colonMatch[1].trim()
      if (knownLabels.has(beforeColon)) return true
      if (beforeColon.length <= 4 && /^[^\s\d，。、；""''（）\[\]【】]+$/.test(beforeColon) && colonMatch[2].length <= 50) return true
      return false
    }
    if (standaloneLabels.has(line)) return true
    if (/^[^\s(（_]+[_Ｃ].+?[\(（]\d{7,15}[,，]/.test(line)) return true
    if (line.startsWith('【')) return true
    if (knownLabels.has(line)) return true
    if ((line.match(/\t/g) || []).length >= 3) return true
    if (/^(已创建|已执行|已撤回|执行中|已完成|提交工单|保存|添加关注|流程模板|更多)$/.test(line)) return true
    return false
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    const colonWithValue = !/^\d{1,2}:\d{2}/.test(line) && line.match(/^([^：:\n]{1,20})[：:]\s*(.+)$/)
    if (colonWithValue) {
      const label = colonWithValue[1].trim()
      let value = colonWithValue[2].trim()
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }
      while (i + 1 < lines.length && !shouldStopContinuation(lines[i + 1])) {
        i++; value += '\n' + lines[i].trim()
      }
      result[label] = value
      continue
    }

    const colonNoValue = !/^\d{1,2}:\d{2}/.test(line) && line.match(/^([^：:\n]{1,20})[：:]\s*$/)
    if (colonNoValue && i + 1 < lines.length) {
      const label = colonNoValue[1].trim()
      if (shouldStopContinuation(lines[i + 1])) {
        result[label] = ''
        continue
      }
      let value = lines[i + 1].trim()
      i++
      while (i + 1 < lines.length && !shouldStopContinuation(lines[i + 1])) {
        i++; value += '\n' + lines[i].trim()
      }
      result[label] = value
      continue
    }

    if (standaloneLabels.has(line) && i + 1 < lines.length) {
      if (shouldStopContinuation(lines[i + 1])) {
        result[line] = ''
        continue
      }
      let value = lines[i + 1].trim()
      i++
      while (i + 1 < lines.length && !shouldStopContinuation(lines[i + 1])) {
        i++; value += '\n' + lines[i].trim()
      }
      result[line] = value
      continue
    }

    if (line.startsWith('【')) {
      const titleMatch = line.match(/【(.+?)】/)
      if (titleMatch) result['requestTitle'] = titleMatch[1]
      continue
    }

    const applicantMatch = line.match(/^([^\s(（_]+)[_Ｃ].+?[\(（](\d{7,15})[,，]\s*(.+?)[\)）]$/)
    if (applicantMatch) {
      if (!result['applicant']) {
        result['applicant'] = applicantMatch[1]
        result['applicantPhone'] = applicantMatch[2]
        result['applicantDept'] = applicantMatch[3]
      }
      continue
    }

    const processorMatch = line.match(/^([^\s(（_]+)[_Ｃ](.+)$/)
    if (processorMatch && !applicantMatch) {
      if (!result['_allPersonLines']) result['_allPersonLines'] = []
      result['_allPersonLines'].push({ lineIdx: i, name: processorMatch[1] })
      continue
    }
  }

  // 审核过程解析
  const approvalStages = []
  let approvalStart = -1
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === '审核过程') { approvalStart = i; break }
  }
  if (approvalStart >= 0) {
    const isStageName = (line) => {
      if (line.includes('\t')) return false
      if (line.includes('_')) return false
      if (/^\d/.test(line)) return false
      if (line.length > 20) return false
      const nonStage = new Set([
        '已创建', '已执行', '已撤回', '执行中', '已完成', '提交工单', '保存', '添加关注', '流程模板', '更多',
        '环节名称', '处理人员', '处理意见', '传阅/协办意见', '创建时间', '完成时间', '处理时长', '附件',
        '基本信息', '附件信息', '审核过程', '应用大全', '同意', '--',
      ])
      if (nonStage.has(line)) return false
      if (/^(已创建|已执行|已撤回|执行中|已完成)$/.test(line)) return false
      if (/^\d{1,2}:\d{2}/.test(line)) return false
      if (/^\d{4}-\d{2}-\d{2}$/.test(line)) return false
      if (/\d+\s*(秒|分|时)/.test(line)) return false
      if (/\.\w+$/.test(line) && !/^[^\s.]{1,15}$/.test(line.replace(/\.\w+$/, ''))) return false
      return true
    }

    let i = approvalStart + 1
    while (i < lines.length) {
      if (isStageName(lines[i])) break
      i++
    }

    while (i < lines.length) {
      const stageName = lines[i]
      if (!isStageName(stageName)) { i++; continue }

      let person = ''
      let completedAt = ''
      if (i + 1 < lines.length) {
        const personLine = lines[i + 1]
        const pm = personLine.match(/^([^\s(（_]+)[_ＺＣ_]/)
        if (pm) {
          person = pm[1]
          i += 2
          let dateCount = 0
          let dateParts = []
          while (i < lines.length && dateCount < 4) {
            const l = lines[i]
            if (l === '未处理完成' || l.includes('未处理完成')) {
              completedAt = ''
              i++
              break
            }
            if (/^\d{4}-\d{2}-\d{2}$/.test(l) || /^\d{1,2}:\d{2}(:\d{2})?$/.test(l)) {
              dateParts.push(l)
              dateCount++
              if (dateCount === 4) {
                completedAt = `${dateParts[2]} ${dateParts[3]}`
                i++
                break
              }
            } else if (dateCount > 0) {
              if (l.includes('未处理') || l.includes('未完成')) {
                completedAt = ''
                i++
                break
              }
            }
            i++
          }
        } else {
          i++
        }
      } else {
        i++
      }
      approvalStages.push({ name: stageName, person, completedAt })
    }
  }

  let processor = ''
  let finishTime = ''

  const acceptorStage = approvalStages.find(s =>
    s.name.includes('数据需求承接') || s.name.includes('数据承接') || s.name.includes('数据统计人员')
  )

  if (acceptorStage && acceptorStage.completedAt) {
    processor = acceptorStage.person
    finishTime = acceptorStage.completedAt
  } else {
    const allPersonLines = result['_allPersonLines']
    if (allPersonLines && allPersonLines.length > 0) {
      let unprocessedIdx = -1
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('未处理完成') || lines[i].includes('未完成')) {
          unprocessedIdx = i
          break
        }
      }
      if (unprocessedIdx >= 0) {
        let best = allPersonLines[0]
        for (const p of allPersonLines) {
          if (p.lineIdx < unprocessedIdx) best = p
          else break
        }
        processor = best.name
      } else {
        processor = allPersonLines[allPersonLines.length - 1].name
      }
    }
  }
  delete result['_allPersonLines']

  const mapField = (keys) => {
    for (const k of keys) { if (result[k]) return result[k] }
    return undefined
  }

  const requestNo = mapField(['单号', '数据单号', '需求单号', '编号', '申请单号', '流程单号', '工单号', '流水号'])
  const requestTime = mapField(['申请时间', '需求时间', '时间', '日期', '创建时间', '提交时间'])
  const applicant = mapField(['applicant', '申请人', '申请人姓名', '姓名', '申请者', '发起人'])
  const applicantPhone = mapField(['applicantPhone', '联系电话', '电话', '手机号', '联系方式'])
  const applicantDept = mapField(['applicantDept', '申请部门', '部门', '所在部门', '单位', '归属部门'])
  const requestTitle = mapField(['requestTitle', '标题', '需求标题', '主题', '事项'])
  const requestReason = mapField(['申请事由', '需求原因', '原因', '申请原因', '事由', '说明', '需求说明'])
  const requestDataContent = mapField(['数据内容', '数据需求内容', '数据需求', '需求内容', '需求描述', '具体要求', '内容'])

  const hasAnyField = requestNo || requestTime || applicant || applicantDept || requestTitle || requestReason || requestDataContent
  if (!hasAnyField) return null

  return {
    requestNo: requestNo || '',
    requestTime: requestTime || '',
    applicant: applicant || '',
    applicantPhone: applicantPhone || '',
    applicantDept: applicantDept || '',
    requestTitle: requestTitle || '',
    requestReason: requestReason || '',
    requestDataContent: requestDataContent || '',
    processor,
    finishTime,
  }
}
