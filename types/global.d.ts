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
         * The resolved package description
         */
        readonly MODULE_DESCRIPTION: string;
        /**
         * Determines if the code is executed from an esbuild bundle
         */
        readonly ESBUILD_PACKAGE: string;
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
