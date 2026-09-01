DOCKERHUB_USER ?= yourorg
PROJECT_NAME ?= $(shell bun -e "console.log(require('./package.json').name)")
IMAGE_TAG ?= latest
PLATFORM ?= linux/amd64
API_IMAGE := $(DOCKERHUB_USER)/$(PROJECT_NAME)-api:$(IMAGE_TAG)
WEB_IMAGE := $(DOCKERHUB_USER)/$(PROJECT_NAME)-web:$(IMAGE_TAG)
DATABASE_URL ?= postgres://postgres:postgres@localhost:5433/$(PROJECT_NAME)
JWT_SECRET ?= dev-secret-change-me
CORS_ALLOWED_ORIGINS ?= http://localhost:5173,http://localhost:8080
API_URL ?= http://localhost:3000

.PHONY: start stop migrate generate typecheck lint test verify build-images push-images docker-login

start:
	docker compose up -d --build

stop:
	docker compose down

generate:
	DATABASE_URL=$(DATABASE_URL) bun run db:generate

migrate:
	DATABASE_URL=$(DATABASE_URL) bun run db:migrate

verify:
	bun run --workspaces --if-present typecheck
	bun run lint
	DATABASE_URL=$(DATABASE_URL) JWT_SECRET=$(JWT_SECRET) CORS_ALLOWED_ORIGINS=$(CORS_ALLOWED_ORIGINS) bun test

build-images:
	docker buildx build --platform $(PLATFORM) -f apps/api/Dockerfile -t $(API_IMAGE) --load .
	docker buildx build --platform $(PLATFORM) -f apps/web/Dockerfile -t $(WEB_IMAGE) --load .

push-images:
	docker buildx build --platform $(PLATFORM) -f apps/api/Dockerfile -t $(API_IMAGE) --push .
	docker buildx build --platform $(PLATFORM) -f apps/web/Dockerfile -t $(WEB_IMAGE) --push .

docker-login:
	docker login -u $(DOCKERHUB_USER)
