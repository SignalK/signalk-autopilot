const { merge } = require('webpack-merge');
const common = require('./webpack.commons.config.js');
const TerserPlugin = require("terser-webpack-plugin");
const HtmlMinimizerPlugin = require("html-minimizer-webpack-plugin");
const CopyPlugin = require("copy-webpack-plugin");
const path = require('path');

module.exports = merge(common, {
  mode: 'production',
  optimization: {
    minimize: true,
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          sourceMap: true
        },
      }),
      new HtmlMinimizerPlugin({
        minimizerOptions: {
          caseSensitive: true,
          collapseWhitespace: true,
          conservativeCollapse: false,
          keepClosingSlash: true,
          minifyCSS: true,
          minifyJS: true,
          removeComments: true,
          removeScriptTypeAttributes: true,
          removeStyleLinkTypeAttributes: true,
        },
      }),
    ],
  },
  devtool: 'source-map',
  stats: 'normal',
  module: {
    rules: [
      {
        test: /\.html$/i,
        type: "asset/resource",
      }
    ],
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        {
          context: path.resolve(__dirname, "public-src"),
          from: "./*.html",
        }
      ],
    }),
  ],
});
