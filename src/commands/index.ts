import { Command } from 'commander';
import { createCommand as installPackageCommand } from './install-package.command';
import { createCommand as uninstallPackageCommand } from './uninstall-package.command';
import { createCommand as reinstallPacakgeCommand } from './reinstall-package.command';
import { createCommand as renameFileCommand } from './rename-file.command';
import { createCommand as updatePackageVersionCommand } from './update-package-version.command';
import { createCommand as scrapeRepositoryCommand } from './scrape-repository.command';
import { createCommand as findAndReplaceCommand } from './find-and-replace.command';

export const createCommands = (program: Command) => {
    installPackageCommand(program);
    uninstallPackageCommand(program);
    reinstallPacakgeCommand(program);
    renameFileCommand(program);
    updatePackageVersionCommand(program);
    scrapeRepositoryCommand(program);
    findAndReplaceCommand(program);
};
