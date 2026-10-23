# 拓浙 AI 生态：thin wrappers around maintained npm and Compose entry points.
.DEFAULT_GOAL := help
COMPOSE := docker compose --env-file server/.env

.PHONY: help install dev dev-backend dev-frontend build build-docker test test-backend test-e2e lint lint-fix format format-check docker-build docker-run docker-dev docker-stop docker-clean db-migrate db-seed db-backup audit logs shell

help:
	@echo "Development: install, dev, dev-backend, dev-frontend"
	@echo "Checks: build, test (backend), test-e2e, lint, lint-fix, format, format-check, audit"
	@echo "Containers: docker-build, docker-run, docker-dev, docker-stop, logs, shell"
	@echo "Database (writes data): db-migrate, db-seed (demo reset), db-backup"
	@echo "Production release: push reviewed commits to master; GitHub Actions deploys them."
	@echo "Run container targets separately; production and development both use port 5181."

install:
	npm ci

dev:
	npm run dev

dev-backend:
	npm run dev:server

dev-frontend:
	npm run dev:client

build:
	npm run build

build-docker: docker-build

test: test-backend

test-backend:
	node --test --test-concurrency=1 server/tests/*.test.js

test-e2e:
	npm run test:e2e

lint:
	npm run lint

lint-fix:
	npm run lint -- --fix

format:
	npm run format

format-check:
	npm run format:check

docker-build:
	$(COMPOSE) build app

docker-run:
	$(COMPOSE) up --build -d app

docker-dev:
	$(COMPOSE) --profile development up --build dev

docker-stop:
	$(COMPOSE) --profile development --profile with-backup down --remove-orphans

# Retain the old alias without deleting persistent volumes or unrelated images.
docker-clean: docker-stop

db-migrate:
	npm --prefix server run migrate

db-seed:
	npm --prefix server run seed

db-backup:
	npm --prefix server run backup

audit:
	npm run audit:dependencies
	npm audit --prefix server --omit=dev --audit-level=high

logs:
	$(COMPOSE) logs --tail 100 -f app

shell:
	$(COMPOSE) exec app sh
