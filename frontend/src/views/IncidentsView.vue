<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Microphone, ArrowRight, QuestionFilled } from '@element-plus/icons-vue'
import * as api from '@/api'
import { useVoiceInput } from '@/composables/useVoiceInput'
import { parseIncidentVoiceCommand, VOICE_COMMAND_HINTS, VOICE_COMMAND_HELP } from '@/composables/useIncidentVoiceCommand'

const route = useRoute()

const list = ref([])
const summary = ref(null)
const buildings = ref([])
const loading = ref(false)
const statusFilter = ref(null)
const searchKeyword = ref('')
const voiceGuideVisible = ref(false)

const dialogVisible = ref(false)
const detailVisible = ref(false)
const detailEditing = ref(false)
const selected = ref(null)
const editForm = ref({})

const form = ref({
  title: '',
  building_id: '',
  severity: 'medium',
  status: 'open',
  detail: '',
})

const speechStatus = ref(null)
const lastVoiceText = ref('')
const voiceLog = ref([])

function rowId(row) {
  return row?.incident_id ?? row?.id
}

function severityLabel(s) {
  const m = { low: '低', medium: '中', high: '高', critical: '紧急' }
  return m[s] ?? s
}

function statusLabel(s) {
  const m = { open: '待处理', in_progress: '进行中', resolved: '已解决', closed: '已关闭' }
  return m[s] ?? s
}

function severityTagType(s) {
  if (s === 'high' || s === 'critical') return 'danger'
  if (s === 'medium') return 'warning'
  return 'info'
}

function formatTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const filteredList = computed(() => {
  let rows = list.value
  if (statusFilter.value) rows = rows.filter((r) => r.status === statusFilter.value)
  const kw = (searchKeyword.value || '').trim()
  if (kw) rows = rows.filter((r) => (r.title ?? '').includes(kw) || (r.detail ?? '').includes(kw))
  return rows
})

function pushVoiceLog(text, type = 'info') {
  voiceLog.value.unshift({ text, type, at: new Date().toLocaleTimeString() })
  if (voiceLog.value.length > 8) voiceLog.value.pop()
}

async function loadSummary() {
  summary.value = await api.getIncidentsSummary().catch(() => null)
}

async function loadList(status) {
  const filterStatus = typeof status === 'string' ? status : statusFilter.value
  loading.value = true
  try {
    const params = { limit: 200 }
    if (filterStatus) params.status = filterStatus
    const data = await api.getIncidents(params)
    list.value = data.items ?? []
  } catch (e) {
    ElMessage.error(e.message ?? '加载工单失败')
  } finally {
    loading.value = false
  }
}

async function loadBuildings() {
  const data = await api.getBuildings().catch(() => ({ items: [] }))
  buildings.value = data.items ?? []
}

function openDetail(row) {
  selected.value = { ...row }
  editForm.value = {
    title: row.title ?? '',
    building_id: row.building_id ?? '',
    severity: row.severity ?? 'medium',
    status: row.status ?? 'open',
    detail: row.detail ?? '',
  }
  detailEditing.value = false
  detailVisible.value = true
}

async function submitCreate() {
  if (!form.value.title.trim()) {
    ElMessage.warning('请填写标题')
    return
  }
  loading.value = true
  try {
    await api.postIncident({
      ...form.value,
      building_id: form.value.building_id || null,
      detail: form.value.detail || null,
    })
    ElMessage.success('已创建')
    dialogVisible.value = false
    form.value = { title: '', building_id: '', severity: 'medium', status: 'open', detail: '' }
    await loadList()
    await loadSummary()
  } catch (e) {
    ElMessage.error(e.message ?? '创建失败')
  } finally {
    loading.value = false
  }
}

async function saveDetail() {
  const id = rowId(selected.value)
  if (!id) return
  loading.value = true
  try {
    const res = await api.patchIncident(id, {
      title: editForm.value.title,
      building_id: editForm.value.building_id || null,
      severity: editForm.value.severity,
      status: editForm.value.status,
      detail: editForm.value.detail || null,
    })
    selected.value = res.item ?? selected.value
    detailEditing.value = false
    ElMessage.success('已保存')
    await loadList()
    await loadSummary()
  } catch (e) {
    ElMessage.error(e.message ?? '保存失败')
  } finally {
    loading.value = false
  }
}

async function patchStatus(row, status) {
  loading.value = true
  try {
    const id = rowId(row)
    if (!id) throw new Error('缺少工单 id')
    await api.patchIncident(id, { status })
    ElMessage.success('已更新')
    if (selected.value && rowId(selected.value) === id) {
      selected.value = { ...selected.value, status }
    }
    await loadList()
    await loadSummary()
  } catch (e) {
    ElMessage.error(e.message ?? '更新失败')
  } finally {
    loading.value = false
  }
}

async function removeIncident(row) {
  const id = rowId(row)
  if (!id) return
  try {
    await ElMessageBox.confirm(`确定删除工单 #${id}「${row.title}」？`, '删除确认', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  loading.value = true
  try {
    await api.deleteIncident(id)
    ElMessage.success('已删除')
    if (selected.value && rowId(selected.value) === id) {
      detailVisible.value = false
      selected.value = null
    }
    await loadList()
    await loadSummary()
  } catch (e) {
    ElMessage.error(e.message ?? '删除失败')
  } finally {
    loading.value = false
  }
}

async function createByVoice(payload) {
  await api.postIncident({
    title: payload.title,
    building_id: payload.building_id || null,
    severity: payload.severity ?? 'medium',
    status: payload.status ?? 'open',
    detail: payload.detail || null,
  })
  ElMessage.success(`已创建工单：${payload.title}`)
  pushVoiceLog(`创建：${payload.title}`, 'success')
  await loadList()
  await loadSummary()
}

async function deleteByVoice(payload) {
  let id = payload.id
  if (!id && payload.titleKeyword) {
    const kw = payload.titleKeyword
    const hit = list.value.find((r) => (r.title ?? '').includes(kw))
    if (!hit) throw new Error(`未找到标题包含「${kw}」的工单`)
    id = rowId(hit)
  }
  if (!id) throw new Error('请指定工单编号')
  const row = list.value.find((r) => rowId(r) === id)
  await api.deleteIncident(id)
  ElMessage.success(`已删除工单 #${id}`)
  pushVoiceLog(`删除 #${id}`, 'success')
  if (selected.value && rowId(selected.value) === id) {
    detailVisible.value = false
    selected.value = null
  }
  await loadList()
  await loadSummary()
}

async function updateByVoice(payload) {
  const { id, patch } = payload
  const res = await api.patchIncident(id, patch)
  ElMessage.success(`已更新工单 #${id}`)
  pushVoiceLog(`更新 #${id}`, 'success')
  if (selected.value && rowId(selected.value) === id) {
    selected.value = res.item ?? { ...selected.value, ...patch }
    editForm.value = { ...editForm.value, ...patch }
  }
  await loadList()
  await loadSummary()
}

async function viewByVoice(id) {
  const local = list.value.find((r) => rowId(r) === id)
  if (local) {
    openDetail(local)
    pushVoiceLog(`查看 #${id}`, 'info')
    return
  }
  const res = await api.getIncident(id)
  if (res.item) openDetail(res.item)
  pushVoiceLog(`查看 #${id}`, 'info')
}

async function viewByIndex(fromEnd, index) {
  const rows = filteredList.value.length ? filteredList.value : list.value
  if (!rows.length) throw new Error('当前没有可查看的工单')
  const idx = fromEnd ? rows.length - 1 - index : index
  if (idx < 0 || idx >= rows.length) throw new Error('找不到指定序号的工单')
  openDetail(rows[idx])
  pushVoiceLog(`查看 ${fromEnd ? '最后' : '第'}${index + 1}条`, 'info')
}

async function executeVoiceCommand(text) {
  lastVoiceText.value = text
  const cmd = parseIncidentVoiceCommand(text)
  if (!cmd) {
    ElMessage.warning('未识别工单指令，说「帮助」查看可用命令')
    pushVoiceLog(`未识别：${text}`, 'warning')
    return
  }
  if (cmd.action === 'unknown') {
    ElMessage.warning(cmd.hint ?? '指令不完整')
    pushVoiceLog(cmd.hint ?? text, 'warning')
    return
  }

  loading.value = true
  try {
    switch (cmd.action) {
      case 'help':
        voiceGuideVisible.value = true
        ElMessage.info('已打开语音指令说明')
        pushVoiceLog('显示帮助', 'info')
        break
      case 'open_create':
        dialogVisible.value = true
        ElMessage.success('已打开新建工单')
        pushVoiceLog('打开新建', 'success')
        break
      case 'summary':
        await loadSummary()
        ElMessage.success(`待处理 ${summary.value?.pending ?? 0} 条，共 ${summary.value?.total ?? 0} 条`)
        pushVoiceLog(`统计：待处理 ${summary.value?.pending ?? 0} / 总 ${summary.value?.total ?? 0}`, 'success')
        break
      case 'search':
        searchKeyword.value = cmd.payload?.keyword ?? ''
        ElMessage.success(`已搜索：${searchKeyword.value}`)
        pushVoiceLog(`搜索「${searchKeyword.value}」`, 'success')
        break
      case 'view_index':
        await viewByIndex(!!cmd.payload?.fromEnd, cmd.payload?.index ?? 0)
        break
      case 'refresh':
        searchKeyword.value = ''
        await loadList()
        await loadSummary()
        ElMessage.success('已刷新')
        pushVoiceLog('刷新列表', 'success')
        break
      case 'list': {
        statusFilter.value = cmd.payload?.status ?? null
        if (cmd.payload?.keyword === null) searchKeyword.value = ''
        await loadList(statusFilter.value)
        const label = statusFilter.value ? statusLabel(statusFilter.value) : '全部'
        ElMessage.success(`已筛选：${label}`)
        pushVoiceLog(`查询 ${label}工单`, 'success')
        break
      }
      case 'create':
        await createByVoice(cmd.payload)
        break
      case 'delete':
        await deleteByVoice(cmd.payload)
        break
      case 'update':
        await updateByVoice(cmd.payload)
        break
      case 'patch_status': {
        const row = list.value.find((r) => rowId(r) === cmd.payload.id)
        if (!row) throw new Error(`未找到工单 #${cmd.payload.id}`)
        await patchStatus(row, cmd.payload.status)
        pushVoiceLog(`${statusLabel(cmd.payload.status)} #${cmd.payload.id}`, 'success')
        break
      }
      case 'view':
        await viewByVoice(cmd.payload.id)
        break
      default:
        ElMessage.warning('暂不支持该指令')
    }
  } catch (e) {
    ElMessage.error(e.message ?? '语音指令执行失败')
    pushVoiceLog(e.message ?? '执行失败', 'warning')
  } finally {
    loading.value = false
  }
}

const {
  recording: voiceRecording,
  transcribing: voiceTranscribing,
  toggleRecording,
  isSupported: voiceSupported,
} = useVoiceInput({
  async onTranscript(text) {
    await executeVoiceCommand(text)
  },
  async transcribe(wavBlob) {
    const res = await api.postAssistantSpeechToText(wavBlob)
    const text = (res.text ?? '').trim()
    if (!text) ElMessage.warning('未识别到有效语音，请靠近麦克风重试')
    return text
  },
})

async function onVoiceClick() {
  if (!voiceSupported) {
    ElMessage.warning('当前浏览器不支持麦克风录音')
    return
  }
  if (!speechStatus.value?.configured) {
    ElMessage.warning('百度语音未配置：请在 backend/.env 填写 BAIDU_SPEECH_API_KEY 与 BAIDU_SPEECH_SECRET_KEY')
    return
  }
  if (loading.value || voiceTranscribing.value) return
  try {
    await toggleRecording()
  } catch (e) {
    ElMessage.error(e?.message || '无法启动麦克风，请检查浏览器权限')
  }
}

async function openIncidentFromQuery() {
  const raw = route.query?.open
  if (raw == null || raw === '') return
  const id = Number(raw)
  if (!Number.isFinite(id) || id <= 0) return
  const local = list.value.find((r) => rowId(r) === id)
  if (local) {
    openDetail(local)
    return
  }
  const res = await api.getIncident(id).catch(() => null)
  if (res?.item) openDetail(res.item)
}

onMounted(async () => {
  await loadBuildings()
  await loadSummary()
  await loadList()
  speechStatus.value = await api.getAssistantSpeechStatus().catch(() => null)
  await openIncidentFromQuery()
})

watch(
  () => route.query.open,
  async (open) => {
    if (!open || !list.value.length) return
    await openIncidentFromQuery()
  },
)
</script>

<template>
  <div class="inc-page">
    <header class="inc-head">
      <div class="inc-head-left">
        <el-button type="primary" size="large" @click="dialogVisible = true">新建工单</el-button>
        <el-button size="large" @click="() => loadList()">刷新</el-button>
      </div>
      <div class="inc-head-voice">
        <el-button
          :icon="Microphone"
          :type="voiceRecording ? 'danger' : 'primary'"
          size="large"
          :class="{ 'voice-btn--active': voiceRecording }"
          :disabled="loading || voiceTranscribing || !voiceSupported"
          :loading="voiceTranscribing"
          round
          @click="onVoiceClick"
        >
          {{
            voiceTranscribing
              ? '识别中…'
              : voiceRecording
                ? '点击结束'
                : speechStatus?.configured
                  ? '语音命令'
                  : '语音未配置'
          }}
        </el-button>
        <el-button :icon="QuestionFilled" size="large" round @click="voiceGuideVisible = true">
          语音指令
        </el-button>
        <el-tag
          :type="speechStatus?.configured ? 'success' : 'info'"
          size="default"
          effect="plain"
          class="ems-tag-soft"
        >
          {{ speechStatus?.configured ? '百度 ASR 已配置' : 'ASR 未配置' }}
        </el-tag>
      </div>
    </header>

    <el-drawer
      v-model="voiceGuideVisible"
      title="语音指令说明"
      direction="rtl"
      size="420px"
      destroy-on-close
    >
      <div class="voice-guide">
        <p class="voice-guide-intro">
          点击「语音命令」说话即可操作工单；说「帮助」也可打开本说明。编号支持汉字（如「三号工单」）。
        </p>

        <div class="voice-guide-section">
          <div class="voice-guide-title">常用示例</div>
          <div class="voice-guide-tags">
            <el-tag
              v-for="(h, i) in VOICE_COMMAND_HINTS"
              :key="i"
              size="small"
              effect="plain"
              class="hint-tag"
            >
              {{ h }}
            </el-tag>
          </div>
        </div>

        <div class="voice-guide-section">
          <div class="voice-guide-title">完整命令</div>
          <ul class="inc-voice-help">
            <li v-for="(line, i) in VOICE_COMMAND_HELP" :key="i">{{ line }}</li>
          </ul>
        </div>

        <div v-if="voiceLog.length" class="voice-guide-section">
          <div class="voice-guide-title">最近执行</div>
          <ul class="inc-voice-log">
            <li v-for="(log, i) in voiceLog" :key="i" :class="`log-${log.type}`">
              <span class="log-at">{{ log.at }}</span>
              <span v-if="lastVoiceText && i === 0" class="log-raw">「{{ lastVoiceText }}」→ </span>
              {{ log.text }}
            </li>
          </ul>
        </div>
        <el-empty v-else description="暂无语音执行记录" :image-size="48" />
      </div>
    </el-drawer>

    <div class="inc-summary">
      <span class="inc-sum-item">待处理 <strong class="num-font">{{ summary?.pending ?? 0 }}</strong></span>
      <span class="inc-sum-sep" aria-hidden="true">|</span>
      <span class="inc-sum-item">总数 <strong class="num-font">{{ summary?.total ?? 0 }}</strong></span>
      <span v-if="searchKeyword" class="inc-search-tag">
        搜索「{{ searchKeyword }}」
        <el-button link type="primary" size="small" @click="searchKeyword = ''">清除</el-button>
      </span>
      <span class="inc-sum-sep" aria-hidden="true">|</span>
      <el-radio-group v-model="statusFilter" size="small" @change="loadList">
        <el-radio-button :value="null">全部</el-radio-button>
        <el-radio-button value="open">待处理</el-radio-button>
        <el-radio-button value="in_progress">进行中</el-radio-button>
        <el-radio-button value="resolved">已解决</el-radio-button>
        <el-radio-button value="closed">已关闭</el-radio-button>
      </el-radio-group>
    </div>

    <div v-loading="loading" class="inc-list" role="list">
      <div
        v-for="row in filteredList"
        :key="rowId(row)"
        class="inc-card"
        role="listitem"
        tabindex="0"
        @click="openDetail(row)"
        @keyup.enter="openDetail(row)"
      >
        <div class="inc-card-main">
          <div class="inc-card-title">{{ row.title }}</div>
          <div class="inc-card-meta">
            <el-tag :type="severityTagType(row.severity)" size="small" effect="plain" class="ems-tag-soft">
              {{ severityLabel(row.severity) }}
            </el-tag>
            <el-tag type="info" size="small" effect="plain" class="ems-tag-soft">
              {{ statusLabel(row.status) }}
            </el-tag>
            <span v-if="row.building_id" class="inc-building">建筑 {{ row.building_id }}</span>
            <span class="inc-id num-font">#{{ rowId(row) }}</span>
          </div>
        </div>
        <div class="inc-card-time num-font">{{ formatTime(row.created_at) }}</div>
        <el-icon class="inc-card-arrow"><ArrowRight /></el-icon>
      </div>
      <el-empty v-if="!loading && !filteredList.length" description="暂无工单" :image-size="56" />
    </div>

    <el-drawer v-model="detailVisible" :title="detailEditing ? '编辑工单' : '工单详情'" size="420px" destroy-on-close>
      <template v-if="selected">
        <div v-if="!detailEditing" class="inc-detail">
          <div class="inc-detail-row">
            <span class="label">编号</span>
            <span class="value num-font">#{{ rowId(selected) }}</span>
          </div>
          <div class="inc-detail-row">
            <span class="label">标题</span>
            <span class="value title">{{ selected.title }}</span>
          </div>
          <div class="inc-detail-row">
            <span class="label">状态</span>
            <el-tag type="info" size="small">{{ statusLabel(selected.status) }}</el-tag>
          </div>
          <div class="inc-detail-row">
            <span class="label">级别</span>
            <el-tag :type="severityTagType(selected.severity)" size="small">
              {{ severityLabel(selected.severity) }}
            </el-tag>
          </div>
          <div class="inc-detail-row">
            <span class="label">建筑</span>
            <span class="value">{{ selected.building_id || '—' }}</span>
          </div>
          <div class="inc-detail-row">
            <span class="label">创建时间</span>
            <span class="value num-font">{{ formatTime(selected.created_at) }}</span>
          </div>
          <div class="inc-detail-row">
            <span class="label">更新时间</span>
            <span class="value num-font">{{ formatTime(selected.updated_at) }}</span>
          </div>
          <div class="inc-detail-block">
            <span class="label">详情描述</span>
            <p class="detail-text">{{ selected.detail || '（无）' }}</p>
          </div>
        </div>

        <el-form v-else label-width="72px" class="inc-edit-form">
          <el-form-item label="标题" required>
            <el-input v-model="editForm.title" />
          </el-form-item>
          <el-form-item label="建筑">
            <el-select v-model="editForm.building_id" clearable filterable style="width: 100%">
              <el-option
                v-for="b in buildings"
                :key="JSON.stringify(b)"
                :label="b.building_id ?? String(b)"
                :value="b.building_id ?? b.id"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="级别">
            <el-select v-model="editForm.severity" style="width: 100%">
              <el-option label="低" value="low" />
              <el-option label="中" value="medium" />
              <el-option label="高" value="high" />
              <el-option label="紧急" value="critical" />
            </el-select>
          </el-form-item>
          <el-form-item label="状态">
            <el-select v-model="editForm.status" style="width: 100%">
              <el-option label="待处理" value="open" />
              <el-option label="进行中" value="in_progress" />
              <el-option label="已解决" value="resolved" />
              <el-option label="已关闭" value="closed" />
            </el-select>
          </el-form-item>
          <el-form-item label="详情">
            <el-input v-model="editForm.detail" type="textarea" :rows="5" />
          </el-form-item>
        </el-form>

        <div class="inc-drawer-actions">
          <template v-if="!detailEditing">
            <el-button
              v-if="selected.status === 'open' || selected.status === 'in_progress'"
              type="primary"
              size="small"
              @click="patchStatus(selected, 'in_progress')"
            >
              受理
            </el-button>
            <el-button
              v-if="selected.status !== 'resolved'"
              size="small"
              @click="patchStatus(selected, 'resolved')"
            >
              标记解决
            </el-button>
            <el-button size="small" @click="detailEditing = true">编辑</el-button>
            <el-button type="danger" size="small" plain @click="removeIncident(selected)">删除</el-button>
          </template>
          <template v-else>
            <el-button type="primary" size="small" :loading="loading" @click="saveDetail">保存</el-button>
            <el-button size="small" @click="detailEditing = false">取消</el-button>
          </template>
        </div>
      </template>
    </el-drawer>

    <el-dialog v-model="dialogVisible" title="新建工单" width="520px">
      <el-form label-width="88px">
        <el-form-item label="标题" required>
          <el-input v-model="form.title" placeholder="如：空调夜间基荷偏高" />
        </el-form-item>
        <el-form-item label="建筑">
          <el-select v-model="form.building_id" clearable filterable style="width: 100%">
            <el-option
              v-for="b in buildings"
              :key="JSON.stringify(b)"
              :label="b.building_id ?? String(b)"
              :value="b.building_id ?? b.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="级别">
          <el-select v-model="form.severity" style="width: 100%">
            <el-option label="低" value="low" />
            <el-option label="中" value="medium" />
            <el-option label="高" value="high" />
            <el-option label="紧急" value="critical" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="form.status" style="width: 100%">
            <el-option label="待处理" value="open" />
            <el-option label="进行中" value="in_progress" />
          </el-select>
        </el-form-item>
        <el-form-item label="详情">
          <el-input v-model="form.detail" type="textarea" :rows="4" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="loading" @click="submitCreate">提交</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.inc-page {
  max-width: 920px;
  margin: 0 auto;
  padding: 0 var(--ems-space-sm, 8px);
}

.inc-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid #e4e7ed;
}

.inc-head-left,
.inc-head-voice {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}

.inc-head-voice {
  margin-left: auto;
}

.inc-head :deep(.el-button--large) {
  min-width: 120px;
  padding-left: 22px;
  padding-right: 22px;
  font-size: 15px;
}

.inc-head-voice :deep(.el-button--large.is-round) {
  min-width: auto;
}

.voice-guide-intro {
  font-size: 13px;
  color: #4e5969;
  line-height: 1.6;
  margin: 0 0 16px;
}

.voice-guide-section {
  margin-bottom: 20px;
}

.voice-guide-title {
  font-size: 14px;
  font-weight: 600;
  color: #1f2329;
  margin-bottom: 10px;
}

.voice-guide-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.hint-tag {
  font-size: 12px;
  max-width: 100%;
  height: auto;
  white-space: normal;
  line-height: 1.4;
  padding: 4px 8px;
}

.inc-voice-help {
  margin: 0;
  padding-left: 18px;
  font-size: 13px;
  color: #4e5969;
  line-height: 1.75;
}

.inc-voice-log {
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 12px;
  color: #86909c;
}

.log-raw {
  color: #86909c;
}

.inc-voice-log li {
  padding: 2px 0;
}

.log-at {
  color: #c9cdd4;
  margin-right: 6px;
}

.log-success {
  color: #00b42a;
}

.log-warning {
  color: #ff7d00;
}

.inc-search-tag {
  font-size: 12px;
  color: #409eff;
}

.inc-summary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #86909c;
  margin-bottom: 16px;
}

.inc-sum-item strong {
  color: #1f2329;
  font-weight: 600;
}

.inc-sum-sep {
  color: #e4e7ed;
}

.inc-list {
  min-height: 200px;
}

.inc-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  margin-bottom: 8px;
  background: #fff;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.inc-card:hover,
.inc-card:focus-visible {
  border-color: #409eff;
  box-shadow: 0 2px 8px rgba(64, 158, 255, 0.12);
  outline: none;
}

.inc-card-main {
  flex: 1;
  min-width: 0;
}

.inc-card-title {
  font-size: 14px;
  font-weight: 600;
  color: #1f2329;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.inc-card-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
}

.inc-building,
.inc-id {
  font-size: 12px;
  color: #86909c;
}

.inc-card-time {
  flex-shrink: 0;
  font-size: 12px;
  color: #86909c;
}

.inc-card-arrow {
  flex-shrink: 0;
  color: #c9cdd4;
}

.inc-detail-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  font-size: 13px;
}

.inc-detail-row .label,
.inc-detail-block .label {
  flex-shrink: 0;
  width: 72px;
  color: #86909c;
}

.inc-detail-row .value.title {
  font-weight: 600;
  color: #1f2329;
}

.inc-detail-block {
  margin-top: 8px;
}

.detail-text {
  margin: 8px 0 0;
  padding: 10px;
  background: #f7f8fa;
  border-radius: 6px;
  font-size: 13px;
  line-height: 1.55;
  color: #4e5969;
  white-space: pre-wrap;
}

.inc-drawer-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid #e4e7ed;
}

.voice-btn--active {
  animation: voice-pulse 1.2s ease-in-out infinite;
}

@keyframes voice-pulse {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(245, 63, 63, 0.35);
  }
  50% {
    box-shadow: 0 0 0 8px rgba(245, 63, 63, 0);
  }
}
</style>
