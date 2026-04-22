/**
 * k6 压测脚本 — 建筑能源 API
 * 安装: https://grafana.com/docs/k6/latest/set-up/install-k6/
 * 运行（后端已启动在 8765）:
 *   k6 run -e BASE_URL=http://127.0.0.1:8765 k6_building_api.js
 *
 * 可调环境变量: VUS（默认30） DURATION（默认5m）
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { Rate } from "k6/metrics";

const failRate = new Rate("failed_requests");

export const options = {
  stages: [
    { duration: "30s", target: Number(__ENV.VUS || 30) },
    { duration: __ENV.DURATION || "5m", target: Number(__ENV.VUS || 30) },
    { duration: "30s", target: 0 },
  ],
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<2000"],
  },
};

const BASE = __ENV.BASE_URL || "http://127.0.0.1:8765";

export default function () {
  const paths = [
    "/health",
    "/api/stats/period",
    "/api/energy/buildings",
    "/api/energy/records?limit=20",
    "/api/kb/search?q=%E8%8A%82%E8%83%BD",
  ];
  const path = paths[Math.floor(Math.random() * paths.length)];
  const res = http.get(`${BASE}${path}`);
  const ok = check(res, {
    "status 2xx": (r) => r.status >= 200 && r.status < 300,
  });
  failRate.add(!ok);
  sleep(0.05);
}
