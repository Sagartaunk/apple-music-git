const path = require('path');

module.exports = {
  entry: './src/main.ts',
  target: 'electron-main',
  module: {
    rules: require('./webpack.rules'),
  },
  resolve: {
    extensions: ['.js', '.ts', '.jsx', '.tsx', '.css', '.json'],
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  // Webpack 5 optimizations
  optimization: {
    minimize: true,
    nodeEnv: 'production',
  },
};
