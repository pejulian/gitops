declare namespace NodeJS {
    export interface ProcessEnv {
        /**
         * The resolved npm package name
         */
        readonly MODULE_NAME: string;
        /**
         * The resolved npm package version
         */
        readonly MODULE_VERSION?: string;
        /**
         * Determines if the code is executed from a webpack build
         */
        readonly WEBPACK_BUILD: string;
    }
}

/**
 * Extracts the type for items in an array
 */
declare type UnpackedArray<T> = T extends (infer U)[] ? U : T;

/**
 * Extracts the type for the item wrapped in a Promise or PromiseLike interface
 */
declare type UnpackedPromise<T> = T extends PromiseLike<infer U> ? U : T;
