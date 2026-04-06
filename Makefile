# Colors
RED    = \033[0;31m
GREEN  = \033[0;32m
YELLOW = \033[0;33m
BLUE   = \033[0;34m
CYAN   = \033[0;36m
RESET  = \033[0m

# Docker Compose
DC = docker compose

.PHONY: all up down build restart logs ps clean fclean re init help

all: up

## Copy all .example configs to real files (first-time setup)
init:
	@echo "$(CYAN)Initializing config files...$(RESET)"
	@test -f .env               || (cp .env.example .env && echo "$(GREEN)created .env$(RESET)")
	@test -f redis/redis.conf   || (cp redis/redis.conf.example redis/redis.conf && echo "$(GREEN)created redis/redis.conf$(RESET)")
	@test -f postgresql/postgresql.conf || (cp postgresql/postgresql.conf.example postgresql/postgresql.conf && echo "$(GREEN)created postgresql/postgresql.conf$(RESET)")
	@echo "$(YELLOW)Fill in credentials in .env and redis/redis.conf before running make$(RESET)"

## Start all services (build if needed)
up:
	@echo "$(CYAN)Starting services...$(RESET)"
	@$(DC) up --build -d
	@echo "$(GREEN)Services started → http://localhost:8080$(RESET)"

## Stop all services
down:
	@echo "$(YELLOW)Stopping services...$(RESET)"
	@$(DC) down
	@echo "$(RED)Services stopped$(RESET)"

## Rebuild and restart all services
build:
	@echo "$(CYAN)Rebuilding images...$(RESET)"
	@$(DC) build
	@echo "$(GREEN)Build complete$(RESET)"

## Restart a specific service: make restart s=backend
restart:
	@echo "$(CYAN)Restarting $(s)...$(RESET)"
	@$(DC) restart $(s)
	@echo "$(GREEN)$(s) restarted$(RESET)"

## Scale backend instances: make scale n=3
scale:
	@echo "$(CYAN)Scaling backend to $(n) replicas...$(RESET)"
	@$(DC) up -d --scale backend=$(n)
	@echo "$(GREEN)Backend scaled to $(n) replicas$(RESET)"

## Show logs (all services or specific: make logs s=backend)
logs:
	@$(DC) logs -f $(s)

## Show running containers
ps:
	@$(DC) ps

## Remove containers and volumes (keeps images)
clean:
	@echo "$(YELLOW)Removing containers and volumes...$(RESET)"
	@$(DC) down -v
	@echo "$(RED)Containers and volumes removed$(RESET)"

## Remove everything: containers, volumes and images
fclean:
	@echo "$(RED)Removing containers, volumes and images...$(RESET)"
	@$(DC) down -v --rmi all
	@echo "$(RED)Full cleanup done$(RESET)"

## Rebuild and restart from scratch
re: fclean up

## Show this help
help:
	@echo ""
	@echo "$(CYAN)ft_transcendence$(RESET)"
	@echo ""
	@echo "$(GREEN)Usage:$(RESET)"
	@echo "  make $(YELLOW)<target>$(RESET)"
	@echo ""
	@echo "$(GREEN)Targets:$(RESET)"
	@grep -E '^##' Makefile | sed 's/## //' | awk '{printf "  $(YELLOW)%-20s$(RESET) %s\n", prev, $$0; prev=""} /^[a-z]/ {prev=$$0}'
	@echo ""
	@echo "$(GREEN)Examples:$(RESET)"
	@echo "  make                      start the project"
	@echo "  make logs s=backend       follow backend logs"
	@echo "  make restart s=nginx      restart nginx"
	@echo "  make scale n=3            run 3 backend instances"
	@echo ""
