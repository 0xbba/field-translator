import type { LedgerRecord } from '../types'

/** 解析数据需求流程网页文本为台账字段 */
export function parseLedgerText(text: string): Omit<LedgerRecord, '_dbId' | '_deleted'> | null {
  const rawLines = text.split('\n')
  const lines: string[] = []
  for (const l of rawLines) { const t = l.trim(); if (t) lines.push(t) }
  if (lines.length < 2) return null

  const result: Record<string, any> = {}

  // 独占一行的标签（值在下一行）
  const standaloneLabels = new Set([
    '标题', '需求分类', '需求类型', '清单条数', '清单交付方式',
    '申请事由', '数据内容', '备注', '说明', '附件',
    '分管申请部门的公司领导', '省公司分管申请部门领导',
  ])

  // 已知标签（用于判断续接终止）
  const knownLabels = new Set([
    '单号', '数据单号', '需求单号', '申请时间', '需求时间',
    '标题', '需求分类', '需求类型', '清单条数', '清单交付方式',
    '申请事由', '数据内容', '备注', '附件',
    '基本信息', '附件信息', '审核过程',
    '分管申请部门的公司领导', '省公司分管申请部门领导',
  ])

  // 判断是否是"停止续接"的行（正在续接值内容时使用）
  // 比 shouldStop 更严格：值中常含冒号（如"提取如下2个销售品：..."），不应被当作新标签
  const shouldStopContinuation = (line: string): boolean => {
    if (!line) return true
    // 时间格式不停止
    if (/^\d{1,2}:\d{2}/.test(line)) return false
    // 冒号分隔：但只有冒号前是已知标签或短词（<=6字）才认为是标签行
    const colonMatch = line.match(/^([^：:\n]+)[：:]\s*(.*)$/)
    if (colonMatch) {
      const beforeColon = colonMatch[1].trim()
      // 已知标签 → 停止
      if (knownLabels.has(beforeColon)) return true
      // 短标签（<=4字，纯中文字符，不含空格/数字/标点）且值较短（<=50字）→ 停止
      // 值过长说明冒号是正文中出现的，不是新字段
      if (beforeColon.length <= 4 && /^[^\s\d，。、；""''（）\[\]【】]+$/.test(beforeColon) && colonMatch[2].length <= 50) return true
      // 否则是值中含冒号，不停止
      return false
    }
    // 独占标签行
    if (standaloneLabels.has(line)) return true
    // 申请人格式行
    if (/^[^\s(（_]+[_Ｃ].+?[\(（]\d{7,15}[,，]/.test(line)) return true
    // 【xxx】格式
    if (line.startsWith('【')) return true
    // 已知标签（无冒号）
    if (knownLabels.has(line)) return true
    // 表头行（含多个Tab）
    if ((line.match(/\t/g) || []).length >= 3) return true
    // 流程状态词
    if (/^(已创建|已执行|已撤回|执行中|已完成|提交工单|保存|添加关注|流程模板|更多)$/.test(line)) return true
    return false
  }

  // 判断是否是"停止续接"的行（正在续接值内容时使用）
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // ---- 模式1：标签：值（同一行，值非空） ----
    // 排除时间格式（如 18:17:51）和纯数字:数字 的行
    const colonWithValue = !/^\d{1,2}:\d{2}/.test(line) && line.match(/^([^：:\n]{1,20})[：:]\s*(.+)$/)
    if (colonWithValue) {
      const label = colonWithValue[1].trim()
      let value = colonWithValue[2].trim()
      // 去引号
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }
      // 多行续接
      while (i + 1 < lines.length && !shouldStopContinuation(lines[i + 1])) {
        i++; value += '\n' + lines[i].trim()
      }
      result[label] = value
      continue
    }

    // ---- 模式1b：标签：后面没有值，值在下一行 ----
    const colonNoValue = !/^\d{1,2}:\d{2}/.test(line) && line.match(/^([^：:\n]{1,20})[：:]\s*$/)
    if (colonNoValue && i + 1 < lines.length) {
      const label = colonNoValue[1].trim()
      // 下一行也是标签/停止行 → 值为空
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

    // ---- 模式2：标签独占一行，值在下一行 ----
    if (standaloneLabels.has(line) && i + 1 < lines.length) {
      // 下一行也是标签/停止行 → 值为空，跳过
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

    // ---- 模式3：【xxx】标题行 ----
    if (line.startsWith('【')) {
      const titleMatch = line.match(/【(.+?)】/)
      if (titleMatch) result['requestTitle'] = titleMatch[1]
      continue
    }

  // ---- 模式4a：申请人信息  姓名_城市(电话,部门) ----
    const applicantMatch = line.match(/^([^\s(（_]+)[_Ｃ].+?[\(（](\d{7,15})[,，]\s*(.+?)[\)）]$/)
    if (applicantMatch) {
      // 只取第一个匹配到的作为申请人（避免审核过程里的处理人覆盖）
      if (!result['applicant']) {
        result['applicant'] = applicantMatch[1]
        result['applicantPhone'] = applicantMatch[2]
        let dept = applicantMatch[3]
        result['applicantDept'] = dept
      }
      continue
    }

    // ---- 模式4b：审核过程中的处理人  姓名_城市（无电话括号） ----
    const processorMatch = line.match(/^([^\s(（_]+)[_Ｃ](.+)$/)
    if (processorMatch && !applicantMatch) {
      // 收集所有出现过的 姓名_城市，后面按"未处理完成"提取当前处理人
      if (!result['_allPersonLines']) result['_allPersonLines'] = []
      result['_allPersonLines'].push({ lineIdx: i, name: processorMatch[1] })
      continue
    }
  }

  // ---- 解析审核过程：提取每个环节的名称、处理人、完成时间 ----
  // OA 审核过程格式：环节名称独占一行 → 姓名_城市 → 处理意见 → 日期 → 时间 → 日期 → 时间/未处理完成 → ...
  const approvalStages: Array<{ name: string; person: string; completedAt: string }> = []
  // 找到"审核过程"标签出现的位置
  let approvalStart = -1
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === '审核过程') { approvalStart = i; break }
  }
  if (approvalStart >= 0) {
    // 已知的环节名称（避免误匹配其他内容）
    const isStageName = (line: string): boolean => {
      // 环节名称通常不含Tab、不含_、不含数字开头、不长于20字
      if (line.includes('\t')) return false
      if (line.includes('_')) return false
      if (/^\d/.test(line)) return false
      if (line.length > 20) return false
      // 排除已知非环节行
      const nonStage = new Set([
        '已创建', '已执行', '已撤回', '执行中', '已完成', '提交工单', '保存', '添加关注', '流程模板', '更多',
        '环节名称', '处理人员', '处理意见', '传阅/协办意见', '创建时间', '完成时间', '处理时长', '附件',
        '基本信息', '附件信息', '审核过程', '应用大全', '同意', '--',
      ])
      if (nonStage.has(line)) return false
      // 排除流程状态词
      if (/^(已创建|已执行|已撤回|执行中|已完成)$/.test(line)) return false
      // 排除纯时间格式
      if (/^\d{1,2}:\d{2}/.test(line)) return false
      // 排除日期格式
      if (/^\d{4}-\d{2}-\d{2}$/.test(line)) return false
      // 排除处理时长格式
      if (/\d+\s*(秒|分|时)/.test(line)) return false
      // 排除附件文件名
      if (/\.\w+$/.test(line) && !/^[^\s.]{1,15}$/.test(line.replace(/\.\w+$/, ''))) return false
      return true
    }

    // 从审核过程开始往后扫描
    let i = approvalStart + 1
    // 跳过状态按钮行和表头行
    while (i < lines.length) {
      if (isStageName(lines[i])) break
      i++
    }

    while (i < lines.length) {
      const stageName = lines[i]
      if (!isStageName(stageName)) { i++; continue }

      // 下一行应该是处理人 姓名_城市
      let person = ''
      let completedAt = ''
      if (i + 1 < lines.length) {
        const personLine = lines[i + 1]
        const pm = personLine.match(/^([^\s(（_]+)[_ＺＣ_]/)
        if (pm) {
          person = pm[1]
          i += 2 // 跳过环节名和处理人行
          // 接下来可能是处理意见（一行或多行），然后是 创建日期 → 创建时间 → 完成日期 → 完成时间/未处理完成
          // 策略：往下找日期格式的行
          let dateCount = 0
          let dateParts: string[] = []
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
                // 完成时间 = dateParts[2] + ' ' + dateParts[3]
                completedAt = `${dateParts[2]} ${dateParts[3]}`
                i++
                break
              }
            } else if (dateCount > 0) {
              // 在日期序列中遇到非日期行，可能是"未处理完成"
              if (l.includes('未处理') || l.includes('未完成')) {
                completedAt = ''
                i++
                break
              }
              // 或者是时长等，跳过
            }
            i++
          }
          // 如果只找到2个日期（创建时间），没有完成时间
          // completedAt 保持空
        } else {
          i++
        }
      } else {
        i++
      }

      approvalStages.push({ name: stageName, person, completedAt })
    }
  }

  // ---- 提取当前处理人 + finishTime ----
  // 优先级：如果审核过程中有"数据需求承接人"环节，processor 取其处理人，finishTime 取其完成时间
  // 否则 processor 按"未处理完成"逻辑取，finishTime 留空（数据库 DEFAULT NOW()）
  let processor = ''
  let finishTime = ''

  // 先找"数据需求承接人"环节
  const acceptorStage = approvalStages.find(s =>
    s.name.includes('数据需求承接') || s.name.includes('数据承接') || s.name.includes('数据统计人员')
  )

  if (acceptorStage && acceptorStage.completedAt) {
    processor = acceptorStage.person
    finishTime = acceptorStage.completedAt
  } else {
    // 没有"数据需求承接人"环节或未完成，回退到原有逻辑
    const allPersonLines = result['_allPersonLines'] as Array<{ lineIdx: number; name: string }> | undefined
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
    // finishTime 留空，数据库 DEFAULT NOW()
  }
  delete result['_allPersonLines']

  // 映射到标准字段
  const mapField = (keys: string[]): string | undefined => {
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

  // 只要有任意可识别字段就返回
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

/** 生成台账登记文本（用于复制粘贴） */
export function formatLedgerCopyText(record: LedgerRecord): string {
  const fields = [
    ['需求单号', record.requestNo],
    ['需求时间', record.requestTime],
    ['申请人', record.applicant],
    ['联系电话', record.applicantPhone],
    ['申请部门', record.applicantDept],
    ['需求标题', record.requestTitle],
    ['需求原因', record.requestReason],
    ['数据需求内容', record.requestDataContent],
    ['处理人', record.processor],
    ['完成时间', record.finishTime || ''],
  ]
  return fields.map(([k, v]) => `${k}：${v || ''}`).join('\t')
}
