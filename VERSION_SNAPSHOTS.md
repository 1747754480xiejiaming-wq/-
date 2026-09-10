# 茶文化智能体版本快照

本文件记录代码和设计画布的可回滚节点。GitHub 远程仓库配置完成后，每条记录应对应一个已推送 commit。

| 快照编号 | 类型 | 内容 | 验证 | Git 状态 |
|---|---|---|---|---|
| SNAP-20260910-001 | full | 茶序 React 交互原型、接口契约、Figma 基础设计状态、画布切换规则与浏览器验收截图 | `npm run build` 通过；验收记录已生成 | 已推送至 GitHub `main` |
| SNAP-20260910-002 | docs | 新增仓库总览 README，并将每次更新 README 写入项目快照规则 | Markdown 差异检查 | 已推送至 GitHub `main` |
| SNAP-20260910-003 | docs | 记录 GitHub 目标仓库并完成首次远程上传 | 远程 `main` 已核对至 `43a045f` | 已推送至 GitHub `main` |
| SNAP-20260910-004 | docs | 同步 README 与快照记录的远程状态 | Markdown 差异检查 | 随本次提交推送至 GitHub `main` |

## 回滚方法

查看版本：

```powershell
git log --oneline --decorate
```

从某个快照建立恢复分支：

```powershell
git switch -c restore/<名称> <commit-sha>
```

不要直接覆盖当前工作分支；先从目标 commit 建恢复分支并检查页面和画布清单。
