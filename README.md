# 族源 Rootline

族源 Rootline 是一个纯前端、本地优先的数字族谱 MVP。它用人物与独立关系实体保存家族数据，并通过可视化画布展示亲缘关系。

## 当前状态

- 本地 MVP 已完成一轮整体界面重设计：家谱画布、人物档案、独立阅读和手机布局，见 [当前界面](docs/ui-design-reference.md)。
- 人物支持独立的个人简介与人生经历，可在详情页阅读，并随搜索、JSON 和 Excel 备份流转。
- 数据保存在当前浏览器的 IndexedDB，没有账号、后端或云端同步；多窗口写入带修订检查，导入恢复点与替换在同一事务中完成。
- 本轮仅更新本地项目，未执行生产部署。
- 详细能力、已知限制与可选增量见 [功能清单与下一步](docs/功能清单与下一步.md)。

## 本地运行

```bash
npm ci
npm run dev
```

打开 Vite 输出的本地地址。首次运行浏览器验收前，需安装项目锁定版本对应的 Chromium：

```bash
npx playwright install chromium
```

## 验证

```bash
npm run typecheck
npm test
npm run build
npm run test:smoke
npm run test:qa
npm run test:e2e
```

## 数据与隐私

- 人物和关系数据仅存在当前浏览器。清理浏览器数据会同时清除族谱和本地恢复点。
- 录入真实资料后，定期导出 JSON 备份，并存放在项目目录之外。
- 纸质族谱扫描件、真实家族数据、凭据和账号信息不应进入公开代码仓库。

## 项目文档

- [功能清单与下一步](docs/功能清单与下一步.md)
- [UI 设计参考](docs/ui-design-reference.md)
- [架构设计](架构设计.md)
