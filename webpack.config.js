const path = require('path');
const webpack = require('webpack');
const dotenv = require('dotenv');
dotenv.config();

module.exports = {
  entry: {
    background: './src/background.js',
    content: './src/content.js',
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].bundle.js',
  },
  plugins: [
    new webpack.DefinePlugin({
      'process.env.CHATGPT_API_KEY': JSON.stringify(process.env.CHATGPT_API_KEY),
    }),
  ],
  mode: 'production',
  resolve: {
    fallback: {
      "fs": false,
      "path": false,
      "os": false
    }
  }
};
