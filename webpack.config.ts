import webpack from 'webpack';
import { resolve } from 'path';
import TerserPlugin from 'terser-webpack-plugin';
import TsConfigPathsPlugin from 'tsconfig-paths-webpack-plugin';

// top level await made possible with module es2022
const packageJson = (
    await import('./package.json', {
        assert: {
            type: 'json'
        }
    })
).default;

const plugins: webpack.Configuration['plugins'] = [
    new webpack.BannerPlugin({
        banner: '#!/usr/bin/env node',
        raw: true
    }),
    new webpack.DefinePlugin({
        'process.env.MODULE_NAME': JSON.stringify(`${packageJson.name}`),
        'process.env.MODULE_DESCRIPTION': JSON.stringify(
            `${packageJson.description}`
        ),
        'process.env.MODULE_VERSION': JSON.stringify(`${packageJson.version}`),
        'process.env.WEBPACK_BUILD': JSON.stringify(`webpack`)
    })
];

const baseConfig: Partial<webpack.Configuration> = {
    mode: 'production',
    entry: './src/index.ts',
    devtool: false,
    optimization: {
        minimize: true,
        minimizer: [
            new TerserPlugin({
                extractComments: false,
                exclude: /\/.hbs/
            })
        ]
    },
    resolve: {
        extensions: ['.ts', '.js'],
        plugins: [new TsConfigPathsPlugin({})]
    },
    plugins
};

const esmRuleSetRule: webpack.RuleSetRule = {
    test: /\.tsx?$/,
    exclude: /node_modules/,
    use: [
        {
            loader: 'ts-loader',
            options: {
                configFile: 'tsconfig.esm.json'
            }
        }
    ]
};

const esmConfig: webpack.Configuration = {
    ...baseConfig,
    target: ['node', 'es2020'],
    experiments: {
        outputModule: true
    },
    output: {
        library: {
            type: 'module'
        },
        filename: `index.js`,
        path: resolve('./', 'dist'),
        clean: true
    },
    module: {
        rules: [esmRuleSetRule],
        parser: {
            javascript: {
                importMeta: false // https://github.com/webpack/webpack/pull/15246
            }
        }
    }
};

export default [esmConfig];
