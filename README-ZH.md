# **🐘 Alephant MCP Server \- AI 财务运营治理**

**Alephant MCP Server** 是一款以开发者为中心的基础设施工具，旨在将 AI 成本管理直接集成到您的 IDE（如 Cursor）中。通过实现 **Model Context Protocol (MCP)**，它将您的 AI 助手从简单的“代码生成器”转变为具备“财务意识的架构师”。

### **🛠 核心能力**

* **预算护栏**：实时追踪 Token 消耗情况和剩余余额。  
* **身份归因**：将每一笔 AI 请求精准映射到特定智能体（如 Axpha-Trader）或部门。  
* **主动干预**：根据成本策略，通过程序化实现模型降级或请求拦截。  
* **自动化审计**：内置提示词模板，一键生成专业的周报、月报和季报。  
  ---

  ### **🚀 快速入门**

  #### **1\. 安装方式**

本项目通过 NPM 分发，支持使用 npx 无缝集成。

Bash

* npm install \-g @gengbingbing/alephant-mcp


  #### **2\. Cursor 集成步骤**

要在 Cursor 中开启“全栈治理驾驶舱”：

1. 打开 **Cursor 设置** \-\> **功能 (Features)** \-\> **MCP**。  
2. 点击 **\+ Add New MCP Server**。  
3. 填写以下信息：  
   * **名称 (Name)**: Alephant  
   * **类型 (Type)**: command  
   * **命令 (Command)**: npx \-y @gengbingbing/alephant-mcp  
4. 确认状态指示灯变为 **绿色**。  
   ---

   ### **🤖 使用场景**

| 用户意图 | 建议指令 |
| :---- | :---- |
| **检查健康度** | “Alephant，查一下我们现在的预算状态。” |
| **查看智能体** | “显示所有活跃的虚拟密钥及其日限额。” |
| **执行策略** | “如果预算消耗超过 80%，请将 Axpha-Trader 切换到低成本模式。” |
| **生成报告** | “为 Axpha-Main 工作区生成一份每周成本审计报告。” |

   ---

   ### **📅 定时任务与主动汇报**

Alephant 支持“任务控制中心”风格的主动推送功能。

* **AI 调度**：直接对 AI 说：*“帮我安排一个计划任务：每周一早 9 点执行一次 Alephant 审计。”*  
* **本地 Cron**：在您的 crontab 中添加：0 9 \* \* 1 npx @gengbingbing/alephant-mcp \--audit \>\> ./AUDIT.md。  
  ---

**由 Alephant 核心团队开发 | 基于 2026 AI 治理标准**