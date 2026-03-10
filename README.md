## **📄 Module 1: English Version (README.en.md)**

# **🐘 Alephant MCP Server \- AI FinOps Governance**

The **Alephant MCP Server** is a developer-centric infrastructure tool designed to integrate AI cost management directly into your IDE (like Cursor). By implementing the **Model Context Protocol (MCP)**, it transforms your AI agent from a "code generator" into a "financially aware architect."

### **🛠 Core Capabilities**

* **Budget Guardrails**: Real-time tracking of token consumption and remaining balance.  
* **Identity Attribution**: Mapping every AI request to specific agents (e.g., Axpha-Trader) or departments.  
* **Active Intervention**: Programmatic model downgrading or request blocking based on cost policies.  
* **Automated Auditing**: Built-in prompts for generating professional weekly, monthly, and quarterly reports.

---

### **🚀 Getting Started**

#### **1\. Installation**

This package is distributed via NPM for seamless integration using npx.

Bash  
npm install \-g @gengbingbing/alephant-mcp

#### **2\. Cursor Integration**

To enable the "Antigravity Cockpit" in Cursor:

1. Go to **Cursor Settings** \-\> **Features** \-\> **MCP**.  
2. Click **\+ Add New MCP Server**.  
3. Fill in the details:  
   * **Name**: Alephant  
   * **Type**: command  
   * **Command**: npx \-y @gengbingbing/alephant-mcp  
4. Verify that the status light turns **Green**.

---

### **🤖 Usage Scenarios**

| User Intent | Suggested Prompt |
| :---- | :---- |
| **Check Health** | "Alephant, what's our current budget status?" |
| **List Agents** | "Show me all active virtual keys and their daily limits." |
| **Enforce Policy** | "If the budget exceeds 80%, switch Axpha-Trader to low-cost mode." |
| **Generate Report** | "Generate a weekly cost audit report for workspace Axpha-Main." |

---

### **📅 Proactive Scheduling**

Alephant supports scheduled "Mission Control" style push reports.

* **AI Scheduler**: Ask the AI: *"Schedule a weekly Alephant audit every Monday at 9 AM."*  
* **Local Cron**: Add 0 9 \* \* 1 npx @gengbingbing/alephant-mcp \--audit \>\> ./AUDIT.md to your crontab.
