const path = require('path');

module.exports = {
  entry: {
    'signalk-autopilot': path.resolve(__dirname, './public-src/js/signalk-autopilot.js'),
    keypad: path.resolve(__dirname, './public-src/js/keypad.js'),
  },
  output: {
    path: path.resolve(__dirname, './public'),
    filename: '[name].min.js',
    library: {
      name: 'autopilot',
      type: 'var',
    },
  },
};
