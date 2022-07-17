# Pejulian Toolkit

Swiss army knife for running DevOps like tasks on NPM based repositories in your Git organization.

## Commands

### `rename-file`

This operation allows you to rename a file across multiple git organizations and repositories.

Run:

```bash
npx pejulian-toolkit@latest rename-file --help
```

for more information.

Example:

```bash
npx pejulian-toolkit@latest rename-file \
  -o c9 \
  --target-file-path etc/topdanmark-webplatform-prod-01.json \
  --new-file-name topdanmark-webplatform-prod.json \
```

This command will rename a file called `topdanmark-webplatform-prod-01.json` to `topdanmark-webplatform-prod.json` in the `etc` folder of _every_ repository in the GitHub organization named `c9` (if the file exists) with the default log level of `INFO`. The operation will run on the **default branch** of each repository scanned.

### `update-package-version`

Updates the version of an existing npm package in `package.json` for all affected repositories in the given organizations.

Run:

```bash
npx pejulian-toolkit@latest update-package-version --help
```

for more information.

Example:

```bash
npx pejulian-toolkit@latest update-package-version \
  -o c9 \
  -l DEBUG \
  -r "c9-login-refresh" \
  --package-name c9-deploy \
  --package-version latest \
  --package-type d \
  --package-update-constraint "2.2.0" \
  --package-update-condition lt
```

This command will update the **development dependency** `c9-deploy` in the repository `c9-login-refresh` in the GitHub organization named `c9` (if it exists) with the most current **latest** version IF the **existing version** of `c9-deploy` in the scanned repository has a version that is less than `2.2.0`. The operation will run with the log level of `DEBUG`. The operation will run on the **default branch** of each repository scanned.

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

_Example to rename the file ./src/v1/utils/crypto.utils.ts to encryption.utils.ts in the c9-login-refresh repository in the organization c9 on the heads/main (main branch) reference while logging all actions in DEBUG mode_:

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

_Example to update the devDependency npm package version of c9-deploy to "beta" in the the c9-login-refresh repository in the organization c9 while logging all actions in DEBUG mode_

```bash
node \
  --no-warnings \
  --experimental-specifier-resolution=node \
  --experimental-modules \
  --loader ts-node/esm ./src/index.ts update-package-version \
  -o c9 \
  -l DEBUG \
  -r "c9-login-refresh" \
  --package-name c9-deploy \
  --package-version beta \
  --package-type d \
```

> Remove -r if you would like to apply the action across all repositories in this organization
