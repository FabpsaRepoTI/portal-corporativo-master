const path = require('path'),
  webpack = require('webpack');
webpack({
  mode: 'development',
  entry: path.resolve('tests/flujo-desarrollo-review/entry.jsx'),
  output: {
    path: path.resolve('.flujo-desarrollo-review'),
    filename: 'bundle.js'
  },
  plugins: [new webpack.DefinePlugin({
    'import.meta.env.VITE_API_URL': JSON.stringify(''),
    'process.env.PUBLIC_URL': JSON.stringify(''),
    'process.env.REACT_APP_API_URL': JSON.stringify('')
  })],
  resolve: {
    extensions: ['.jsx', '.js']
  },
  module: {
    rules: [{
      test: /\.jsx?$/,
      exclude: /node_modules/,
      use: {
        loader: require.resolve('babel-loader'),
        options: {
          presets: [[require.resolve('@babel/preset-env'), {
            targets: {
              chrome: '120'
            }
          }], [require.resolve('@babel/preset-react'), {
            runtime: 'automatic'
          }]]
        }
      }
    }, {
      test: /\.css$/,
      use: [require.resolve('style-loader'), require.resolve('css-loader')]
    }, {
      test: /\.(png|jpg|svg|woff2?)$/,
      type: 'asset/resource'
    }]
  },
  devtool: false
}, (err, stats) => {
  if (err || stats.hasErrors()) {
    console.error(err || stats.toString({
      all: false,
      errors: true
    }));
    process.exitCode = 1;
  } else console.log('Review bundle ready');
});
