<script setup>
import { computed, onMounted, ref } from 'vue'
import { RefreshRight, CircleCheck } from '@element-plus/icons-vue'
import * as api from '@/api'
import { ElMessage, ElMessageBox } from 'element-plus'

const status = ref(null)
const health = ref(null)
const mcpTools = ref(null)
const importStatus = ref(null)
const loading = ref(false)
const reloading = ref(false)
const reindexing = ref(false)
const loadingMcp = ref(false)
const uploading = ref({ energy: false, meta: false, dict: false })

const PATH_LABELS = {
  energy_csv: '能耗 CSV',
  metadata_csv: '元数据 CSV',
  data_dictionary_csv: '数据字典',
  kb_root: '知识库目录',
  kb_index_db: 'KB 索引',
  sikong_jsonl: '司空 JSONL',
}

function formatBytes(n) {
  if (n == null || Number.isNaN(Number(n))) return '—'
  const v = Number(n)
  if (v < 1024) return `${v} B`
  if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`
  return `${(v / (1024 * 1024)).toFixed(2)} MB`
}

const pathTableRows = computed(() => {
  const paths = status.value?.paths
  if (!paths || typeof paths !== 'object') return []
  return Object.entries(paths).map(([key, info]) => {
    const isDir = key === 'kb_root'
    const exists = info?.exists === true
    let detail = '—'
    if (info?.error) detail = String(info.error)
    else if (isDir) detail = exists ? `${info.files ?? 0} 项` : '—'
    else detail = exists ? formatBytes(info.bytes) : '—'

    return {
      key,
      label: PATH_LABELS[key] ?? key,
      path: info?.path ?? '—',
      exists,
      detail,
    }
  })
})

const countsLine = computed(() => {
  const c = status.value?.counts ?? {}
  const e = c.energy_rows != null ? c.energy_rows : '—'
  const m = c.metadata_rows != null ? c.metadata_rows : '—'
  const s = c.sikong_rows != null ? c.sikong_rows : '—'
  return { e, m, s }
})

const readyKb = computed(() => !!status.value?.ready?.kb_index_ready)
const readySk = computed(() => !!status.value?.ready?.sikong_ready)

const apiBaseDisplay = computed(() => {
  const b = import.meta.env.VITE_API_BASE
  return b && String(b).trim() ? String(b).replace(/\/$/, '') : '同源'
})

async function loadHealth() {
  try {
    health.value = await api.getHealth()
  } catch {
    health.value = null
  }
}

async function loadMcp() {
  loadingMcp.value = true
  try {
    mcpTools.value = await api.getMcpTools().catch(() => null)
  } finally {
    loadingMcp.value = false
  }
}

async function loadImportStatus() {
  importStatus.value = await api.getAdminDatasetImportStatus().catch(() => null)
}

async function load() {
  loading.value = true
  try {
    const [s] = await Promise.all([api.getAdminStatus(), loadHealth(), loadImportStatus()])
    status.value = s
  } catch (e) {
    ElMessage.error(e.message ?? '无法读取状态')
    status.value = null
  } finally {
    loading.value = false
  }
}

async function reloadData() {
  try {
    await ElMessageBox.confirm('清除缓存并从磁盘重新加载 CSV / JSONL？', 'Reload', {
      type: 'warning',
    })
  } catch {
    return
  }
  reloading.value = true
  try {
    const res = await api.postAdminReload()
    ElMessage.success(`已加载 · 能耗 ${res?.counts?.energy_rows ?? '—'} 行`)
    await load()
  } catch (e) {
    ElMessage.error(e.message ?? '失败')
  } finally {
    reloading.value = false
  }
}

async function reindexKb() {
  try {
    await ElMessageBox.confirm('重建知识库索引可能较慢，确认继续？', 'KB 索引', {
      type: 'warning',
    })
  } catch {
    return
  }
  reindexing.value = true
  try {
    await api.postAdminKbReindex()
    ElMessage.success('已完成')
    await load()
  } catch (e) {
    ElMessage.error(e.message ?? '失败')
  } finally {
    reindexing.value = false
  }
}

async function onUploadEnergy(opt) {
  const f = opt?.file
  if (!f) return
  uploading.value.energy = true
  try {
    const r = await api.postAdminDatasetUploadEnergy(f)
    ElMessage.success(`能耗数据已导入 ${r.rows ?? '—'} 行`)
    await load()
    await loadImportStatus()
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail ?? e.message ?? '上传失败')
  } finally {
    uploading.value.energy = false
  }
}

async function onUploadMeta(opt) {
  const f = opt?.file
  if (!f) return
  uploading.value.meta = true
  try {
    const r = await api.postAdminDatasetUploadMetadata(f)
    ElMessage.success(`元数据已导入 ${r.rows ?? '—'} 行`)
    await load()
    await loadImportStatus()
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail ?? e.message ?? '上传失败')
  } finally {
    uploading.value.meta = false
  }
}

async function onUploadDict(opt) {
  const f = opt?.file
  if (!f) return
  uploading.value.dict = true
  try {
    const r = await api.postAdminDatasetUploadDictionary(f)
    ElMessage.success(`数据字典已导入 ${r.rows ?? '—'} 行`)
    await load()
    await loadImportStatus()
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail ?? e.message ?? '上传失败')
  } finally {
    uploading.value.dict = false
  }
}

onMounted(async () => {
  await load()
  await loadMcp()
})
</script>

<template>
  <div class="myems-page admin-view ems-page-shell">
    <header class="admin-page-head">
      <h1 class="myems-page-title">系统管理</h1>
      <p class="myems-page-desc">
      数据与知识库运维；支持 CSV 导入覆盖默认数据集。API {{ apiBaseDisplay }} · 生产请为
      <code>/api/admin</code> 加鉴权
      </p>
    </header>

    <el-card shadow="never" class="ems-card admin-card hide-print">
      <template #header>数据集导入（HTTP）</template>
      <p class="upload-hint">
        上传文件保存至后端 <code>data/imported/</code>，优先级高于环境变量路径。能耗表需含
        building_id、monitor_time 及至少一类指标列。
      </p>
      <el-descriptions v-if="importStatus" :column="1" size="small" border class="import-desc">
        <el-descriptions-item label="能耗 CSV">
          {{ importStatus.energy?.active_path ?? '—' }}
          <el-tag v-if="importStatus.energy?.using_imported" size="small" type="success" class="ml8"
            >已用上传</el-tag
          >
        </el-descriptions-item>
        <el-descriptions-item label="元数据 CSV">
          {{ importStatus.metadata?.active_path ?? '—' }}
          <el-tag v-if="importStatus.metadata?.using_imported" size="small" type="success" class="ml8"
            >已用上传</el-tag
          >
        </el-descriptions-item>
        <el-descriptions-item label="数据字典 CSV">
          {{ importStatus.data_dictionary?.active_path ?? '—' }}
          <el-tag
            v-if="importStatus.data_dictionary?.using_imported"
            size="small"
            type="success"
            class="ml8"
            >已用上传</el-tag
          >
        </el-descriptions-item>
      </el-descriptions>
      <div class="upload-row">
        <el-upload
          :show-file-list="false"
          :disabled="uploading.energy"
          accept=".csv"
          :http-request="onUploadEnergy"
        >
          <el-button type="primary" size="small" :loading="uploading.energy">上传能耗 CSV</el-button>
        </el-upload>
        <el-upload
          :show-file-list="false"
          :disabled="uploading.meta"
          accept=".csv"
          :http-request="onUploadMeta"
        >
          <el-button size="small" :loading="uploading.meta">上传元数据 CSV</el-button>
        </el-upload>
        <el-upload
          :show-file-list="false"
          :disabled="uploading.dict"
          accept=".csv"
          :http-request="onUploadDict"
        >
          <el-button size="small" :loading="uploading.dict">上传数据字典 CSV</el-button>
        </el-upload>
      </div>
    </el-card>

    <div class="admin-bar">
      <el-button type="primary" :icon="RefreshRight" :loading="loading" size="small" @click="load">
        刷新
      </el-button>
      <el-button size="small" :loading="reloading" @click="reloadData">Reload 数据</el-button>
      <el-button size="small" type="danger" plain :loading="reindexing" @click="reindexKb">重建 KB</el-button>
    </div>

    <el-alert type="warning" show-icon :closable="false" class="admin-hint">演示环境无登录校验。</el-alert>

    <el-card v-loading="loading" shadow="never" class="ems-card admin-card">
      <div class="status-line">
        <el-tag :type="health ? 'success' : 'danger'" size="small" effect="light">
          {{ health ? 'API 正常' : 'API 不可用' }}
        </el-tag>
        <span class="stat-text">能耗 <strong>{{ countsLine.e }}</strong> 行</span>
        <span class="stat-text">元数据 <strong>{{ countsLine.m }}</strong> 行</span>
        <span class="stat-text">司空 <strong>{{ countsLine.s }}</strong> 条</span>
        <el-tag :type="readyKb ? 'success' : 'info'" size="small">KB {{ readyKb ? '就绪' : '未索引' }}</el-tag>
        <el-tag :type="readySk ? 'success' : 'info'" size="small">司空 {{ readySk ? '就绪' : '未就绪' }}</el-tag>
        <el-tag :type="status?.ready?.llm_configured ? 'success' : 'info'" size="small">
          LLM {{ status?.ready?.llm_configured ? (status?.llm?.model ?? '已配置') : '未配置' }}
        </el-tag>
      </div>

      <el-table
        v-if="pathTableRows.length"
        :data="pathTableRows"
        stripe
        size="small"
        class="path-table"
        max-height="280"
      >
        <el-table-column prop="label" label="资源" width="108" />
        <el-table-column prop="path" label="路径" min-width="160" show-overflow-tooltip>
          <template #default="{ row }">
            <span class="mono">{{ row.path }}</span>
          </template>
        </el-table-column>
        <el-table-column label="" width="48" align="center">
          <template #default="{ row }">
            <el-icon v-if="row.exists" class="ok"><CircleCheck /></el-icon>
            <span v-else class="bad">×</span>
          </template>
        </el-table-column>
        <el-table-column prop="detail" label="大小" width="96" />
      </el-table>
      <el-empty v-else description="—" :image-size="48" />
    </el-card>

    <el-collapse class="admin-more">
      <el-collapse-item title="MCP 工具列表" name="mcp">
        <div v-loading="loadingMcp">
          <el-table
            v-if="mcpTools?.tools?.length"
            :data="mcpTools.tools"
            stripe
            size="small"
            max-height="280"
          >
            <el-table-column prop="name" label="工具" width="180" show-overflow-tooltip />
            <el-table-column prop="description" label="说明" show-overflow-tooltip />
            <el-table-column label=" " width="64" align="center">
              <template #default="{ row }">
                <span class="mono tiny">{{ row.method }}</span>
              </template>
            </el-table-column>
          </el-table>
          <el-empty v-else description="无" :image-size="48" />
        </div>
      </el-collapse-item>
      <el-collapse-item v-if="status?.notes?.length" title="备注" name="notes">
        <ul class="note-ul">
          <li v-for="(n, i) in status.notes" :key="i">{{ n }}</li>
        </ul>
      </el-collapse-item>
      <el-collapse-item title="status JSON" name="json">
        <pre v-if="status" class="json-preview">{{ JSON.stringify(status, null, 2) }}</pre>
      </el-collapse-item>
    </el-collapse>
  </div>
</template>

<style scoped>
.admin-page-head {
  border-left: 3px solid var(--el-color-primary);
  padding-left: 14px;
  margin-bottom: 4px;
  background: linear-gradient(90deg, rgba(24, 144, 255, 0.06), transparent 50%);
  border-radius: 0 8px 8px 0;
}

.upload-hint {
  font-size: 12px;
  color: rgba(0, 0, 0, 0.55);
  margin: 0 0 12px;
  line-height: 1.5;
}

.import-desc {
  margin-bottom: 12px;
}

.ml8 {
  margin-left: 8px;
}

.upload-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}

.admin-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
}

.admin-hint {
  margin-bottom: 12px;
  padding: 8px 12px;
}

.admin-card {
  margin-bottom: 12px;
}

.status-line {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 14px;
  margin-bottom: 12px;
  font-size: 13px;
  color: rgba(0, 0, 0, 0.65);
}

.stat-text strong {
  font-variant-numeric: tabular-nums;
}

.path-table {
  width: 100%;
}

.path-table :deep(.el-table__header th) {
  background: #fafafa;
}

.mono {
  font-family: ui-monospace, monospace;
  font-size: 12px;
}

.tiny {
  font-size: 11px;
}

.ok {
  color: var(--el-color-success);
  font-size: 16px;
}

.bad {
  color: var(--el-color-danger);
  font-weight: 700;
}

.admin-more {
  border: none;
  --el-collapse-header-height: 40px;
}

.admin-more :deep(.el-collapse-item__header) {
  font-size: 13px;
  color: rgba(0, 0, 0, 0.55);
}

.note-ul {
  margin: 0;
  padding-left: 1.2em;
  font-size: 12px;
  color: rgba(0, 0, 0, 0.55);
  line-height: 1.6;
}

.json-preview {
  margin: 0;
  max-height: 40vh;
  overflow: auto;
  font-size: 11px;
  background: #0f172a;
  color: #e2e8f0;
  padding: 10px;
  border-radius: 6px;
}

.myems-page-desc code {
  font-size: 12px;
  padding: 0 4px;
  background: #f0f2f5;
  border-radius: 3px;
}
</style>
