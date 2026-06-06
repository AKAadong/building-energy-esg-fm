import { ref } from 'vue'
import { defineStore } from 'pinia'

const STORAGE_KEY = 'ems-twin-vision-session'

function readStorage() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function writeStorage(payload) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    return true
  } catch {
    return false
  }
}

/** 孪生视觉页会话：离开路由后仍可恢复识别结果与预览图 */
export const useTwinSessionStore = defineStore('twinSession', () => {
  const uploadResult = ref(null)
  const previewDataUrl = ref('')
  const previewFileName = ref('')
  const objectDims = ref([])
  const selectedObjIdx = ref(0)
  const twinBuildingId = ref('')
  const autoIncidentInfo = ref(null)

  function hasSession() {
    return uploadResult.value != null
  }

  function clear() {
    uploadResult.value = null
    previewDataUrl.value = ''
    previewFileName.value = ''
    objectDims.value = []
    selectedObjIdx.value = 0
    twinBuildingId.value = ''
    autoIncidentInfo.value = null
    try {
      sessionStorage.removeItem(STORAGE_KEY)
    } catch {
      /* ignore */
    }
  }

  function save(payload) {
    uploadResult.value = payload.uploadResult ?? null
    previewDataUrl.value = payload.previewDataUrl ?? ''
    previewFileName.value = payload.previewFileName ?? ''
    objectDims.value = Array.isArray(payload.objectDims) ? payload.objectDims : []
    selectedObjIdx.value = Number(payload.selectedObjIdx) || 0
    twinBuildingId.value = payload.twinBuildingId ?? ''
    autoIncidentInfo.value = payload.autoIncidentInfo ?? null
    writeStorage({
      uploadResult: uploadResult.value,
      previewDataUrl: previewDataUrl.value,
      previewFileName: previewFileName.value,
      objectDims: objectDims.value,
      selectedObjIdx: selectedObjIdx.value,
      twinBuildingId: twinBuildingId.value,
      autoIncidentInfo: autoIncidentInfo.value,
    })
  }

  /** 从 sessionStorage 恢复到 store（组件 onMounted 再读 store） */
  function hydrateFromStorage() {
    const data = readStorage()
    if (!data?.uploadResult) return false
    uploadResult.value = data.uploadResult
    previewDataUrl.value = data.previewDataUrl ?? ''
    previewFileName.value = data.previewFileName ?? ''
    objectDims.value = Array.isArray(data.objectDims) ? data.objectDims : []
    selectedObjIdx.value = Number(data.selectedObjIdx) || 0
    twinBuildingId.value = data.twinBuildingId ?? ''
    autoIncidentInfo.value = data.autoIncidentInfo ?? null
    return true
  }

  return {
    uploadResult,
    previewDataUrl,
    previewFileName,
    objectDims,
    selectedObjIdx,
    twinBuildingId,
    autoIncidentInfo,
    hasSession,
    clear,
    save,
    hydrateFromStorage,
  }
})
