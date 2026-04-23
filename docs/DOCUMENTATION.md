# DOCUMENTATION.md

## Purpose
定义最小文档规范，用于：
- 提高可读性（中文语义）
- 保持技术准确性（English 术语）
- 优化 Agent 检索能力

---

# 1. Language

- 文档使用中文
- 类型名、函数名、接口名、API、配置键等保持 English
- 不要翻译技术术语
- 可使用：中文说明（English Term）

---

# 2. Function Docstring

## When to Write
建议用于：

- 核心逻辑函数
- 数据转换函数
- orchestration / pipeline
- 有副作用或失败语义的函数

简单函数不需要写。

---

## Format

```py
"""Short English summary.

INTENT: 中文说明函数做什么。
INPUT: 关键输入的语义说明。
OUTPUT: 返回结果的含义。
SIDE EFFECT: None 或具体副作用。
FAILURE: 失败时的行为（抛错 / 默认值 / 忽略）。
"""