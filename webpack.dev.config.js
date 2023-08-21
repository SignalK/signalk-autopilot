const { merge } = require('webpack-merge');
const common = require('./webpack.commons.config.js');
const path = require('path');

module.exports = merge(common, {
  mode: 'development',
  devtool: 'inline-source-map',
  devServer: {
    static: path.resolve(__dirname, './public'),
    allowedHosts: 'all',
    compress: true,
    host: '0.0.0.0',
    client: {
      logging: 'info',
      overlay: true,
      progress: true,
    },
    proxy: {
      '/signalk/v1/stream': {
        target: 'ws://localhost:3000',
        ws: true
      },
    },
  },
});
