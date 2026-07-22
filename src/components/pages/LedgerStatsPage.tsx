import { useState, useCallback, useRef } from 'react'
import { Typography, Table, DatePicker, Button, Card, Statistic, Row, Col, Segmented, ConfigProvider } from 'antd'
import { BarChartOutlined, SearchOutlined, ReloadOutlined, DownloadOutlined } from '@ant-design/icons'
import * as XLSX from 'xlsx'
import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'
import type { Dayjs } from 'dayjs'
import { Api } from '../../api'
import { useAppContext } from '../../contexts/AppContext'
import { useIsSmallScreen } from '../../hooks/useResponsive'
import type { LedgerStatsRow } from '../../types'

dayjs.locale('zh-cn')

const { RangePicker } = DatePicker

type TimeFieldOption = 'request_time' | 'finish_time' | 'extraction_time'

const TIME_FIELD_OPTIONS = [
  { label: '申请时间', value: 'request_time' as TimeFieldOption },
  { label: '完成时间', value: 'finish_time' as TimeFieldOption },
  { label: '取数时间', value: 'extraction_time' as TimeFieldOption },
]

// Segmented 局部主题：选中蓝底白字，未选中灰字
const SEGMENTED_THEME = {
  components: {
    Segmented: {
      itemSelectedBg: '#1677ff',
      itemSelectedColor: '#fff',
      itemColor: 'rgba(0,0,0,0.65)',
      itemHoverColor: 'rgba(0,0,0,0.88)',
      itemHoverBg: 'rgba(0,0,0,0.06)',
      itemActiveBg: 'rgba(0,0,0,0.15)',
      trackBg: '#f0f0f0',
      trackPadding: 2,
    },
  },
}

interface DetailRow {
  id: number
  ledgerId: number
  requestNo: string
  requestTime: string
  applicant: string
  applicantDept: string
  requestTitle: string
  processor: string
  finishTime: string
  createDate: string
  recordCount: number
  extractor: string
  supervisor: string
  extractionRemark: string
  extractionTime: string
}

function timestamp() {
  return dayjs().format('YYYYMMDD_HHmmss')
}

function normalizeTime(t: string) {
  if (!t) return ''
  const d = dayjs(t)
  return d.isValid() ? d.format('YYYY-MM-DD HH:mm:ss') : t
}

export default function LedgerStatsPage() {
  const { message } = useAppContext()
  const isSmall = useIsSmallScreen()

  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs] | null>(() => {
    const lastMonth = dayjs().subtract(1, 'month')
    return [lastMonth.startOf('month'), lastMonth.endOf('month')]
  })
  const [timeField, setTimeField] = useState<TimeFieldOption>('request_time')
  const [data, setData] = useState<LedgerStatsRow[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)

  // 子表格状态
  const [expandedKeys, setExpandedKeys] = useState<string[]>([])
  const [detailMap, setDetailMap] = useState<Record<string, DetailRow[]>>({})
  const [detailLoading, setDetailLoading] = useState<Record<string, boolean>>({})
  const [pageSize, setPageSize] = useState(10)
  const [currentPage, setCurrentPage] = useState(1)
  const queryRef = useRef<{ startDate?: string; endDate?: string; timeField?: string }>({})

  const fetchStats = useCallback(async () => {
    if (!dateRange) {
      message.warning('请先选择日期范围')
      return
    }
    setLoading(true)
    try {
      const startDate = dateRange[0].format('YYYY-MM-DD')
      const endDate = dateRange[1].format('YYYY-MM-DD')
      const result = await Api.ledgerStats(startDate, endDate, timeField)
      setData(result)
      setSearched(true)
      setExpandedKeys([])
      setDetailMap({})
      setCurrentPage(1)
      queryRef.current = { startDate, endDate, timeField }
    } catch (err: any) {
      message.error(err.message || '查询失败')
    } finally {
      setLoading(false)
    }
  }, [dateRange, timeField, message])

  const handleExpand = useCallback(async (expanded: boolean, record: LedgerStatsRow) => {
    if (expanded) {
      setExpandedKeys(prev => [...prev, record.applicant])
      setDetailLoading(prev => ({ ...prev, [record.applicant]: true }))
      try {
        const { startDate, endDate, timeField: tf } = queryRef.current
        const detail = await Api.ledgerStatsDetail(record.applicant, startDate, endDate, tf)
        setDetailMap(prev => ({ ...prev, [record.applicant]: detail }))
      } catch (err: any) {
        message.error(err.message || '加载明细失败')
      } finally {
        setDetailLoading(prev => ({ ...prev, [record.applicant]: false }))
      }
    } else {
      setExpandedKeys(prev => prev.filter(k => k !== record.applicant))
    }
  }, [message])

  const handleExport = useCallback(async () => {
    if (!dateRange) { message.warning('请先选择日期范围'); return }
    if (data.length === 0) { message.warning('请先查询数据后再导出'); return }
    try {
      message.info('正在导出台账统计...')
      const missingApplicants = data
        .filter(r => !detailMap[r.applicant])
        .map(r => r.applicant)

      if (missingApplicants.length > 0) {
        const { startDate, endDate, timeField: tf } = queryRef.current
        const promises = missingApplicants.map(async applicant => {
          const detail = await Api.ledgerStatsDetail(applicant, startDate, endDate, tf)
          return { applicant, detail }
        })
        const results = await Promise.all(promises)
        const allDetailMap = { ...detailMap }
        for (const { applicant, detail } of results) {
          allDetailMap[applicant] = detail
        }
        exportExcel(data, allDetailMap)
      } else {
        exportExcel(data, detailMap)
      }
      message.success('导出成功')
    } catch (err: any) {
      message.error(err.message || '导出失败')
    }
  }, [data, detailMap, message])

  // 汇总统计
  const totalProcessCount = data.reduce((sum, r) => sum + r.processCount, 0)
  const totalDataVolume = data.reduce((sum, r) => sum + r.totalDataVolume, 0)

  const columns = [
    {
      title: '发起人',
      dataIndex: 'applicant',
      key: 'applicant',
      width: 120,
      sorter: (a: LedgerStatsRow, b: LedgerStatsRow) => a.applicant.localeCompare(b.applicant),
    },
    {
      title: '发起人部门',
      dataIndex: 'applicantDept',
      key: 'applicantDept',
      width: isSmall ? 150 : 200,
      render: (v: string) => v || '-',
    },
    {
      title: '流程数量',
      dataIndex: 'processCount',
      key: 'processCount',
      width: 100,
      sorter: (a: LedgerStatsRow, b: LedgerStatsRow) => a.processCount - b.processCount,
      render: (v: number) => <Typography.Text strong>{v}</Typography.Text>,
    },
    {
      title: '数据总量',
      dataIndex: 'totalDataVolume',
      key: 'totalDataVolume',
      width: 120,
      defaultSortOrder: 'descend' as const,
      sorter: (a: LedgerStatsRow, b: LedgerStatsRow) => a.totalDataVolume - b.totalDataVolume,
      render: (v: number) => <Typography.Text strong style={{ color: '#1677ff' }}>{v.toLocaleString()}</Typography.Text>,
    },
  ]

  const detailColumns = [
    { title: '数据单号', dataIndex: 'requestNo', key: 'requestNo', width: 140 },
    { title: '申请时间', dataIndex: 'requestTime', key: 'requestTime', width: 150, render: (v: string) => normalizeTime(v) || '-' },
    { title: '申请部门', dataIndex: 'applicantDept', key: 'applicantDept', width: 140, render: (v: string) => v || '-' },
    { title: '申请标题', dataIndex: 'requestTitle', key: 'requestTitle', width: 180, ellipsis: true, render: (v: string) => v || '-' },
    { title: '处理人', dataIndex: 'processor', key: 'processor', width: 80, render: (v: string) => v || '-' },
    { title: '完成时间', dataIndex: 'finishTime', key: 'finishTime', width: 150, render: (v: string) => normalizeTime(v) || '-' },
    { title: '取数人', dataIndex: 'extractor', key: 'extractor', width: 80, render: (v: string) => v || '-' },
    { title: '取数时间', dataIndex: 'extractionTime', key: 'extractionTime', width: 150, render: (v: string) => normalizeTime(v) || '-' },
    { title: '数据量', dataIndex: 'recordCount', key: 'recordCount', width: 80, render: (v: number) => v > 0 ? v.toLocaleString() : '-' },
  ]

  const handleReset = useCallback(() => {
    setDateRange(null)
    setTimeField('request_time')
    setSearched(false)
    setData([])
    setDetailMap({})
    setExpandedKeys([])
    queryRef.current = {}
  }, [])

  return (
    <div>
      <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <Typography.Text strong>
          <BarChartOutlined style={{ marginRight: 6 }} />
          台账统计
        </Typography.Text>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <ConfigProvider theme={SEGMENTED_THEME}>
            <Segmented
              value={timeField}
              onChange={v => setTimeField(v as TimeFieldOption)}
              options={TIME_FIELD_OPTIONS}
            />
          </ConfigProvider>
          <RangePicker
            value={dateRange}
            onChange={v => setDateRange(v as [Dayjs, Dayjs] | null)}
            placeholder={['开始日期', '结束日期']}
            style={{ width: isSmall ? 220 : 260 }}
            allowClear
          />
          <Button type="primary" icon={<SearchOutlined />} loading={loading} onClick={fetchStats}>查询</Button>
          <Button icon={<DownloadOutlined />} onClick={handleExport}>导出Excel</Button>
          <Button icon={<ReloadOutlined />} onClick={handleReset}>重置</Button>
        </div>
      </div>

      {searched && data.length > 0 && (
        <Row gutter={16} style={{ marginBottom: 12 }}>
          <Col span={8}>
            <Card size="small">
              <Statistic title="发起人总数" value={data.length} suffix="人" />
            </Card>
          </Col>
          <Col span={8}>
            <Card size="small">
              <Statistic title="流程总数" value={totalProcessCount} suffix="个" />
            </Card>
          </Col>
          <Col span={8}>
            <Card size="small">
              <Statistic title="数据总量合计" value={totalDataVolume} />
            </Card>
          </Col>
        </Row>
      )}

      <Table
        size="small"
        dataSource={data}
        rowKey="applicant"
        loading={loading}
        expandable={{
          expandedRowKeys: expandedKeys,
          onExpand: handleExpand,
          expandedRowRender: (record: LedgerStatsRow) => (
            <Table
              size="small"
              dataSource={detailMap[record.applicant] || []}
              rowKey="id"
              loading={detailLoading[record.applicant] || false}
              pagination={false}
              columns={detailColumns}
              style={{ margin: '8px 0' }}
            />
          ),
        }}
        pagination={{
          current: currentPage,
          pageSize: pageSize,
          showSizeChanger: true,
          pageSizeOptions: ['10', '20', '50', '100'],
          showTotal: (t) => `共 ${t} 条`,
          onChange: (page, size) => {
            setCurrentPage(page)
            setPageSize(size)
          },
        }}
        columns={columns}
        locale={{ emptyText: searched ? '无数据' : '请选择时间范围后点击查询' }}
      />
    </div>
  )
}

// ============ 导出 Excel（两个 sheet） ============

function exportExcel(statsData: LedgerStatsRow[], allDetailMap: Record<string, DetailRow[]>) {
  // Sheet1: 台账统计结果
  const statsRows = statsData.map((r, i) => ({
    '序号': String(i + 1),
    '发起人': r.applicant,
    '发起人部门': r.applicantDept,
    '流程数量': r.processCount,
    '数据总量': r.totalDataVolume,
  }))
  const ws1 = XLSX.utils.json_to_sheet(statsRows)

  // Sheet2: 流程详单（每条提取记录一行）
  const detailRows: Record<string, string | number>[] = []
  let seq = 0
  for (const r of statsData) {
    const details = allDetailMap[r.applicant] || []
    for (const d of details) {
      seq++
      detailRows.push({
        '序号': String(seq),
        '发起人': r.applicant,
        '数据单号': d.requestNo,
        '申请时间': normalizeTime(d.requestTime),
        '申请部门': d.applicantDept || '-',
        '申请标题': d.requestTitle || '-',
        '处理人': d.processor || '-',
        '完成时间': normalizeTime(d.finishTime),
        '取数人': d.extractor || '-',
        '取数时间': normalizeTime(d.extractionTime),
        '数据量': d.recordCount,
      })
    }
  }
  const ws2 = XLSX.utils.json_to_sheet(detailRows)

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws1, '台账统计')
  XLSX.utils.book_append_sheet(wb, ws2, '流程详单')
  XLSX.writeFile(wb, `台账统计_${timestamp()}.xlsx`)
}
