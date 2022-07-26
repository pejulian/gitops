# gitops

Swiss army knife for running DevOps like tasks on NPM based repositories in your Git organization.

<!-- TOC -->

-   [gitops](#gitops)
    -   [Commands](#commands)
        -   [`rename-file`](#rename-file)
        -   [`update-package-version`](#update-package-version)
        -   [`reinstall-package`](#reinstall-package)
        -   [`ensure-deployability`](#ensure-deployability)
        -   [`revert-commit`](#revert-commit)
    -   [Development](#development)

<!-- /TOC -->

## Commands

Run `npx gitops --help` to view the commands supported by this tool.

### `rename-file`

This command allows you to rename a file across multiple git organizations and repositories.

Run:

```bash
npx gitops rename-file --help
```

for more information.

### `update-package-version`

This command allows you to update the version of an existing npm package in `package.json` for all affected repositories in the given organizations.

Run:

```bash
npx gitops update-package-version --help
```

for more information.

### `reinstall-package`

This command allows you to reinstall an existing package in the effected repositories for the given organizations.

Run:

```bash
npx gitops reinstall-package --help
```

for more information.

### `ensure-deployability`

This command ensures that the given repositories for the specified organizations can be deployed from a code perspective by running test and build commands if available.

Run:

```bash
npx gitops revert-commit --help
```

for more information.

### `revert-commit`

This command allows you to revert a commit from one or more repositories for the given organizations.

Run:

```bash
npx gitops revert-commit --help
```

for more information.

## Development

If you cloned this repo and need to test the code locally without publishing to npm, use the following:

```bash
node \
  --no-warnings \
  --experimental-specifier-resolution=node \
  --experimental-modules \
  --loader ts-node/esm ./src/index.ts [COMMAND] [FLAGS] \
```

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
