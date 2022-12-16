import { Command } from 'commander';
import { createCommand as installPackageCommand } from '@commands/install-package.command';
import { createCommand as uninstallPackageCommand } from '@commands/uninstall-package.command';
import { createCommand as reinstallPacakgeCommand } from '@commands/reinstall-package.command';
import { createCommand as renameFileCommand } from '@commands/rename-file.command';
import { createCommand as updatePackageVersionCommand } from '@commands/update-package-version.command';
import { createCommand as scrapeRepositoryCommand } from '@commands/scrape-repository.command';
import { createCommand as findAndReplaceCommand } from '@commands/find-and-replace.command';
import { createCommand as removePackageJsonScriptCommand } from '@commands/remove-package-json-script.command';
import { createCommand as addPackageJsonScriptCommand } from '@commands/add-package-json-script.command';

export const createCommands = (program: Command) => {
    installPackageCommand(program);
    uninstallPackageCommand(program);
    reinstallPacakgeCommand(program);
    renameFileCommand(program);
    updatePackageVersionCommand(program);
    scrapeRepositoryCommand(program);
    findAndReplaceCommand(program);
    removePackageJsonScriptCommand(program);
    addPackageJsonScriptCommand(program);
};
