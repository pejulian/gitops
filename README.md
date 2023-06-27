# @pejulian/gitops

Swiss army knife for running DevOps like tasks on NPM based repositories in your Git organization.

<!-- TOC -->

-   [@pejulian/gitops](#@pejulian/gitops)
    -   [Is this module for me?](#is-this-module-for-me)
    -   [Installation](#installation)
    -   [Setup](#setup)
    -   [Globals](#globals)
        -   [Github Personal Access Token (PAT)](#github-personal-access-token-pat)
        -   [Default Git Host](#default-git-host)
    -   [Commands](#commands)
        -   [`add-package-json-script`](#add-package-json-script)
        -   [`download-respository`](#download-respository)
        -   [`find-and-replace`](#find-and-replace)
        -   [`install-package`](#install-package)
        -   [`reinstall-package`](#reinstall-package)
        -   [`remove-package`](#remove-package)
        -   [`rename-file`](#rename-file)
        -   [`remove-package-json-script`](#remove-package-json-script)
        -   [`update-package-version`](#update-package-version)
        -   [`uninstall-package`](#uninstall-package)
    -   [Development](#development)

<!-- /TOC -->

## Is this module for me?

If you have many projects based on NodeJS (e.g. the project root has a `package.json`) in your Git organization, then this project may be helpful for you if you need to run updates on them at scale.

## Installation

Run `@pejulian/gitops` via `npx` (preferred):

```bash
npx @pejulian/gitops
```

or with a specified version or tag:

```bash
npx @pejulian/gitops@0.1.0
# or
npx @pejulian/gitops@beta
```

Install `@pejulian/gitops` globally on your machine:

```bash
npm install -g @pejulian/gitops
```

## Setup

`@pejulian/gitops` interacts with your Git organizations and repositories using Git's REST API In order to use the API, a Personal Access Token is required for authentication purposes. This token will be included in every request to Git via REST API headers.

For instructions on how to set up a Personal Access Token (PAT) for your Git user, read [this](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token).

The module will look for a file called `.git-token` in the user's HOME directory to obtain a PAT for use.

However, you can customize this behavior to suit your needs.

1. Via the `gitTokenFilePath` property in a `.gitopsrc.json` file in your home directory
    1. Read [this](#github-personal-access-token) for instructions on how to set this up.

## Globals

This module will read global configurations from a file named `.gitopsrc.json` in your home directory, if it exists.

The content of this file must be a valid JSON object.

These are the possible configurations that can be specified:

### Github Personal Access Token (PAT)

Tell this module where to find the file containing your PAT via a property called `gitTokenFilePath` in `.gitopsrc.json`.

For example:

```json
{
    "gitTokenFilePath": "configs/.my-git-pat.txt"
}
```

> The path must exist in your home directory (`echo $HOME`)

### Default Git Host

By default, this module will run against the official Git REST API base URL which is `api.github.com`. If you would like to use this module against a different Git service (e.g. enterprise Git setup), specify the `gitApiBase` property in `.gitopsrc.json` in your home directory.

For example:

```json
{
    "gitApiBase": "https://github.enterprise.cloud/api/v3"
}
```

## Commands

Run `npx @pejulian/gitops --help` to view the commands supported by this tool.

### `add-package-json-script`

This command allows you to add a script to the "scripts" section in "package.json" for effected repositories in the given organizations.

Run:

```bash
npx @pejulian/gitops add-package-json-script --help
```

for more information.

### `download-respository`

Downloads repositories (as tarball) for the given organizations. Optionally, extract downloaded tarball.

Run:

```bash
npx @pejulian/gitops download-repository --help
```

for more information.

### `find-and-replace`

This command allows you to find and replace matches of the supplied regex for a given list of files in relevant repositories for the given Git organizations.

Run:

```bash
npx @pejulian/gitops find-and-replace --help
```

for more information.

### `install-package`

This command allows you to install a new package in the effected repositories for the given organizations.

Run:

```bash
npx @pejulian/gitops install-package --help
```

for more information.

### `reinstall-package`

Reinstall an existing package in the effected repositories for the given organizations.

Run:

```bash
npx @pejulian/gitops reinstall-package --help
```

for more information.

### `remove-package`

Remove a given script from the "scripts" section in "package.json" for effected repositories in the given organizations.

Run:

```bash
npx @pejulian/gitops remove-package --help
```

for more information.

### `rename-file`

This command allows you to rename a file across multiple git organizations and repositories.

Run:

```bash
npx @pejulian/gitops rename-file --help
```

for more information.

### `remove-package-json-script`

This command allows you to remove a given script from the "scripts" section in "package.json" for effected repositories in the given organizations.

Run:

```bash
npx @pejulian/gitops remove-package-json-script --help
```

for more information.

### `update-package-version`

This command allows you to update the version of an existing npm package in `package.json` for all affected repositories in the given organizations.

Run:

```bash
npx @pejulian/gitops update-package-version --help
```

for more information.

### `uninstall-package`

This command allows you to uninstall an existing package from repositories in the given Git organizations.

Run:

```bash
npx @pejulian/gitops uninstall-package --help
```

for more information.
