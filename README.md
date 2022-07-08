# Git Toolkit

## Commands

### `rename-files`

## Development

If you cloned this repo and need to test the code locally, here's how:

_Example to rename all instances of /etc/topdanmark-webplatform-prod-01 to topdanmark-webplatform-prod in all repositories in the organization c9 where repository names start with the prefix c9_:

```bash
node \
  --no-warnings \
  --experimental-specifier-resolution=node \
  --experimental-modules \
  --loader ts-node/esm ./src/index.ts rename-file \
  -o c9 \
  -r "^c9" \
  --target-file-path /etc/topdanmark-webplatform-prod-01 \
  --new-file-name topdanmark-webplatform-prod
```

_Example to rename the file ./src/v1/utils/crypto.utils.ts to encryption.utils.ts in the c9-login-refresh repository in the organization c9 where repository on the heads/main (main branch) reference while logging all actions in DEBUG mode_:

```bash
node \
  --no-warnings \
  --experimental-specifier-resolution=node \
  --experimental-modules \
  --loader ts-node/esm ./src/index.ts rename-file \
  -o c9 \
  -l DEBUG \
  -r "c9-login-refresh" \
  --target-file-path ./src/v1/utils/crypto.utils.ts \
  --new-file-name encryption.utils.ts \
  -f heads/main
```

> Remove -r if you would like to apply the action across all repositories in this organization
