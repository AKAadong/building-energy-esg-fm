<script setup>
import { nextTick, onMounted, ref } from 'vue'
import { ChatDotRound } from '@element-plus/icons-vue'
import * as api from '@/api'
import { ElMessage } from 'element-plus'

const inputText = ref('')
const loading = ref(false)
const kbLimit = ref(8)
const sikongLimit = ref(5)
const kbStatus = ref(null)
const sikongStatus = ref(null)
const llmStatus = ref(null)
const buildings = ref([])
const buildingId = ref('')
/** auto：已配置 LLM 时走生成；off：仅检索拼装；on：强制请求 LLM（未配置则回退） */
const llmMode = ref('auto')
/** local：本后端 RAG；chatchat：转发队友 Langchain-Chatchat 知识库对话 */
const qaChannel = ref('local')
/** 队友知识库默认名：留空或未填时使用 */
const DEFAULT_CHATCHAT_KB = 'building-energy-esg-fm'
const chatchatKbName = ref(DEFAULT_CHATCHAT_KB)
const chatchatStatus = ref(null)
const scrollRef = ref(null)

/** @type {import('vue').Ref<Array<Record<string, unknown>>>} */
const messages = ref([])

function fileName(p) {
  if (!p) return ''
  const s = String(p).replace(/\\/g, '/')
  return s.split('/').pop() || s
}

function scrollToBottom() {
  nextTick(() => {
    const el = scrollRef.value
    if (el) el.scrollTop = el.scrollHeight
  })
}

/**
 * 仅从 Chatchat 响应中取出 choices[0].message.content，绝不展示 id/object/model 等字段。
 * @param {unknown} raw
 */
function parseChatchatAnswer(raw) {
  let res = raw
  if (res == null) return ''
  // 上游偶发返回 JSON 字符串；必须先 parse，否则会整段当「正文」显示
  if (typeof res === 'string') {
    const s = res.trim()
    if (s.startsWith('{') || s.startsWith('[')) {
      try {
        res = JSON.parse(s)
      } catch {
        return s
      }
    } else {
      return s
    }
  }
  if (typeof res !== 'object' || res === null) return String(res)

  const code = /** @type {Record<string, unknown>} */ (res).code
  if (code != null && code !== 200) {
    const o = /** @type {Record<string, unknown>} */ (res)
    return `【Chatchat】${o.msg || o.detail || '错误'}（code ${code}）`
  }

  /** @param {unknown} v */
  function asText(v) {
    if (v == null) return ''
    if (typeof v === 'string') return v
    if (typeof v === 'number' || typeof v === 'boolean') return String(v)
    return ''
  }

  let text = ''
  const root = /** @type {Record<string, unknown>} */ (res)

  // 1) OpenAI / Chatchat 最常见：choices[0].message.content（优先，避免与顶层字段混淆）
  const choices = root.choices
  if (Array.isArray(choices) && choices[0] && typeof choices[0] === 'object') {
    const c0 = /** @type {Record<string, unknown>} */ (choices[0])
    const msg = c0.message
    if (msg && typeof msg === 'object') {
      const m = /** @type {Record<string, unknown>} */ (msg)
      text = asText(m.content)
    }
    if (!text.trim() && c0.delta && typeof c0.delta === 'object') {
      const d = /** @type {Record<string, unknown>} */ (c0.delta)
      text = asText(d.content)
    }
  }

  // 2) 顶层或嵌套 data
  if (!text.trim()) text = asText(root.content)
  if (!text.trim() && typeof root.answer === 'string') text = root.answer
  if (!text.trim() && typeof root.text === 'string') text = root.text
  const data = root.data
  if (!text.trim() && data && typeof data === 'object') {
    const d = /** @type {Record<string, unknown>} */ (data)
    if (typeof d.answer === 'string') text = d.answer
    if (!text.trim() && typeof d.content === 'string') text = d.content
  }

  text = text.trim()
  if (text) return text
  if (root.msg && typeof root.msg === 'string' && root.msg.trim()) return root.msg.trim()

  return '【暂无可显示的正文】队友侧 Chatchat 返回了空内容，请检查知识库与模型服务。'
}

/** 将正文按空行分段，段内换行收束为空格，便于正式段落展示 */
function chatchatParagraphs(text) {
  if (text == null || typeof text !== 'string') return []
  return text
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

async function send() {
  const q = inputText.value.trim()
  if (!q || loading.value) return
  loading.value = true
  messages.value.push({ role: 'user', content: q })
  inputText.value = ''
  scrollToBottom()
  try {
    if (qaChannel.value === 'chatchat') {
      const kbName = chatchatKbName.value.trim() || DEFAULT_CHATCHAT_KB
      const res = await api.postChatchatKbChat({
        query: q,
        kb_name: kbName,
        mode: 'local_kb',
        stream: false,
      })
      messages.value.push({
        role: 'assistant',
        content: parseChatchatAnswer(res),
        chatchat: true,
        chatchat_kb: kbName,
      })
    } else {
      const body = {
        query: q,
        kb_limit: kbLimit.value,
        sikong_limit: sikongLimit.value,
      }
      if (llmMode.value === 'on') body.use_llm = true
      else if (llmMode.value === 'off') body.use_llm = false
      if (buildingId.value) body.building_id = buildingId.value

      const res = await api.postAssistantRagAnswer(body)
      messages.value.push({
        role: 'assistant',
        content: res.answer ?? '',
        description: res.description,
        citations: res.citations,
        retrieval: res.retrieval,
        mode: res.mode,
        llm: res.llm,
        baseline_answer: res.baseline_answer,
      })
    }
  } catch (e) {
    const detail = e?.response?.data?.detail
    const msg = Array.isArray(detail) ? detail.map((x) => x.msg || x).join('; ') : detail
    const text = msg || e?.message || String(e ?? '请求失败')
    messages.value.push({
      role: 'assistant',
      content: text,
      error: true,
    })
    ElMessage.error(typeof text === 'string' ? text.slice(0, 200) : '问答失败')
  } finally {
    loading.value = false
    scrollToBottom()
  }
}

function clearChat() {
  messages.value = []
}

onMounted(async () => {
  try {
    kbStatus.value = await api.getKbStatus().catch(() => null)
    sikongStatus.value = await api.getSikongStatus().catch(() => null)
    llmStatus.value = await api.getAssistantLlmStatus().catch(() => null)
    chatchatStatus.value = await api.getChatchatStatus().catch(() => null)
    const b = await api.getBuildings().catch(() => ({}))
    buildings.value = Array.isArray(b?.items) ? b.items : []
  } catch {
    /* ignore */
  }
})
</script>

<template>
  <div class="page-qa qa-terminal">
    <div class="qa-hero">
      <div class="qa-hero-text">
        <h1 class="qa-title">领域智能问答</h1>
        <p class="qa-sub">
          默认使用本后端 RAG（规范 PDF、司空语料、数据字典等）；也可切换为经后端转发的
          <strong>Langchain-Chatchat</strong> 知识库对话（需在 backend 配置
          <code class="inline-code">CHATCHAT_BASE_URL</code> 指向队友 API）。
        </p>
      </div>
      <div class="qa-hero-tags">
        <el-tag
          v-if="chatchatStatus?.configured"
          :type="chatchatStatus?.reachable ? 'success' : 'warning'"
          size="small"
          effect="plain"
          class="ems-tag-soft"
        >
          Chatchat 转发 {{ chatchatStatus?.reachable ? '可连' : '不可达' }}
        </el-tag>
        <el-tag v-else type="info" size="small" effect="plain" class="ems-tag-soft">Chatchat 未配置</el-tag>
        <el-tag
          :type="kbStatus?.index_ready ? 'success' : 'info'"
          size="small"
          effect="plain"
          class="ems-tag-soft"
        >
          PDF 索引 {{ kbStatus?.index_ready ? '就绪' : '未就绪' }}
        </el-tag>
        <el-tag :type="sikongStatus?.ready ? 'success' : 'info'" size="small" effect="plain" class="ems-tag-soft">
          司空语料 {{ sikongStatus?.rows != null ? `${sikongStatus.rows} 条` : '—' }}
        </el-tag>
        <el-tag
          :type="llmStatus?.configured ? 'success' : 'warning'"
          size="small"
          effect="plain"
          class="ems-tag-soft"
        >
          LLM {{ llmStatus?.configured ? `已配置 · ${llmStatus?.model ?? ''}` : '未配置（仅检索拼装）' }}
        </el-tag>
      </div>
    </div>

    <div class="qa-surface">
      <div ref="scrollRef" class="qa-messages">
        <el-alert :closable="false" type="info" show-icon class="qa-intro" :border="false">
          <template #title>使用说明</template>
          支持能耗查询、异常原因分析、规范与设备类问题。系统将检索 PDF、司空语料与数据字典，并在问题涉及运维数据时注入时段汇总与异常检测摘要；若已配置 LLM，将生成归纳回答。
        </el-alert>

        <div v-for="(m, idx) in messages" :key="idx" class="msg" :class="m.role">
          <div class="msg-body">
            <div
              v-if="m.role === 'assistant' && m.description && !m.error && !m.chatchat"
              class="msg-hint"
            >
              {{ m.description }}
            </div>
            <div v-if="m.role === 'user'" class="msg-user-text">{{ m.content }}</div>
            <div v-else class="msg-ai-block" :class="{ err: m.error }">
              <div
                v-if="m.chatchat && !m.error"
                class="msg-text msg-text--formal"
              >
                <p
                  v-for="(para, pi) in chatchatParagraphs(m.content)"
                  :key="pi"
                  class="msg-formal-para"
                >
                  {{ para }}
                </p>
              </div>
              <pre v-else class="msg-text">{{ m.content }}</pre>
            </div>
            <div v-if="m.role === 'assistant' && m.mode && !m.error && !m.chatchat" class="msg-mode">
              <el-tag v-if="m.mode === 'rag_llm'" type="success" size="small" effect="plain" class="ems-tag-soft">
                RAG + LLM
              </el-tag>
              <el-tag v-else type="info" size="small" effect="plain" class="ems-tag-soft">检索拼装</el-tag>
              <span v-if="m.llm?.error" class="llm-err">{{ m.llm.error }}</span>
            </div>
            <div
              v-if="m.role === 'assistant' && m.retrieval && !m.error && !m.chatchat"
              class="msg-retrieval"
            >
              <span v-if="m.retrieval.pdf">规范 {{ m.retrieval.pdf.count ?? 0 }}</span>
              <span v-if="m.retrieval.sikong" class="sep">·</span>
              <span v-if="m.retrieval.sikong">司空 {{ m.retrieval.sikong.count ?? 0 }}</span>
              <span v-if="m.retrieval.data_dictionary" class="sep">·</span>
              <span v-if="m.retrieval.data_dictionary">字典 {{ m.retrieval.data_dictionary.count ?? 0 }}</span>
              <span v-if="m.retrieval.ops_data?.included" class="sep">·</span>
              <span v-if="m.retrieval.ops_data?.included">含运维数据摘要</span>
            </div>
            <el-collapse
              v-if="m.role === 'assistant' && m.baseline_answer && m.mode === 'rag_llm' && !m.error && !m.chatchat"
              class="msg-baseline"
            >
              <el-collapse-item title="检索拼装底稿（对照）" name="bl">
                <pre class="baseline-pre">{{ m.baseline_answer }}</pre>
              </el-collapse-item>
            </el-collapse>
            <el-collapse
              v-if="m.role === 'assistant' && m.citations?.length && !m.error && !m.chatchat"
              class="msg-cites"
            >
              <el-collapse-item title="引用来源" name="c1">
                <ul class="cite-list">
                  <li v-for="(c, i) in m.citations" :key="i" class="cite-item">
                    <template v-if="c && typeof c === 'object' && c.type === 'pdf'">
                      <el-tag size="small" type="primary" effect="plain">PDF</el-tag>
                      {{ fileName(c.source) }}
                      <span v-if="c.chunk_id != null" class="muted">chunk {{ c.chunk_id }}</span>
                    </template>
                    <template v-else-if="c && typeof c === 'object' && c.type === 'sikong'">
                      <el-tag size="small" type="success" effect="plain">司空</el-tag>
                      <span class="cite-preview">{{ c.input_preview }}</span>
                    </template>
                    <template v-else-if="c && typeof c === 'object' && c.type === 'data_dictionary'">
                      <el-tag size="small" type="warning" effect="plain">数据字典</el-tag>
                      <span class="cite-preview">{{ JSON.stringify(c.fields) }}</span>
                    </template>
                    <template v-else>{{ JSON.stringify(c) }}</template>
                  </li>
                </ul>
              </el-collapse-item>
            </el-collapse>
          </div>
        </div>

        <div v-if="loading" class="msg assistant loading-row">
          <div class="msg-body">
            <div class="msg-ai-block loading-bubble">
              <span class="typing">正在检索知识库并生成回答…</span>
            </div>
          </div>
        </div>
      </div>

      <div class="qa-compose qa-compose--dock">
        <el-collapse class="qa-advanced">
          <el-collapse-item title="检索与生成" name="adv">
            <div class="adv-row adv-row-top">
              <span class="adv-label">问答通道</span>
              <el-radio-group v-model="qaChannel" size="small">
                <el-radio-button value="local">本后端 RAG</el-radio-button>
                <el-radio-button value="chatchat">Chatchat 知识库</el-radio-button>
              </el-radio-group>
            </div>
            <div v-if="qaChannel === 'chatchat'" class="adv-row">
              <span class="adv-label">知识库名（可选）</span>
              <el-input
                v-model="chatchatKbName"
                clearable
                placeholder="默认 building-energy-esg-fm；留空则使用默认"
              />
            </div>
            <div v-if="qaChannel === 'local'" class="adv-row adv-row-top">
              <span class="adv-label">生成模式</span>
              <el-radio-group v-model="llmMode" size="small">
                <el-radio-button value="auto">自动</el-radio-button>
                <el-radio-button value="on">强制 LLM</el-radio-button>
                <el-radio-button value="off">仅检索</el-radio-button>
              </el-radio-group>
            </div>
            <div v-if="qaChannel === 'local'" class="adv-row">
              <span class="adv-label">建筑（数据摘要）</span>
              <el-select
                v-model="buildingId"
                clearable
                filterable
                placeholder="全库（可选）"
                style="width: 100%"
              >
                <el-option
                  v-for="b in buildings"
                  :key="b.building_id || b.id || JSON.stringify(b)"
                  :label="(b.building_name || b.name || b.building_id || '—') + ''"
                  :value="(b.building_id || b.id || '') + ''"
                />
              </el-select>
            </div>
            <div v-if="qaChannel === 'local'" class="adv-row">
              <span class="adv-label">规范 PDF 条数</span>
              <el-slider v-model="kbLimit" :min="1" :max="20" :step="1" show-stops />
            </div>
            <div v-if="qaChannel === 'local'" class="adv-row">
              <span class="adv-label">司空语料条数</span>
              <el-slider v-model="sikongLimit" :min="1" :max="15" :step="1" show-stops />
            </div>
          </el-collapse-item>
        </el-collapse>

        <div class="qa-input-row">
          <el-input
            v-model="inputText"
            type="textarea"
            :rows="2"
            :autosize="{ minRows: 2, maxRows: 6 }"
            placeholder="输入问题，例如：空气源热泵能效限定值相关条文有哪些？"
            :disabled="loading"
            @keydown.enter.exact.prevent="send"
          />
          <div class="qa-actions">
            <el-button :disabled="loading" text @click="clearChat">清空</el-button>
            <el-button type="primary" :loading="loading" :icon="ChatDotRound" circle @click="send" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page-qa {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: calc(100vh - 120px);
}

.qa-terminal {
  max-width: 880px;
  margin: 0 auto;
  padding: 0 8px 24px;
}

.qa-hero {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 14px;
  padding: 8px 0 4px;
  border-left: 2px solid #e4e7ed;
  padding-left: 12px;
  margin-left: 0;
  background: transparent;
  border-radius: 0;
}

.qa-title {
  margin: 0;
  font-size: clamp(1.15rem, 2.2vw, 1.4rem);
  font-weight: 650;
  color: rgba(0, 0, 0, 0.88);
  letter-spacing: 0.03em;
}

.qa-sub {
  margin: 8px 0 0;
  font-size: 13px;
  line-height: 1.65;
  color: rgba(0, 0, 0, 0.45);
  max-width: 760px;
}

.inline-code {
  font-size: 12px;
  padding: 2px 7px;
  background: rgba(24, 144, 255, 0.08);
  border: 1px solid rgba(24, 144, 255, 0.18);
  border-radius: 4px;
  color: rgba(0, 0, 0, 0.75);
  font-family: ui-monospace, 'Cascadia Code', 'Segoe UI Mono', monospace;
}

.msg-mode {
  margin-bottom: 6px;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.llm-err {
  font-size: 12px;
  color: #b45309;
}

.msg-baseline {
  margin-top: 8px;
  border: none;
}

.msg-baseline :deep(.el-collapse-item__header) {
  font-size: 12px;
  color: #64748b;
  height: 32px;
}

.baseline-pre {
  margin: 0;
  white-space: pre-wrap;
  font-size: 12px;
  line-height: 1.5;
  color: #475569;
  max-height: 240px;
  overflow: auto;
}

.adv-row-top {
  align-items: flex-start;
}

.qa-hero-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.qa-surface {
  flex: 1;
  display: flex;
  flex-direction: column;
  border-radius: 0;
  border: none;
  overflow: hidden;
  min-height: 480px;
  background: #f5f6f8;
}

.qa-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px 0 20px;
  max-width: 800px;
  margin: 0 auto;
  width: 100%;
  box-sizing: border-box;
}

.qa-intro {
  margin-bottom: 16px;
}

.msg {
  display: flex;
  gap: 10px;
  margin-bottom: 18px;
  align-items: flex-start;
}

.msg.user {
  flex-direction: row-reverse;
}

.msg-body {
  max-width: 800px;
  width: 100%;
  min-width: 0;
  margin: 0 auto;
}

.msg.user .msg-body {
  align-items: flex-end;
  display: flex;
  flex-direction: column;
}

.msg-user-text {
  font-size: 16px;
  font-weight: 600;
  color: #1f2329;
  line-height: 1.5;
  text-align: right;
  padding: 4px 0 8px;
}

.msg-ai-block {
  background: #f8f9fa;
  border: none;
  border-radius: 0;
  padding: 12px 14px;
  box-shadow: none;
}

.msg-ai-block.err {
  background: #fff2f0;
}

.msg-hint {
  font-size: 12px;
  color: #64748b;
  margin-bottom: 6px;
  line-height: 1.4;
}

.msg-text {
  margin: 0;
  white-space: pre-wrap;
  font-family: inherit;
  font-size: 14px;
  line-height: 1.65;
  color: #0f172a;
  word-break: break-word;
}

/* Chatchat：仅展示 content，正文分段排版 */
.msg-text--formal {
  white-space: normal;
}

.msg-formal-para {
  margin: 0 0 0.85em;
  font-size: 15px;
  line-height: 1.8;
  color: #1e293b;
  text-align: justify;
}

.msg-formal-para:first-child {
  text-indent: 2em;
}

.msg-formal-para:last-child {
  margin-bottom: 0;
}

.msg-retrieval {
  margin-top: 8px;
  font-size: 12px;
  color: #94a3b8;
}

.msg-retrieval .sep {
  margin: 0 6px;
}

.msg-cites {
  margin-top: 8px;
  border: none;
}

.msg-cites :deep(.el-collapse-item__header) {
  font-size: 13px;
  color: #475569;
  height: 36px;
  line-height: 36px;
}

.cite-list {
  margin: 0;
  padding-left: 18px;
  font-size: 13px;
  color: #334155;
}

.cite-item {
  margin-bottom: 8px;
}

.cite-preview {
  margin-left: 6px;
}

.muted {
  margin-left: 8px;
  color: #94a3b8;
  font-size: 12px;
}

.loading-bubble {
  background: #f8f9fa;
}

.typing {
  color: #64748b;
  font-size: 14px;
}

.qa-compose {
  border-top: 1px solid #e4e7ed;
  padding: 10px 0 12px;
  background: #fff;
  max-width: 800px;
  margin: 0 auto;
  width: 100%;
  box-sizing: border-box;
}

.qa-compose--dock {
  position: sticky;
  bottom: 0;
  z-index: 5;
  box-shadow: 0 -1px 0 #e4e7ed;
}

.qa-advanced {
  margin-bottom: 10px;
  border: none;
}

.qa-advanced :deep(.el-collapse-item__header) {
  font-size: 13px;
  color: #64748b;
  height: 36px;
}

.adv-row {
  display: grid;
  grid-template-columns: 120px 1fr;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}

.adv-label {
  font-size: 13px;
  color: #475569;
}

.qa-input-row {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.qa-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
</style>
