# 附中云平台部署结构

当前正式平台目录是：

```text
gpu.ai-galaxy.cn/
├── serve_proxy.py                  # 正式网页/代理后端，默认 8060
├── store.html / local-login.html   # 正式网页入口和本地登录页
├── assets/                         # 前端静态资源和注入脚本
├── database/                       # MySQL 表结构和数据库说明
├── data/                           # JSON 本地演示数据，MySQL 后可不用
├── services/starlight_mini_test/   # 算力提交后端，默认 8030
├── scripts/start-web.sh            # 启动正式网页服务
└── scripts/start-starlight-backend.sh # 启动算力提交后端
```

这样以后部署时，前端、后端、数据库初始化文件都在同一个主目录下。

## 本地启动

如果要使用本地 MySQL，先启动数据库：

```bash
./scripts/start-mysql.sh
```

先启动算力提交后端：

```bash
./scripts/start-starlight-backend.sh
```

再启动正式网页：

```bash
./scripts/start-web.sh
```

访问：

```text
http://127.0.0.1:8060/store
```

## 切换到 MySQL

先安装 Python 依赖：

```bash
pip install -r requirements.txt
```

创建数据库并导入表结构：

```bash
mysql -uroot -p -e "CREATE DATABASE IF NOT EXISTS chuanxinyun CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -uroot -p chuanxinyun < database/schema.sql
```

启动正式网页时设置：

```bash
export DB_BACKEND=mysql
export MYSQL_HOST=127.0.0.1
export MYSQL_PORT=3306
export MYSQL_USER=chuanxinyun
export MYSQL_PASSWORD="$(cat data/mysql-app-password.txt)"
export MYSQL_DATABASE=chuanxinyun
./scripts/start-web.sh
```

不设置 `DB_BACKEND=mysql` 时，仍然使用 `data/local-auth.json`。

## 上线时

第一版可以放在同一台云服务器：

```text
Nginx
正式网页服务 8060
算力提交后端 8030
MySQL
```

后续如果数据库单独迁到云数据库，只需要改 `MYSQL_HOST` 等环境变量。
