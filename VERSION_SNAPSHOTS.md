# 茶文化智能体版本快照

本文件记录代码和设计画布的可回滚节点。GitHub 远程仓库配置完成后，每条记录应对应一个已推送 commit。

| 快照编号 | 类型 | 内容 | 验证 | Git 状态 |
|---|---|---|---|---|
| SNAP-20260910-001 | full | 茶序 React 交互原型、接口契约、Figma 基础设计状态、画布切换规则与浏览器验收截图 | `npm run build` 通过；验收记录已生成 | 已推送至 GitHub `main` |
| SNAP-20260910-002 | docs | 新增仓库总览 README，并将每次更新 README 写入项目快照规则 | Markdown 差异检查 | 已推送至 GitHub `main` |
| SNAP-20260910-003 | docs | 记录 GitHub 目标仓库并完成首次远程上传 | 远程 `main` 已核对至 `43a045f` | 已推送至 GitHub `main` |
| SNAP-20260910-004 | docs | 同步 README 与快照记录的远程状态 | Markdown 差异检查 | 随本次提交推送至 GitHub `main` |
| SNAP-20260910-005 | full | Figma 新增 8 个桌面端与 3 个移动端页面捕获；Penpot 新建 7 页备用画布；补充画布捕获路由、令牌、组件和流程参考资产 | `npm run build`；Figma 11 个节点生成完成；Penpot 页面清单与可见性检查 | 随本次提交推送至 GitHub `main` |
| SNAP-20260910-006 | code | 修正用户端主导航活动指示条居中；将茶品批次原生下拉框替换为符合茶序视觉语言的自定义选择菜单 | `npm run build`；浏览器检查 1440px 展开样式；成功切换至 `longjing-2025` | 随本次提交推送至 GitHub `main` |
| SNAP-20260910-007 | code | 后台拆分四套职能平台；合并内容与导入；草稿置顶；审核通过自动发布；管理员可在商品列表直接下架或删除；同步接口契约 | `npm run build`；浏览器检查四角色导航、内容与导入、审核待办、自动发布入口、下架与删除确认弹窗；控制台无 error/warn | 随本次提交推送至 GitHub `main` |
| SNAP-20260910-008 | code | 补齐数据运营下架权限；数据运营与项目管理员按商品状态互斥显示下架/重新上架；重新上架免复审并校验来源有效性；同步 README、验收记录和接口契约 | `npm run build`；浏览器检查数据运营下架入口、两角色商品状态操作及确认弹窗；接口编号与状态迁移复核 | 随本次提交推送至 GitHub `main` |

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
