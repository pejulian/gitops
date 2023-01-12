import { Table } from 'console-table-printer';

export class TableUtil {
    private readonly _table: Table;

    constructor(opts: ConstructorParameters<typeof Table>[0]) {
        this._table = new Table(opts);
    }

    addRow(...args: Parameters<Table['addRow']>) {
        this._table.addRow(...args);
    }

    addColumn(...args: Parameters<Table['addColumn']>) {
        this._table.addColumn(...args);
    }

    addRows(...args: Parameters<Table['addRows']>) {
        this._table.addRows(...args);
    }

    printTable() {
        this._table.printTable();
    }
}
