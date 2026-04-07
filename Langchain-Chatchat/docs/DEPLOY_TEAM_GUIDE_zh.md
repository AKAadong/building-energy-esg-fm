# Langchain-Chatchat 部署与使用说明（组员版）

本文说明如何在**自己的电脑或服务器**上拉取镜像、启动服务，并通过 **Web 界面**与 **HTTP API** 使用本项目。  
代码仓库：`https://github.com/AKAadong/building-energy-esg-fm`（分支 **`dev-ai`**）。

---

## 一、你需要准备什么

| 项目 | 说明 |
|------|------|
| 操作系统 | Windows 10/11（推荐装 Docker Desktop）、或 Linux（已装 Docker / Docker Compose） |
| Docker | **Docker 20+**，并确保 `docker compose` 可用（`docker compose version`） |
| 网络 | 能访问 GitHub；首次拉 **GHCR 镜像** 需能访问 `ghcr.io` |
| GPU（可选） | 若在本机跑 **Xinference 大模型**，需要 NVIDIA 显卡 + 对应驱动；仅连接远端推理服务时可不要 GPU |
| 账号权限 | 若组织将 GHCR 包设为**私有**，需要 GitHub 账号及 **有 `read:packages` 权限的 PAT** |

---

## 二、镜像在哪里（GHCR）

构建成功后，镜像发布在 **GitHub Container Registry**，命名一般为：

```text
ghcr.io/akaadong/langchain-chatchat:<标签>
ghcr.io/akaadong/langchain-chatchat:latest
```

- **`<标签>`**：在仓库 **Actions → docker-build** 的成功运行日志里搜索 `ghcr.io`，可复制完整标签。  
- **`latest`**：通常对应该分支最近一次成功构建。

在网页确认：仓库主页右侧 **Packages**，或：  
`https://github.com/orgs/AKAadong/packages`（以实际组织/用户名为准）。

---

## 三、第一次使用：登录 GHCR（私有包必做）

在终端执行：

```bash
docker login ghcr.io
```

- **Username**：你的 GitHub 用户名  
- **Password**：**Personal Access Token（PAT）**，不是登录密码  
  - 在 GitHub：**Settings → Developer settings → Personal access tokens** 创建  
  - 至少勾选：**`read:packages`**（只拉镜像）；若要推送再勾 `write:packages`

公开（Public）的 Package 有时也可直接 `docker pull`，若失败再登录。

---

## 四、拉取镜像

```bash
docker pull ghcr.io/akaadong/langchain-chatchat:latest
```

若要固定版本，把 `latest` 换成 Actions 日志里的具体标签。

---

## 五、推荐：用 Docker Compose 一键启动（含 Xinference + Chatchat）

### 1）克隆仓库并切分支

```bash
git clone https://github.com/AKAadong/building-energy-esg-fm.git
cd building-energy-esg-fm
git checkout dev-ai
```

### 2）修改 GHCR 示例 Compose 中的镜像名

编辑 **`docker/docker-compose.ghcr.yaml`**，把 `chatchat` 服务的 `image` 改成实际地址，例如：

```yaml
image: ghcr.io/akaadong/langchain-chatchat:latest
```

（不要保留占位符 `your-org-or-user`。）

### 3）启动

在项目根目录执行：

```bash
docker compose -f docker/docker-compose.ghcr.yaml up -d
```

该文件使用 **`network_mode: host`**（Linux 常见）。**Windows / macOS 上 Docker Desktop 对 host 网络支持有限**，若启动失败，请改用仓库中的 **`docker/docker-compose.yaml`**，按注释打开 `ports` 映射，或只在 **Linux 服务器**上使用 `docker-compose.ghcr.yaml`。

### 4）端口说明（默认 Chatchat / Xinference）

使用 **host 网络** 时，服务监听本机端口：

| 服务 | 端口 | 说明 |
|------|------|------|
| Chatchat API | **7861** | OpenAPI：`http://<本机IP>:7861/docs` |
| Chatchat WebUI | **8501** | 浏览器：`http://<本机IP>:8501` |
| Xinference | **9997** | 模型管理 Web UI / API |

将 `<本机IP>` 换成本机局域网 IP 或 `127.0.0.1`（本机访问）。

---

## 六、启动后必做：在 Xinference 里启动模型

Chatchat 依赖 **推理服务** 与 **向量模型**（Embedding），需要在 Xinference 中至少各启动一个（与你们在 `model_settings.yaml` / Web 里配置的名称一致）。

1. 浏览器打开：`http://<服务器IP>:9997`  
2. 在界面中启动例如：**Embedding**（如 `bge-small-zh-v1.5`）和 **LLM**（按机器显存选择量化/小模型）  
3. 回到 Chatchat WebUI：**知识库管理** 中选择对应 Embedding；对话里选择对应 LLM  

若出现「连接被拒绝 / 503」，多半是模型未启动或端口不一致。

---

## 七、镜像内说明文档（可选）

本镜像构建时已包含简要说明文件，进入容器后可查看：

```bash
docker exec -it <chatchat容器名> cat /root/AI_DEPLOY_API_GUIDE.md
```

容器名可用 `docker ps` 查看。

---

## 八、API 与对接开发

- **Swagger**：`http://<IP>:7861/docs`  
- 更完整的接口说明与示例见仓库：  
  - `docs/api/README_api.md`  
  - Python 示例：`examples/python/chatchat_api_quickstart.py`  

调用前请确认本机已设置与 Web 一致的 **`CHATCHAT_API_BASE`**（例如 `http://127.0.0.1:7861`）。

---

## 九、常见问题

**1）`docker pull` 报 401 / denied**  
→ 先 `docker login ghcr.io`，并确认 PAT 有 `read:packages`，且对该组织/仓库有权限。

**2）Windows 上 compose 起不来 / 网络异常**  
→ 优先在 **Linux 服务器**上按本文部署；或在 `docker-compose.yaml` 中使用 **端口映射** 而非 `host`。

**3）知识库上传 PDF 很慢**  
→ 大文件会向量化，属正常现象；可缩小单文件体积或调低并发。

**4）想更新镜像**  
→ 拉最新代码后重新构建的镜像会推到 GHCR，执行：  
`docker pull ghcr.io/akaadong/langchain-chatchat:latest`  
再 `docker compose up -d` 重启服务。

---

## 十、获取帮助

- 仓库 Issues：`https://github.com/AKAadong/building-energy-esg-fm/issues`  
- 上游项目：`https://github.com/chatchat-space/Langchain-Chatchat`  

---

*文档随 `dev-ai` 分支更新；镜像标签以 GitHub Actions 成功日志为准。*
