# D1 自动备份

线上 D1 库 `interview` 的数据只存在 Cloudflare。`scripts/backup.ps1` 用
`wrangler d1 export --remote` 把整库导到 `backups/`，只留最近 14 份，并记录日志。
（R2 还没开通，所以先做本地定时备份；`backups/` 已 gitignore，**里面是用户邮箱等个人信息，不要提交、不要外传**。）

| 项目 | 值 |
|---|---|
| 脚本 | [`scripts/backup.ps1`](backup.ps1) |
| 产物 | `backups/interview-yyyyMMdd-HHmmss.sql` |
| 日志 | `backups/backup.log`（每次运行一行：时间 \| 状态 \| 文件名 \| 大小 \| 耗时 \| 退出码 \| 详情） |
| 保留策略 | 只留最新 **14** 份，更早的自动删除 |
| 退出码 | `0` 成功；`1` 任一步失败（错误摘要写在日志最后一行） |

## 前置条件

1. PowerShell 7+（`pwsh`）。脚本在 Windows PowerShell 5.1 下也能跑，但推荐 7。**注意本机 `pwsh` 不在 PATH**，实际位置是
   `C:\Users\Administrator\AppData\Local\Programs\PowerShell\7\pwsh.exe`（zip 解压版）；用 MSI 装的才是 `C:\Program Files\PowerShell\7\pwsh.exe`
2. Node.js + 仓库里已 `npm install`（wrangler 在 `node_modules`，脚本用 `npx --no-install` 调它，不会临时装包）
3. 已执行过 **`npx wrangler login`**，且**用同一个 Windows 用户**跑备份 —— OAuth 凭据存在 `%USERPROFILE%\.wrangler\config\`，换用户/换 SYSTEM 就读不到

## 手动跑一次

```powershell
cd D:\mowen\files\interview-web
pwsh -File scripts\backup.ps1
```

`pwsh` 不在 PATH 时（本机就是这样），用全路径：

```powershell
& "C:\Users\Administrator\AppData\Local\Programs\PowerShell\7\pwsh.exe" -File scripts\backup.ps1
```

可选参数：`-Keep 30`（改保留份数）、`-OutputDirectory D:\d1-backup`（改目录）、`-Database interview`（改库名）。

跑完确认：

```powershell
Get-ChildItem backups | Sort-Object Name -Descending | Select-Object -First 3 Name, Length, LastWriteTime
Get-Content backups\backup.log -Tail 3
```

**保留策略细节**：只统计文件名匹配 `interview-<yyyyMMdd-HHmmss>.sql` 的自动备份，按名字降序（时间戳定长补零，等价于按时间排序）留下前 14 份，其余删除。手工导出的老文件（例如 `interview-20261106-2251.sql`，时间戳不带秒）不参与计数，也不会被删掉。

## 注册成 Windows 计划任务（每天 12:30）

先确认 `pwsh.exe` 的完整路径（本机是 zip 解压版，不在 PATH 里）：

```powershell
(Get-Command pwsh -ErrorAction SilentlyContinue).Source                   # 有输出 = 已在 PATH
Test-Path "C:\Users\Administrator\AppData\Local\Programs\PowerShell\7\pwsh.exe"
```

在 **PowerShell** 里执行下面这条（`/tr` 里的两个路径按你机器上的实际情况替换；`/st 12:30` 是本地时间，任务名可自改）：

```powershell
schtasks /create /tn "interview-web-D1-backup" /tr '"C:\Users\Administrator\AppData\Local\Programs\PowerShell\7\pwsh.exe" -NoProfile -ExecutionPolicy Bypass -File "D:\mowen\files\interview-web\scripts\backup.ps1"' /sc DAILY /st 12:30 /f
```

在 **cmd.exe** 里跑同一条时，内层引号要写成 `\"`：

```bat
schtasks /create /tn "interview-web-D1-backup" /tr "\"C:\Users\Administrator\AppData\Local\Programs\PowerShell\7\pwsh.exe\" -NoProfile -ExecutionPolicy Bypass -File \"D:\mowen\files\interview-web\scripts\backup.ps1\"" /sc DAILY /st 12:30 /f
```

检查 / 立即试跑（不是必须）：

```powershell
schtasks /query /tn "interview-web-D1-backup" /v /fo LIST
schtasks /run   /tn "interview-web-D1-backup"
```

注意：

- 没带 `/ru`，任务以**当前用户、且仅在该用户登录时**运行；想无人值守开机就跑，得用 `/ru <用户> /rp <密码>`。**不要用 `/ru SYSTEM`**——SYSTEM 读不到你的 wrangler 凭据，导出必然失败。
- 机器关机/休眠错过 12:30 时，计划任务默认**不补跑**（可在任务计划程序里勾「错过计划开始时间后尽快启动」）。
- 任务失败时「上次运行结果」是 `1`，具体原因看 `backups\backup.log` 最后一行。
- 本文档只给命令，**没有实际注册**。

## 从备份恢复

⚠️ **恢复是破坏性操作**：它会把线上库改成备份文件里的样子，没有撤销。只在确认备份内容正确、且真的需要回滚时才做。

先看有哪些备份、挑对文件：

```powershell
Get-ChildItem backups -Filter 'interview-*.sql' | Sort-Object Name -Descending | Select-Object -First 5 Name, Length, LastWriteTime
Get-Content backups\<挑中的文件名>.sql -TotalCount 15   # 大概看一眼表结构
```

恢复前**先给当前状态留一份**（这样恢复错了还有退路）：

```powershell
pwsh -File scripts\backup.ps1     # pwsh 不在 PATH 时用上面的全路径
```

再执行（文件名换成你挑中的那个）：

```powershell
npx wrangler d1 execute interview --remote --file=backups\interview-<时间戳>.sql
```

关于「覆盖」的实际行为，别想当然：

- 导出文件是 `CREATE TABLE` + `INSERT INTO`，**不含 `DROP`**（2026-11-10 的导出实测：6 个 `CREATE TABLE`、197 条 `INSERT`、0 条 `DROP`）。
- 对**已有数据**的库直接执行：`CREATE TABLE` 会因表已存在而报错，主键已存在的 `INSERT` 会失败，而报错前已经执行的语句**可能已经生效**——结果是"只改了一部分"的中间态。
- 要真正回到备份时的状态：要么先清空目标库再导入（例如按表 `DROP TABLE` 后重跑 `wrangler d1 execute`），要么 `npx wrangler d1 create interview-restore` 建个新库、把备份导进去验证无误后再切 `wrangler.toml` 的 `database_id`。
- 恢复完记得抽查：登录、题目总数、`questions` / `users` 行数对得上。

> 本仓库约定：`wrangler d1 execute --remote` 的恢复命令**只写在文档里，不在自动化里执行**。
