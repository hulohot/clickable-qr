const path = require('path');

module.exports = {
    mode: 'production',
    entry: {
        content: './index.js',
        test: './test.js'
    },
    output: {
        filename: '[name]-bundle.js',
        path: path.resolve(__dirname, 'dist'),
    }
}; 