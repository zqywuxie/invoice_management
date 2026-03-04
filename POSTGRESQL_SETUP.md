# PostgreSQL 使用说明（当前项目）

本文档记录当前项目 `invoice-management` 的 PostgreSQL 相关配置、密码、启动方式和日常使用命令。

## 1. 当前实际配置

基于当前 `.env` 和 `docker-compose.yml`：

- PostgreSQL 容器名：`invoice-postgres`
- PostgreSQL 镜像：`postgres:16-alpine`
- 主机端口：`5432`
- 数据库名：`invoice_db`
- 用户名：`invoice_user`
- 密码：`invoice_password`
- Web 服务端口：`5001`

对应连接串（项目内）：

```text
postgresql://invoice_user:invoice_password@db:5432/invoice_db
```

对应连接串（本机工具连接）：

```text
postgresql://invoice_user:invoice_password@127.0.0.1:5432/invoice_db
```

## 2. 启动与停止

在项目根目录执行：

```powershell
# 启动 PostgreSQL + Web
docker compose up -d

# 仅启动 PostgreSQL
docker compose up -d db

# 查看状态
docker compose ps

# 停止并保留数据卷
docker compose down
```

## 3. 访问项目

- 项目入口：`http://127.0.0.1:5001`
- 健康检查：`http://127.0.0.1:5001/healthz`

说明：当前机器 `5000` 端口有其他服务占用，所以本项目映射为 `5001`。

## 4. 连接 PostgreSQL

### 4.1 用 psql（容器内）

```powershell
docker exec -it invoice-postgres psql -U invoice_user -d invoice_db
```

### 4.2 用 DBeaver / Navicat / DataGrip（本机）

- Host：`127.0.0.1`
- Port：`5432`
- Database：`invoice_db`
- Username：`invoice_user`
- Password：`invoice_password`

## 5. 常用 SQL

```sql
-- 查看当前连接身份
SELECT current_database(), current_user, now();

-- 查看表
\dt

-- 查看发票数量
SELECT COUNT(*) FROM invoices;
```

## 6. 数据迁移（SQLite -> PostgreSQL）

项目已提供迁移脚本：

```powershell
docker compose run --rm web python scripts/migrate_sqlite_to_postgres.py `
  --sqlite-path data/invoices.db `
  --postgres-url "postgresql://invoice_user:invoice_password@db:5432/invoice_db"
```

默认行为：

- 会先清空目标 PostgreSQL 表（truncate）再导入。

保留目标库现有数据并跳过冲突：

```powershell
docker compose run --rm web python scripts/migrate_sqlite_to_postgres.py `
  --sqlite-path data/invoices.db `
  --postgres-url "postgresql://invoice_user:invoice_password@db:5432/invoice_db" `
  --no-truncate
```

## 7. 日常运维命令

```powershell
# 查看 PostgreSQL 日志
docker compose logs -f db

# 查看 Web 日志
docker compose logs -f web

# 进入 PostgreSQL 容器
docker exec -it invoice-postgres sh
```

## 8. 修改 PostgreSQL 密码

### 8.1 修改 `.env`

编辑：

```env
POSTGRES_PASSWORD=你的新密码
```

### 8.2 若数据库已初始化（已有数据卷），还需在库内改密码

```powershell
docker exec -it invoice-postgres psql -U invoice_user -d invoice_db -c "ALTER USER invoice_user WITH PASSWORD '你的新密码';"
```

### 8.3 重启服务

```powershell
docker compose up -d
```

## 9. 安全建议

- 当前密码 `invoice_password` 仅适合开发环境。
- 上线前务必改成强密码，并妥善保存 `.env`。
- 不要把真实生产密码提交到 Git 仓库。

