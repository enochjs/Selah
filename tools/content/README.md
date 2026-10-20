# 内容工具

此目录只处理离线导入、声学对齐与审计；运行中的 App 和 Server 不依赖 Python。经文、录音索引和词典发布到 `packages/content/data/`；媒体、缓存、检查点、审计和旧对齐数据写入 `storage/`。

在仓库根目录运行：

```bash
uv venv --python 3.11 tools/content/.venv
uv pip install --python tools/content/.venv/bin/python -r tools/content/requirements-resources.txt
npm run resources:import
npm run check:content
npm run test:resources
```

提供方导入可传 `-- --locale en` 或 `-- --locale zh`，两份完整检查点齐备才发布。下载支持缓存续跑，默认资源无需API Key。旧对齐工具不能覆盖当前提供方资源集。

旧声学环境及命令：

```bash
uv venv --python 3.11 tools/content/.venv-align
uv pip install --python tools/content/.venv-align/bin/python -r tools/content/requirements-alignment.txt
npm run resources:align
npm run alignment:test
npm run alignment:audit
npm run alignment:publish
```

旧资源源目录通过 `apps/server/.env.local` 的 BIBLE_RESOURCE_ROOT 配置，仅供旧工具和归档录音使用。已有虚拟环境启动器已同步到新目录；如果移动到其他机器，应按上述命令重建虚拟环境。测试位于本目录的 `tests/`。
