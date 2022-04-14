const path = require('path');

module.exports = {
	entry: './index.js',
	output: {
		path: __dirname + '/dist',
		publicPath: '/dist',
		filename: 'bundle.js'
	},
    // Enable sourcemaps for debugging webpack's output.
    devtool: "source-map",
};