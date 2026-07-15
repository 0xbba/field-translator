import { Card, Input, Button, Typography, Descriptions, Divider, AutoComplete } from 'antd'
import { CopyOutlined, PlusCircleOutlined, CloseOutlined } from '@ant-design/icons'
import { useEffect, useState } from 'react'
import type { UseLedgerReturn } from '../../hooks/useLedger'
import { formatLedgerCopyText } from '../../utils/ledger'
import { useAppContext } from '../../contexts/AppContext'
import { COLORS } from '../../constants'
import { Api } from '../../api'

interface LedgerParsePageProps {
  ledgerHook: UseLedgerReturn
}

export default function LedgerParsePage({ ledgerHook }: LedgerParsePageProps) {
  const { message, currentUser } = useAppContext()
  const {
    ledgerPasteText,
    ledgerParsed,
    setLedgerPasteText,
    setLedgerParsed,
    addLedgerRecord,
    extractionRecordCount,
    extractionExtractor,
    extractionSupervisor,
    extractionRemark,
    setExtractionRecordCount,
    setExtractionExtractor,
    setExtractionSupervisor,
    setExtractionRemark,
  } = ledgerHook

  // 当解析结果出现且取数人为空时，默认填入当前用户名
  useEffect(() => {
    if (ledgerParsed && !extractionExtractor && currentUser?.displayName) {
      setExtractionExtractor(currentUser.displayName)
    }
  }, [ledgerParsed, extractionExtractor, currentUser?.displayName])

  // 获取在用用户 displayName 列表供监督人选择
  const [supervisorOptions, setSupervisorOptions] = useState<{ value: string }[]>([])
  useEffect(() => {
    Api.userDisplayNames().then(names => {
      setSupervisorOptions(names.map(n => ({ value: n })))
    }).catch(() => {})
  }, [])

  const handleCopy = () => {
    if (!ledgerParsed) return
    const text = formatLedgerCopyText(ledgerParsed)
    try {
      navigator.clipboard.writeText(text)
        .then(() => message.success('已复制登记文本'))
        .catch(() => {
          const ta = document.createElement('textarea')
          ta.value = text
          document.body.appendChild(ta)
          ta.select()
          document.execCommand('copy')
          document.body.removeChild(ta)
          message.success('已复制登记文本')
        })
    } catch {
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      message.success('已复制登记文本')
    }
  }

  const handleWrite = async () => {
    setWriting(true)
    try {
      await addLedgerRecord()
    } finally {
      setWriting(false)
    }
  }

  const [writing, setWriting] = useState(false)

  const handleClear = () => {
    setLedgerPasteText('')
    setLedgerParsed(null)
    setExtractionRecordCount('')
    setExtractionSupervisor('')
    setExtractionRemark('')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* 解析区 */}
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <Typography.Text strong style={{ fontSize: '0.95rem' }}>解析数据需求</Typography.Text>
        </div>
        <p style={{ fontSize: '0.75rem', color: COLORS.textTertiary, marginBottom: 12 }}>
          复制数据需求流程网页内容，粘贴到下方自动解析
        </p>
        <Input.TextArea
          value={ledgerPasteText}
          onChange={e => setLedgerPasteText(e.target.value)}
          placeholder="在此粘贴数据需求流程网页内容..."
          autoSize={{ minRows: 4, maxRows: 10 }}
          style={{ marginBottom: 8 }}
        />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {ledgerParsed && (
            <>
              <Button type="default" size="small" onClick={handleCopy} icon={<CopyOutlined style={{ fontSize: 14 }} />}>复制登记文本</Button>
              <Button type="primary" size="small" onClick={handleWrite} loading={writing} icon={<PlusCircleOutlined style={{ fontSize: 14 }} />}>写入台账</Button>
            </>
          )}
          <Button type="default" size="small" onClick={handleClear} disabled={writing} icon={<CloseOutlined style={{ fontSize: 14 }} />}>清空</Button>
        </div>
      </Card>

      {/* 解析结果 */}
      {ledgerParsed && (
        <Card size="small" title={<Typography.Text strong style={{ fontSize: '0.95rem' }}>解析结果</Typography.Text>}>
          <Descriptions size="small" bordered column={{ xs: 1, sm: 2, md: 3 }}>
            <Descriptions.Item label="数据单号"><Input size="small" value={ledgerParsed.requestNo} onChange={e => setLedgerParsed({ ...ledgerParsed, requestNo: e.target.value })} style={{ width: '100%' }} /></Descriptions.Item>
            <Descriptions.Item label="申请时间"><Input size="small" value={ledgerParsed.requestTime} onChange={e => setLedgerParsed({ ...ledgerParsed, requestTime: e.target.value })} style={{ width: '100%' }} /></Descriptions.Item>
            <Descriptions.Item label="处理人"><Input size="small" value={ledgerParsed.processor} onChange={e => setLedgerParsed({ ...ledgerParsed, processor: e.target.value })} style={{ width: '100%' }} /></Descriptions.Item>
            <Descriptions.Item label="完成时间">
              {ledgerParsed.finishTime != null && ledgerParsed.finishTime !== '' ? (
                <Input size="small" value={ledgerParsed.finishTime} onChange={e => setLedgerParsed({ ...ledgerParsed, finishTime: e.target.value })} style={{ width: '100%' }} />
              ) : (
                <Input size="small" disabled placeholder="当前时间" style={{ width: '100%' }} />
              )}
            </Descriptions.Item>
            <Descriptions.Item label="申请员工"><Input size="small" value={ledgerParsed.applicant} onChange={e => setLedgerParsed({ ...ledgerParsed, applicant: e.target.value })} style={{ width: '100%' }} /></Descriptions.Item>
            <Descriptions.Item label="申请员工电话"><Input size="small" value={ledgerParsed.applicantPhone} onChange={e => setLedgerParsed({ ...ledgerParsed, applicantPhone: e.target.value })} style={{ width: '100%' }} /></Descriptions.Item>
            <Descriptions.Item label="申请部门"><Input size="small" value={ledgerParsed.applicantDept} onChange={e => setLedgerParsed({ ...ledgerParsed, applicantDept: e.target.value })} style={{ width: '100%' }} /></Descriptions.Item>
            <Descriptions.Item label="申请标题" span={3}><Input.TextArea size="small" value={ledgerParsed.requestTitle} onChange={e => setLedgerParsed({ ...ledgerParsed, requestTitle: e.target.value })} autoSize={{ minRows: 1, maxRows: 4 }} style={{ width: '100%' }} /></Descriptions.Item>
            <Descriptions.Item label="申请事由" span={3}><Input.TextArea size="small" value={ledgerParsed.requestReason} onChange={e => setLedgerParsed({ ...ledgerParsed, requestReason: e.target.value })} autoSize={{ minRows: 1, maxRows: 6 }} style={{ width: '100%' }} /></Descriptions.Item>
            <Descriptions.Item label="申请数据内容" span={3}><Input.TextArea size="small" value={ledgerParsed.requestDataContent} onChange={e => setLedgerParsed({ ...ledgerParsed, requestDataContent: e.target.value })} autoSize={{ minRows: 1, maxRows: 6 }} style={{ width: '100%' }} /></Descriptions.Item>
          </Descriptions>

          <Divider style={{ margin: '12px 0' }} />
          <Typography.Text strong style={{ fontSize: '0.9rem' }}>提取记录</Typography.Text>
          <p style={{ fontSize: '0.75rem', color: COLORS.textTertiary, marginBottom: 8, marginTop: 2 }}>
            填写数据条数后，写入台账时将同时登记提取记录
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '1 1 180px', minWidth: 180 }}>
              <span style={{ fontSize: '0.85rem', color: COLORS.textSecondary, flexShrink: 0, width: 56 }}>数据条数</span>
              <Input size="small" value={extractionRecordCount} onChange={e => setExtractionRecordCount(e.target.value.replace(/[^\d]/g, ''))} placeholder="选填" style={{ flex: 1 }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '1 1 180px', minWidth: 180 }}>
              <span style={{ fontSize: '0.85rem', color: COLORS.textSecondary, flexShrink: 0, width: 56 }}>取数人</span>
              <Input size="small" value={extractionExtractor} onChange={e => setExtractionExtractor(e.target.value)} placeholder="默认当前用户" style={{ flex: 1 }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '1 1 180px', minWidth: 180 }}>
              <span style={{ fontSize: '0.85rem', color: COLORS.textSecondary, flexShrink: 0, width: 56 }}>监督人</span>
              <AutoComplete size="small" value={extractionSupervisor} onChange={v => setExtractionSupervisor(v)} options={supervisorOptions} placeholder="选填" style={{ flex: 1 }} filterOption={(input, option) => (option?.value ?? '').toLowerCase().includes(input.toLowerCase())} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '1 1 180px', minWidth: 180 }}>
              <span style={{ fontSize: '0.85rem', color: COLORS.textSecondary, flexShrink: 0, width: 56 }}>备注</span>
              <Input size="small" value={extractionRemark} onChange={e => setExtractionRemark(e.target.value)} placeholder="选填" style={{ flex: 1 }} />
            </div>
            <Button type="primary" size="small" onClick={handleWrite} loading={writing} icon={<PlusCircleOutlined style={{ fontSize: 14 }} />}>写入台账</Button>
          </div>
        </Card>
      )}
    </div>
  )
}
