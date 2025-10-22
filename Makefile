# Default target
.DEFAULT_GOAL := help

# Colors for output
CYAN := \033[0;36m
GREEN := \033[0;32m
YELLOW := \033[1;33m
RED := \033[0;31m
NC := \033[0m # No Color

install: ## Install dependencies
	@echo "$(GREEN)Installing dependencies...$(NC)"
	npm install
	@echo "$(GREEN)✓ Dependencies installed$(NC)"

build: ## Build the project
	@echo "$(GREEN)Building project...$(NC)"
	export N8N_CUSTOM_EXTENSIONS="~/sgr_tool_calling"
	npm run build
	npm link
	npm link n8n-nodes-sgr-tool-calling
	@echo "$(GREEN)✓ Build complete$(NC)"

format: ## Format code with prettier
	@echo "$(GREEN)Formatting code...$(NC)"
	npx prettier --write "**/*.{ts,json,md}"
	@echo "$(GREEN)✓ Code formatted$(NC)"

clean: ## Clean build artifacts
	@echo "$(GREEN)Cleaning build artifacts...$(NC)"
	rm -rf dist/
	rm -rf node_modules/.cache
	@echo "$(GREEN)✓ Clean complete$(NC)"
