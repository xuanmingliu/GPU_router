# 附中云本地 MySQL 数据库

这些文件放在正式平台目录内，方便以后整体部署。

## 当前目录

- `schema.sql`：MySQL 初始化表结构。
- `../.env.mysql.example`：后端连接 MySQL 的环境变量模板。
- `../requirements.txt`：Python 后端需要的 MySQL 驱动。

## 本机 MySQL 初始化

当前项目支持两种 MySQL 启动方式。

### 方式 A：项目目录内自带数据目录

适合当前这种不能正常安装 systemd MySQL 服务的环境。

```bash
./scripts/start-mysql.sh
```

然后创建数据库和导入表结构：

```bash
mysql --protocol=socket --socket="$PWD/mysql-run/mysql.sock" -uroot -e "CREATE DATABASE IF NOT EXISTS chuanxinyun CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql --protocol=socket --socket="$PWD/mysql-run/mysql.sock" -uroot chuanxinyun < database/schema.sql
```

如果已经创建了平台专用用户，启动后端时使用：

```bash
export DB_BACKEND=mysql
export MYSQL_HOST=127.0.0.1
export MYSQL_PORT=3306
export MYSQL_USER=chuanxinyun
export MYSQL_PASSWORD="$(cat data/mysql-app-password.txt)"
export MYSQL_DATABASE=chuanxinyun
./scripts/start-web.sh
```

停止本地 MySQL：

```bash
./scripts/stop-mysql.sh
```

### 方式 B：系统 MySQL 服务

适合普通云服务器。

```bash
mysql -uroot -p -e "CREATE DATABASE IF NOT EXISTS chuanxinyun CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -uroot -p chuanxinyun < database/schema.sql
```

## 启动后端时切到 MySQL

```bash
export DB_BACKEND=mysql
export MYSQL_HOST=127.0.0.1
export MYSQL_PORT=3306
export MYSQL_USER=root
export MYSQL_PASSWORD='你的MySQL密码'
export MYSQL_DATABASE=chuanxinyun
PORT=8060 python3 serve_proxy.py
```

默认不设置 `DB_BACKEND=mysql` 时，系统仍然使用 `data/local-auth.json`，不影响当前本地演示。

## 后续部署

上线到云服务器后，只需要把这些环境变量改成云数据库地址：

```bash
MYSQL_HOST=云数据库地址
MYSQL_USER=云数据库用户名
MYSQL_PASSWORD=云数据库密码
MYSQL_DATABASE=chuanxinyun
```
