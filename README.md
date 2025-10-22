# n8n-nodes-sgr-tool-calling

AI research agent with OpenAI function calling for n8n. Port of [sgr-deep-research](https://github.com/vamplabAI/sgr-deep-research) Python project.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/reference/license/) workflow automation platform.

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation.

## Quick Start

1. Add **SGR Agent** node to your workflow
2. Connect **AI Language Model** (OpenAI, Anthropic, etc.)
3. Connect **AI Tools** (optional): search, MCP, LangChain tools
4. Connect **Memory** (optional): for conversation history

### Example Workflow

```
Chat Trigger → SGR Agent → Output
              ↓ ↓ ↓ ↓
        [Model][Tools][Memory]
```

Import `SGR Example.json` to get started.

## Features

### Built-in Tools

Agent uses 6 system tools for research tasks:

- `reasoning_tool` - analyze task and plan next steps
- `final_answer_tool` - complete task execution
- `create_report_tool` - generate detailed reports with citations
- `clarification_tool` - ask clarifying questions
- `generate_plan_tool` - create research plans
- `adapt_plan_tool` - adjust plans based on findings

All tools can be enabled/disabled in node settings.

### Connected Tools

Connect any n8n AI Tool:

- **SGR Tavily Search** - web search (included)
- **MCP Client Tool** - Model Context Protocol integrations
- **LangChain Tools** - calculators, code interpreters, etc.
- Supports the `/tools` command to display all connected tools

Agent automatically highlights connected tools when they execute.

### Memory

Connect n8n Memory node for conversation history:

- Remembers previous interactions within session
- Automatically clears when `sessionId` changes
- Supports `/clear` and `/new` commands
- Only stores user questions and final answers (not internal reasoning)

### Limits

Configure resource constraints:

- **Max Iterations** (default: 10) - reasoning cycles before stopping
- **Max Searches** (default: 4) - web search limit
- **Max Clarifications** (default: 3) - clarification request limit

### Custom Prompts

Override default prompts:

- **System Prompt** - agent behavior instructions
- **Initial User Request Template** - format task presentation
- **Clarification Response Template** - format clarification responses

## Configuration

### Input Fields

The node accepts these fields from previous nodes:

- `chatInput`, `input`, `message`, `text`, or `task` - the user's task
- `sessionId` - session identifier for memory (optional)
- `clearMemory: true` or `action: 'clear'` - clear memory flag (optional)

### Output

```json
{
	"task": "Original user task",
	"state": "COMPLETED",
	"iterations": 5,
	"final_message": "Agent reasoning",
	"answer": "Final answer or report",
	"tools_used": [
		{ "iteration": 1, "tool": "reasoning_tool", "timestamp": "..." },
		{ "iteration": 2, "tool": "tavily_search", "timestamp": "..." }
	]
}
```

Optional outputs (enable in Options):

- `log` - detailed execution log
- `conversation` - full conversation history

## Advanced Usage

### Two-Phase Execution

Agent uses structured approach:

1. **Reasoning Phase** - analyze situation, plan next steps
2. **Action Phase** - execute tools based on plan

## Included Nodes

### SGR Agent

Main agent node with tool calling capabilities.

### SGR Tavily Search Tool

Web search tool using [Tavily API](https://tavily.com/).

Requires Tavily API key (credentials).

Search modes:

- Basic search
- Deep research (with subqueries)

## Resources

- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
- [SGR Deep Research (Original Python Project)](https://github.com/vamplabAI/sgr-deep-research)
- [n8n AI Agents Documentation](https://docs.n8n.io/integrations/builtin/cluster-nodes/root-nodes/n8n-nodes-langchain.agent/)

## License

MIT
