# Forge k3s deploy

This folder is a minimal k3s/Kubernetes deployment scaffold for Forge.

## Images

Default images:

- `yourorg/forge-api:latest`
- `yourorg/forge-web:latest`
- `yourorg/forge-migrate:latest`

Build/push:

```sh
make build-images IMAGE_TAG=<tag>
make push-images IMAGE_TAG=<tag>
```

## Secrets

Copy and edit the example secret before applying to a real cluster:

```sh
cp deploy/k3s/secret.example.yaml /tmp/forge-secret.yaml
# edit values
kubectl apply -f /tmp/forge-secret.yaml
```

Do not commit real secrets.

## Deploy order

```sh
kubectl apply -f deploy/k3s/namespace.yaml
kubectl apply -f /tmp/forge-secret.yaml
kubectl apply -f deploy/k3s/configmap.yaml
kubectl apply -f deploy/k3s/postgres.yaml
kubectl wait --for=condition=ready pod -l app=forge-postgres -n forge --timeout=120s
kubectl apply -f deploy/k3s/migrate-job.yaml
kubectl wait --for=condition=complete job/forge-migrate -n forge --timeout=120s
kubectl apply -f deploy/k3s/api.yaml
kubectl apply -f deploy/k3s/web.yaml
kubectl apply -f deploy/k3s/ingress.yaml
```

Or render/apply non-secret resources with:

```sh
make k3s-render
make k3s-apply
```

`secret.example.yaml` is intentionally not included in `kustomization.yaml`; apply a real Secret separately.

## Runtime web config

The web Deployment sets `API_URL` from `forge-config`. The container writes `/config.js` at startup, so the same web image can be reused across environments.

## Migration model

The API runtime image does not include Prisma CLI for startup migrations. Run `forge-migrate` as a Job before rolling out API pods.
