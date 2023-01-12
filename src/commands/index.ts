import { Command } from 'commander';
import { createCommand as installPackageCommand } from './install-package.command';
import { createCommand as uninstallPackageCommand } from './uninstall-package.command';
import { createCommand as reinstallPacakgeCommand } from './reinstall-package.command';
import { createCommand as renameFileCommand } from './rename-file.command';
import { createCommand as updatePackageVersionCommand } from './update-package-version.command';
import { createCommand as downloadRepositoryCommand } from './download-repository.command';
import { createCommand as findAndReplaceCommand } from './find-and-replace.command';
import { createCommand as removePackageJsonScriptCommand } from './remove-package-json-script.command';
import { createCommand as addPackageJsonScriptCommand } from './add-package-json-script.command';

export const createCommands = (program: Command) => {
    installPackageCommand(program);
    uninstallPackageCommand(program);
    reinstallPacakgeCommand(program);
    renameFileCommand(program);
    updatePackageVersionCommand(program);
    downloadRepositoryCommand(program);
    findAndReplaceCommand(program);
    removePackageJsonScriptCommand(program);
    addPackageJsonScriptCommand(program);
};
