# syntax=docker/dockerfile:1.7
# 说明：用 pip 按 pyproject 安装，避免 poetry install 在 CI 中长解析/内存峰值导致失败
# 构建时可通过 --build-arg 覆盖（国内访问 Docker Hub 超时时改用镜像站，见 infra/.env.example）
ARG PYTHON_BASE_IMAGE=python:3.10-bookworm
FROM ${PYTHON_BASE_IMAGE}
LABEL maintainer=Langchain-Chatchat
WORKDIR /root

ENV CHATCHAT_ROOT=/root/chatchat_data \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DEFAULT_TIMEOUT=300

# 可选：为 pip 配置镜像源（解决构建期拉取依赖卡住/超时）
# 通过 docker build --build-arg 传入，或由 docker-compose.ai.yml 注入
ARG PIP_INDEX_URL=
ARG PIP_EXTRA_INDEX_URL=
ARG PIP_TRUSTED_HOST=

# 可选：Debian apt 镜像源（为空则用默认 deb.debian.org）
# 示例：APT_MIRROR=mirrors.tuna.tsinghua.edu.cn
ARG APT_MIRROR=

RUN ln -sf /usr/share/zoneinfo/Asia/Shanghai /etc/localtime && \
    echo "Asia/Shanghai" > /etc/timezone

RUN if [ -n "$APT_MIRROR" ]; then \
      if [ -f /etc/apt/sources.list ]; then \
        sed -i "s|deb.debian.org|$APT_MIRROR|g; s|security.debian.org|$APT_MIRROR|g" /etc/apt/sources.list; \
      fi; \
      if [ -f /etc/apt/sources.list.d/debian.sources ]; then \
        sed -i "s|deb.debian.org|$APT_MIRROR|g; s|security.debian.org|$APT_MIRROR|g" /etc/apt/sources.list.d/debian.sources; \
      fi; \
    fi

RUN apt-get update -y && \
    apt-get install -y --no-install-recommends \
      git curl \
      build-essential pkg-config \
      python3-dev libffi-dev libssl-dev \
      libxml2-dev libxslt1-dev zlib1g-dev \
      libjpeg62-turbo-dev libpng-dev \
      libgl1 libglib2.0-0 \
    && apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# 使用当前仓库里的源码（与 CI 一致），不在镜像内 git clone
COPY libs/chatchat-server /root/Langchain-Chatchat/libs/chatchat-server
WORKDIR /root/Langchain-Chatchat/libs/chatchat-server

# 构建后端里去掉 pypi-mirror 插件，减少构建期拉取/兼容问题
RUN python3 <<'PY'
from pathlib import Path
p = Path("pyproject.toml")
text = p.read_text(encoding="utf-8")
text = text.replace(', "poetry-plugin-pypi-mirror==0.4.2"', "")
text = text.replace('"poetry-plugin-pypi-mirror==0.4.2", ', "")
p.write_text(text, encoding="utf-8")
PY

# 去掉清华源（CI 访问可能不稳定）
RUN sed -i '/# https:\/\/python-poetry.org\/docs\/repositories\//,/^priority = "primary"$/d' pyproject.toml

RUN if [ -n "$PIP_INDEX_URL" ]; then pip config set global.index-url "$PIP_INDEX_URL"; fi && \
    if [ -n "$PIP_EXTRA_INDEX_URL" ]; then pip config set global.extra-index-url "$PIP_EXTRA_INDEX_URL"; fi && \
    if [ -n "$PIP_TRUSTED_HOST" ]; then pip config set global.trusted-host "$PIP_TRUSTED_HOST"; fi

RUN --mount=type=cache,target=/root/.cache/pip \
    pip install -v --progress-bar on --retries 20 --timeout 30 --upgrade pip setuptools wheel && \
    pip install -v --progress-bar on --retries 20 --timeout 30 "poetry-core>=1.0.0"

# 安装本项目 + xinference 可选依赖（与 poetry -E xinference 对齐）
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install -v --progress-bar on --retries 20 --timeout 30 ".[xinference]"

ENV PYTHONPATH="/root/Langchain-Chatchat/libs/chatchat-server"

WORKDIR /root/Langchain-Chatchat/libs/chatchat-server/chatchat
RUN python cli.py init

ADD docker/data.tar.gz ${CHATCHAT_ROOT}/
ADD docker/AI_DEPLOY_API_GUIDE.md /root/AI_DEPLOY_API_GUIDE.md

EXPOSE 7861 8501
ENTRYPOINT ["python", "cli.py", "start", "-a"]
