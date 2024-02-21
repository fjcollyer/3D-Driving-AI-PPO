const webpackMerge = require('webpack-merge');
const commonConfiguration = require('./webpack.common.js');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const TerserPlugin = require('terser-webpack-plugin');

module.exports = webpackMerge(
    commonConfiguration,
    {
        mode: 'production',
        optimization: {
            minimize: true,
            minimizer: [
                new TerserPlugin({
                    terserOptions: {
                        keep_fnames: true,
                        mangle: false, // Optional: Disable mangling to keep function names more readable
                    },
                }),
            ],
        },
        plugins: [
            new CleanWebpackPlugin(),
        ],
    }
);
