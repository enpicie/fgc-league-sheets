/* eslint-disable @typescript-eslint/no-var-requires */
const path = require('path');
const GasPlugin = require('gas-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');

const isProduction = process.env.NODE_ENV === 'production';

/**
 * InlineChunkHtmlPlugin — inlines all JS chunks as <script> tags directly in
 * the HTML so that GAS can serve sidebar.html as a single self-contained file.
 * Based on the approach used by create-react-app.
 */
class InlineChunkHtmlPlugin {
  constructor(htmlWebpackPlugin, tests) {
    this.htmlWebpackPlugin = htmlWebpackPlugin;
    this.tests = tests;
  }

  getInlinedTag(publicPath, assets, tag) {
    if (tag.tagName !== 'script' || !(tag.attributes && tag.attributes.src)) {
      return tag;
    }
    const scriptName = publicPath
      ? tag.attributes.src.replace(publicPath, '')
      : tag.attributes.src;
    if (!this.tests.some(test => scriptName.match(test))) {
      return tag;
    }
    const asset = assets[scriptName];
    if (!asset) return tag;
    return {
      tagName: 'script',
      innerHTML: asset.source(),
      closeTag: true,
    };
  }

  apply(compiler) {
    let publicPath = compiler.options.output.publicPath || '';
    if (publicPath && !publicPath.endsWith('/')) publicPath += '/';

    compiler.hooks.compilation.tap('InlineChunkHtmlPlugin', compilation => {
      const tagFunction = tag =>
        this.getInlinedTag(publicPath, compilation.assets, tag);

      const hooks = this.htmlWebpackPlugin.getHooks(compilation);
      hooks.alterAssetTagGroups.tap('InlineChunkHtmlPlugin', assets => {
        assets.headTags = assets.headTags.map(tagFunction);
        assets.bodyTags = assets.bodyTags.map(tagFunction);
      });

      // Delete inlined assets so webpack doesn't emit them as separate files.
      // Without this, sidebar-bundle.js lands in dist/ and GAS executes it
      // server-side, where `document` is not defined.
      hooks.afterEmit.tap('InlineChunkHtmlPlugin', () => {
        for (const assetName of Object.keys(compilation.assets)) {
          if (this.tests.some(test => assetName.match(test))) {
            delete compilation.assets[assetName];
          }
        }
      });
    });
  }
}

module.exports = [
  // ── Server bundle (GAS) ──────────────────────────────────────────────────
  {
    entry: './src/server/index.ts',
    output: {
      filename: 'Code.js',
      path: path.resolve(__dirname, 'dist'),
    },
    resolve: { extensions: ['.ts', '.js'] },
    module: {
      rules: [
        {
          test: /\.ts$/,
          use: 'ts-loader',
          exclude: /node_modules/,
        },
      ],
    },
    plugins: [new GasPlugin()],
    optimization: { minimize: false },
  },
  // ── Client bundle (React sidebar) ────────────────────────────────────────
  {
    entry: './src/client/sidebar/index.tsx',
    output: {
      filename: 'sidebar-bundle.js',
      path: path.resolve(__dirname, 'dist'),
    },
    resolve: { extensions: ['.tsx', '.ts', '.js'] },
    module: {
      rules: [
        {
          test: /\.(ts|tsx)$/,
          use: 'ts-loader',
          exclude: /node_modules/,
        },
        {
          test: /\.css$/,
          use: ['style-loader', 'css-loader'],
        },
      ],
    },
    plugins: [
      new HtmlWebpackPlugin({
        template: './src/client/sidebar/index.html',
        filename: 'sidebar.html',
        inject: 'body',
      }),
      new InlineChunkHtmlPlugin(HtmlWebpackPlugin, [/sidebar-bundle/]),
    ],
    optimization: { minimize: isProduction },
  },
];
