"""
Locust 压测：建筑能源 API（默认基址 --host http://127.0.0.1:8765）。
启动后端后：locust -f locustfile.py --host http://127.0.0.1:8765
无头示例：locust -f locustfile.py --headless -u 50 -r 10 -t 5m --host http://127.0.0.1:8765
"""
from __future__ import annotations

from locust import HttpUser, between, task


class BuildingApiUser(HttpUser):
    wait_time = between(0.02, 0.08)

    @task(4)
    def health(self) -> None:
        self.client.get("/health", name="GET /health")

    @task(3)
    def stats_period(self) -> None:
        self.client.get("/api/stats/period", name="GET /api/stats/period")

    @task(2)
    def energy_buildings(self) -> None:
        self.client.get("/api/energy/buildings", name="GET /api/energy/buildings")

    @task(2)
    def energy_records(self) -> None:
        self.client.get("/api/energy/records?limit=20", name="GET /api/energy/records")

    @task(1)
    def kb_search(self) -> None:
        self.client.get("/api/kb/search?q=节能", name="GET /api/kb/search")
