const rules = require('./webpack.rules');
const path = require('path');

rules.push({
  test: /\.css$/,
  use: [
    { loader: 'style-loader' },
    {
      loader: 'css-loader',
      options: {
        sourceMap: false, // Disable sourcemaps in production
      },
    },
  ],
});

module.exports = {
  target: 'electron-renderer',
  module: {
    rules,
  },
  resolve: {
    extensions: ['.js', '.ts', '.jsx', '.tsx', '.css'],
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
