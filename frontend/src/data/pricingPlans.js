/**
 * 产品与进阶收费 — 四档音乐命名套餐（连续包月 / 连续包年）
 * 对标流媒体会员页结构；正式签约以商务合同为准
 */

export const BILLING_CYCLES = [
  { key: 'month', label: '连续包月' },
  { key: 'year', label: '连续包年', badge: '年购立省大额费用' },
]

export const ENTERPRISE_CUSTOM = {
  title: '企业定制版',
  summary: '超出集团体量、私有化部署、本地化源码部署、定制化二开需求',
  detail:
    '单独签署企业定制版商务合同，按需报价。可含：多租户分级权限、专属运维、按需功能定制、本地化与源码交付等。',
  cta: '联系商务',
}

/** @typedef {{ text: string, included: boolean }} PlanFeature */

export const MUSIC_PLANS = [
  {
    id: 'andante',
    name: 'Andante',
    tempo: '行板',
    tierLabel: '小微楼宇',
    headline: '日常使用，单体写字楼 / 小型物业点位',
    priceMonth: 49,
    priceMonthOriginal: 59,
    priceYear: 528,
    features: [
      { text: '基础混合存储，单栋建筑能耗数据上传、仪表盘数据查看', included: true },
      { text: '基础日度能耗统计、简易 Z-score 异常日报', included: true },
      { text: 'RAG 智能问答、YOLO 视觉、运维工单、ESG 报告、MCP 接口、数字孪生', included: false },
    ],
    scene: '单栋小型建筑、个体户物业日常基础查数',
  },
  {
    id: 'moderato',
    name: 'Moderato',
    tempo: '中板',
    tierLabel: '园区物业',
    headline: '效率升级，中小型产业园 / 社区商业',
    priceMonth: 99,
    priceMonthOriginal: 129,
    priceYear: 1068,
    features: [
      {
        text: '全格式 CSV+HTTP 数据接入、多时段多建筑能耗统计、完整版改进 Z-score 异常预警',
        included: true,
      },
      {
        text: '基础 RAG 知识库（10 份行业规范 PDF）、手动创建运维工单、基础能效对标分析',
        included: true,
      },
      {
        text: '现场 YOLO 视觉识别、轻量化 3D 孪生、自动工单、ESG 自动核算、MCP 协议对接',
        included: false,
      },
    ],
    scene: '中小型物业园区，常规能耗管控 + 基础运维',
  },
  {
    id: 'allegretto',
    name: 'Allegretto',
    tempo: '小快板',
    tierLabel: '集团分公司',
    headline: '专业优选，地产 / 建工区域子公司、多建筑群',
    priceMonth: 199,
    priceMonthOriginal: 239,
    priceYear: 2148,
    recommended: true,
    features: [
      { text: '五大闭环基础全功能、全量多源 RAG（规范 + 司空运维语料 + 数据字典）', included: true },
      { text: '异常自动生成预防运维工单、全流程工单闭环、Prophet 短期能耗预测', included: true },
      { text: '基础 YOLO12 现场识别、简易轻量化 3D 孪生、月度 ESG 指标核算与报表', included: true },
      { text: '开放 5 个 MCP 标准化工具接口', included: true },
    ],
    scene: '建筑集团区域分公司、多园区连片管理单位',
  },
  {
    id: 'allegro',
    name: 'Allegro',
    tempo: '快板',
    tierLabel: '大型建企',
    headline: '全能尊享，中建类央企总部 / 集团总平台',
    priceMonth: 629,
    priceMonthOriginal: 759,
    priceYear: 6828,
    features: [
      { text: '全系统 6 大核心技术 + 5 大业务闭环全部解锁', included: true },
      {
        text: 'YOLOv12 破损量化 + 全功能单图轻量化数字孪生、全维度 ESG 自动核算 + 合规报告一键导出',
        included: true,
      },
      { text: '全量 22 项 MCP 双形态协议，无缝对接企业自有数字中枢', included: true },
      {
        text: '多租户分级权限、自定义能耗指标、7×12h 专属技术运维、按需小功能定制开发',
        included: true,
      },
    ],
    scene: '大型建筑央企、城投集团总部，全集团多项目统一数字化管控',
  },
]

/** 年付相对月付×12 节省金额（元） */
export function yearSaveAmount(plan) {
  return plan.priceMonth * 12 - plan.priceYear
}

/** 年付折合每月（元，保留 1 位小数） */
export function yearPerMonth(plan) {
  return Math.round((plan.priceYear / 12) * 10) / 10
}
