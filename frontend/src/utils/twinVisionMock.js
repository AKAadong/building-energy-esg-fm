/**
 * 孪生与视觉页演示数据（后端未就绪或接口失败时使用）
 */

export function getMockTwinScene() {
  return {
    demo: true,
    building_id: 'DEMO-BLD-01',
    building_name: '演示综合楼',
    updated_at: new Date().toISOString(),
    floors: [
      {
        floor_id: 'B1',
        name: '地下一层',
        rooms: [
          { id: 'B1-01', name: '配电间', status: 'normal', area_m2: 32, device_hint: '变压器 / UPS' },
          { id: 'B1-02', name: '机房', status: 'warning', area_m2: 48, device_hint: '冷通道' },
        ],
      },
      {
        floor_id: '1F',
        name: '一层',
        rooms: [
          { id: '1F-01', name: '大厅', status: 'normal', area_m2: 120, occupancy: 0.35 },
          { id: '1F-02', name: '会议室 A', status: 'occupied', area_m2: 45, occupancy: 0.82 },
          { id: '1F-03', name: '会议室 B', status: 'offline', area_m2: 40, occupancy: 0 },
        ],
      },
      {
        floor_id: '2F',
        name: '二层',
        rooms: [
          { id: '2F-01', name: '开放办公', status: 'normal', area_m2: 280, occupancy: 0.58 },
          { id: '2F-02', name: '茶水间', status: 'normal', area_m2: 22, occupancy: 0.1 },
        ],
      },
    ],
  }
}

export function getMockVisionAnalyze(filename) {
  return {
    demo: true,
    filename: filename || 'meeting_room.jpg',
    model: 'stub',
    boxes: [
      { label: 'person', confidence: 0.91, bbox: [120, 88, 280, 360] },
      { label: 'chair', confidence: 0.76, bbox: [300, 200, 420, 380] },
    ],
    note: '演示结构：后端就绪后将返回真实推理结果',
  }
}

export function getMockVisionUpload(fileName) {
  return {
    demo: true,
    filename: fileName || 'upload.jpg',
    mode: 'yolo_world',
    yolo: {
      conf_used: 0.25,
      inference_attempts: 1,
      boxes: [
        { label: 'light', confidence: 0.62, bbox: [40, 60, 180, 120] },
        { label: 'window', confidence: 0.55, bbox: [400, 20, 580, 220] },
      ],
    },
    note: '演示结构：后端就绪后将返回真实检测框与可选分割结果',
  }
}

/** 房间状态 → 展示用 */
export const ROOM_STATUS_META = {
  normal: { label: '正常', type: 'success' },
  occupied: { label: '占用', type: 'warning' },
  warning: { label: '告警', type: 'danger' },
  offline: { label: '离线', type: 'info' },
}
