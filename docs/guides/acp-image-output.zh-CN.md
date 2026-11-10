# ACP 图片输出展示

AionUi 按需读取 ACP 工具路径、Codex 工具消息图片和异步生图附件。三类结果共用预览、下载和错误提示。

## 数据约定

对通过 ACP 上报的 Codex 图片结果，后端会清理大型 `raw_output.result` base64 并保留图片路径等小型字段。

- `rawOutput.image.path` 或 `raw_output.image.path`：生成图片的本地路径
- `rawOutput.saved_path` 或 `raw_output.saved_path`：兼容 Codex 当前返回结构的本地路径
- `rawOutput.result_omitted`：表示原始图片 base64 已被省略
- `rawOutput.result_bytes`：被省略内容的原始字节长度

## 渲染流程

图片在进入展示组件前按来源区分，并沿用各自的访问接口。

- ACP 本地图片优先使用 `image.path`，兼容旧消息中的 `saved_path`。预览通过 `/api/fs/image-base64` 读取，会话工作区用于解析相对路径和校验范围。下载沿用文件接口的原有允许目录。
- Codex 工具图片通过 `/api/conversations/{conversationId}/messages/{messageId}/image` 读取。引用使用工具消息所属会话和工具调用 ID，路径只用于提取文件名。
- 异步生图完成后，通过 `/api/conversations/{conversationId}/async-images/{attachmentId}` 读取。引用使用原消息所属会话和结果附件 ID。

Codex 和异步任务各自显示在独立卡片中，普通 ACP 图片显示在展开的 `View Steps` 中。三类图片都由 `ToolImagePreview` 提供预览和下载。会话图片读取失败时直接显示不可用提示。异步任务的排队、执行及失败原因由原卡片展示。

## 前端兜底

后端是主要清洗边界。前端在 `mergeAcpToolCallContent` 和消息列表快速合并路径中
保留兜底清洗：如果收到包含 `saved_path` 且超出阈值的 `result` 字符串，会移除
`result` 并补齐 `image.path`、`result_omitted` 和 `result_bytes`。

## 测试覆盖

相关单测位于 `tests/unit/chat/`：

- `acpToolCallOutput.test.ts` 覆盖图片路径提取、文件名生成和 base64 清洗。
- `messageHooks.dom.test.tsx` 覆盖空列表、非空列表和 `add=true` 路径下的 ACP 图片消息清洗。
- `MessageAcpToolCall.dom.test.tsx` 与 `MessageToolGroupSummary.dom.test.tsx` 覆盖三种来源的预览、下载分流和失败提示。

`tests/unit/conversation/localImageViewContextRoot.dom.test.tsx` 验证会话图片读取失败时直接提示不可用、切换图片时丢弃过期结果、释放 Blob URL，以及 Markdown 图片的工作区路径解析。

## 接入异步生图 MCP

在 Aion 的「设置 → 工具 → MCP」导入 Streamable HTTP 配置，并将用途设为「异步生图」。也可以直接导入包含用途的 JSON。

```json
{
  "mcpServers": {
    "example-image": {
      "type": "streamable_http",
      "url": "http://127.0.0.1:8790/mcp/example",
      "headers": { "Authorization": "Bearer replace-with-mcp-token" },
      "purpose": "async_image",
      "backend_alias": "example-fast"
    }
  }
}
```

上例是独立子项目 `aion-openai-image-mcp` 的一个 profile。用该项目的 `uv` 管理入口启动服务，填入 profile 的 MCP 地址和访问令牌。供应商 API Key 由子项目配置。其他兼容的 MCP 服务可使用各自的地址和认证配置。

导入只添加或更新连接，旧 JSON 中的 `is_default` 不会更改账号默认值。在「设置 → 工具 → MCP」的「默认生图后端」单独设置，候选项仅包含已启用的异步生图 MCP。

`backend_alias` 是可选的生图后端别名，可在 JSON 导入时填写，也可在 MCP 编辑窗口修改。别名会转成小写，长度为 1–32 个字符，由英文字母、数字及分隔它们的单个连字符组成。同一账号下的生图后端别名不能重复，也不能和其他后端用作选择项的原名称冲突。更新时省略 `backend_alias` 会保留已有别名，设为 `null` 会清除。没有别名的旧配置继续用原名称供模型选择。

导入并启用后，可在原生 Aion 的新会话和现有会话输入区选择生图后端，或选择「使用全局默认」。聊天中也可以点名后端，只覆盖该次任务。会话里的 MCP 工具菜单继续管理通用工具。服务可以同时提供异步生图和通用工具。

Aion 向模型提供 `image_generate_async`。工具先返回任务回执和供后续编辑使用的附件引用。后台完成后更新原会话中的独立图片卡片，预览和下载都需要原会话的访问权限。分叉时会复制普通历史消息，异步任务、图片卡和附件留在原会话。子会话从全局默认开始，可以选择自己的后端并提交任务。

### 后端接入约定

一个 MCP 进程可以提供多个 profile 入口，也可以把实现拆到不同机器上的独立 MCP 服务。模型的 `backend` 参数仅列出当前助手允许的后端别名或原名称。点名时，Aion 将其解析为原服务 ID，再校验白名单。省略时优先使用会话保存的后端，再用当前账号的全局默认后端。会话选择和全局默认均保存服务 ID。参考图只作为编辑输入。指定的后端不可用，或者全局默认未设置时，需要重新选择。

`image_jobs_v1` 通过 MCP Streamable HTTP 提供以下三个工具。

| 工具           | 请求                                                                     | 回执                                                                                                 |
| -------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `image_submit` | `request_id`、`prompt`，可选 `size`、`preset`、按顺序排列的 PNG `images` | `structuredContent` 中返回同一 UUID 作为 `task_id` 和当前 `state`。相同 UUID 和参数须返回同一任务。  |
| `image_status` | `task_id`                                                                | `structuredContent` 中返回 `task_id`、`state`，失败时可带 `error_code`。                             |
| `image_result` | `task_id`                                                                | `structuredContent` 中返回 `task_id`、`width`、`height`、`sha256`，同时返回一个 `image/png` 内容块。 |

参考图以有序 base64 PNG 字符串传入。任务应能用同一 UUID 跨 MCP 连接查询，以便 Aion 重启后继续查图。

### 部署验收

目标生图服务启动并确认健康后，在 Aion 导入 MCP 地址并测试连接，再用合成提示词验收。

1. 在会话 A 提交一张图片，收到排队卡片后切换到会话 B。完成后返回 A，确认图片和下载都可用，B 没有收到卡片。
2. 在任务排队后重启 Aion 服务。确认 Aion 恢复查询，并将结果写回原任务卡片。
3. 保持原会话打开，在任务完成前断开 WebSocket。等任务完成后恢复连接，确认图片无需刷新即可显示。同一任务重复读取仍应只有一张卡片。用回执里的附件引用发起编辑，确认可以引用原图。
4. 如果有第二个可用的异步生图服务，再验证会话选择、单次点名和全局默认。切换后端后引用原图，确认请求仍发给当前选中的后端。
5. 删除该生图服务后，在仍打开的原会话和重新打开的旧会话中发起新一轮对话。确认已删除的连接不会继续使用，底层 MCP 生图工具不会暴露给模型。
6. 从包含图片卡的历史节点分叉。确认子会话保留普通消息，原图仍可在原会话预览和下载，子会话不显示失效的图片卡。
