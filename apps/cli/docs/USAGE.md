# 组件接入

## 核心 API

CLI 通过 `commander` 暴露以下命令，所有命令输出 JSON。

### Provider 命令组

| 命令 | 签名 | 说明 |
|------|------|------|
| `provider list` | `imagen provider list` | 列出所有已注册 provider |
| `provider describe` | `imagen provider describe <providerId>` | 获取单个 provider 描述 |
| `provider config get` | `imagen provider config get <providerId>` | 获取已保存的 provider 配置 |
| `provider config save` | `imagen provider config save <providerId> <configJson>` | 保存 provider 配置 |
| `provider config` | `imagen provider config` | 交互式 provider 配置引导（仅人工使用） |

### Job 命令组

| 命令 | 签名 | 说明 |
|------|------|------|
| `job submit` | `imagen job submit <workflow> <inputJson>` | 提交 job 执行 |
| `job get` | `imagen job get <jobId>` | 查询 job 状态（当前进程） |
| `job retry` | `imagen job retry <jobId>` | 重试失败 job（当前进程） |

## 典型用法

### 场景 1：配置并使用 Provider

```bash
# 查看可用 provider
imagen provider list

# 保存 API Key
imagen provider config save openai-compatible '{"providerId":"openai-compatible","apiKey":"sk-xxx","baseURL":"https://api.openai.com/v1"}'

# 验证配置已保存
imagen provider config get openai-compatible
```

### 场景 2：提交图像生成任务

```bash
# 从 JSON 字符串提交
imagen job submit provider-generate '{"provider":"mock","prompt":"a cat"}'

# 从文件提交（@前缀）
imagen job submit provider-generate @input.json
```

### 场景 3：脚本集成

```bash
#!/bin/bash
# 脚本示例：提交并获取结果
RESULT=$(imagen job submit provider-generate '{"provider":"mock","prompt":"test"}')
JOB_ID=$(echo "$RESULT" | jq -r '.id')
echo "Job completed: $JOB_ID"
```

## 输入格式

所有接受 JSON 输入的命令支持两种格式：

| 格式 | 示例 | 说明 |
|------|------|------|
| JSON 字符串 | `'{"key":"value"}'` | 直接传递 JSON |
| @文件引用 | `@config.json` | 从文件读取 JSON |

## 输出格式

| 场景 | 输出目标 | 格式 | Exit Code |
|------|----------|------|-----------|
| 成功 | stdout | Pretty JSON | 0 |
| 失败 | stderr | `{"error": "<message>"}` | 1 |

## 注意事项

- **Job 状态是进程级的**：`job get` / `job retry` 只能访问当前 CLI 进程内创建的 job，进程退出后历史丢失
- **配置是全局的**：`provider config save` 写入 `~/.imagen-ps/config.json`，所有进程共享
- **交互命令不适合自动化**：`provider config`（无子命令）会进入 readline 交互模式，不适合脚本使用；自动化场景请使用 `provider config save`
