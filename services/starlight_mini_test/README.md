# 星光作业提交 Mini Test

这个目录用于验证：

```text
我们的前端表单
-> 我们自己的后端
-> Playwright 自动打开星光页面
-> 尝试把作业名称、镜像、集群、分区、套餐、脚本填到星光页面
```

默认是 `dry-run`，不会点击最终提交按钮。

当前已按 `pytorch-ngc-job` 页面真实结构做过适配：

- 作业名称：`input[name="jobname"]`
- 镜像选择：`input[placeholder="缺省：选择应用默认镜像"]`
- 集群/分区/套餐：按页面里的 radio `value` 点击
- 提交按钮：默认不点击，除非显式开启真实提交

## 安装

```bash
npm install
npx playwright install chromium
```

## 保存星光登录态

如果服务器有可视化浏览器环境：

```bash
npm run auth
```

在打开的浏览器里手动登录星光，确认能看到 `pytorch-ngc-job` 表单后，回到终端按 Enter。登录态会保存到：

```text
auth/starlight-state.json
```

如果服务器没有可视化环境，可以先抓包或从可控浏览器环境导出 cookie，再转换成 Playwright `storageState`。

## 导入已登录 cookie

不要把 cookie 粘到公开聊天或仓库里。把已登录星光的 cookie 保存成服务器本地文件，例如：

```text
/gpfs/users/liujinxiu/research/starlight_cookie.txt
```

支持两种格式。

第一种，浏览器复制出来的一整行 Cookie header：

```text
Cookie: name1=value1; name2=value2
```

第二种，cookie JSON 数组：

```json
[
  { "name": "name1", "value": "value1", "domain": ".starlight.nscc-gz.cn", "path": "/" }
]
```

导入：

```bash
npm run import-cookies -- /gpfs/users/liujinxiu/research/starlight_cookie.txt
```

导入后会生成：

```text
auth/starlight-state.json
```

## 启动

```bash
PORT=8030 npm run serve
```

打开：

```text
http://127.0.0.1:8030
```

## 真实提交保护

默认不会真实提交。即使前端选择 `real`，后端也不会提交。

只有这样启动才允许点击提交按钮：

```bash
ALLOW_REAL_SUBMIT=1 PORT=8030 npm run serve
```

正式接入前不要打开这个开关。
