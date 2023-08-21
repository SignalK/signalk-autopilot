const path = require('path');

module.exports = {
  entry: path.resolve(__dirname, './public-src/js/signalk-autopilot.js'),
  output: {
    path: path.resolve(__dirname, './public'),
    filename: 'signalk-autopilot.min.js',
    library: {
      name: 'autopilot',
      type: 'var',
    },
  },
};
