import HtmlWebpackPlugin = require("html-webpack-plugin");

const ReactRefreshWebpackPlugin = require('@pmmmwh/react-refresh-webpack-plugin');

// fallback to production mode if process.env.NODE_ENV not set
if (!process.env.NODE_ENV)
  process.env.NODE_ENV = "production";

const isDevelopment = process.env.NODE_ENV !== 'development';

const CopyWebpackPlugin = require('copy-webpack-plugin');
const DotenvPlugin = require('dotenv-webpack');

const InlineChunkHtmlPlugin = require("react-dev-utils/InlineChunkHtmlPlugin");
const InterpolateHtmlPlugin = require("react-dev-utils/InterpolateHtmlPlugin");

// For alias resolving purposes
const TsconfigPathsPlugin = require("tsconfig-paths-webpack-plugin");

// Some apps do not need the benefits of saving a web request, so not inlining the chunk
// makes for a smoother build process.
const shouldInlineRuntimeChunk = process.env.INLINE_RUNTIME_CHUNK !== "false";

module.exports = function (webpackEnv) {
  const isEnvDevelopment = webpackEnv === "development";
  const isEnvProduction = webpackEnv === "production";
  
  const path = require('path');
  return {
    cache: {
      type: 'filesystem',
      cacheDirectory: path.resolve(__dirname, '.temp_cache'),
    },
    entry: {
      main: 'src/dashboard/index.tsx',
    },
    mode: isDevelopment ? 'development' : 'production',
    module: {
      rules: [
        {
          test: /\.[jt]sx?$/,
          exclude: [/node_modules/, path.resolve(__dirname, './config.ts')],
          use: [
            {
              loader: require.resolve('babel-loader'),
              options: {
                plugins: [isEnvDevelopment && require.resolve('react-refresh/babel')].filter(Boolean),
                customize: require.resolve(
                  "babel-preset-react-app/webpack-overrides"
                ),
                presets: [
                  "@babel/preset-env",
                  [
                    "@babel/preset-react",
                    {
                      pragma: "dom",
                      throwIfNamespace: false,
                    },
                  ],
                  [
                    require.resolve("babel-preset-react-app"),
                    {
                      throwIfNamespace: false,
                      runtime: "automatic",
                    },
                  ],
                ],
              },
            },
          ],
        },
        {
          test: /\.css$/i,
          use: ["style-loader", "css-loader"],
        },
        {
          test: /\.(png|svg|jpg|jpeg|gif|ico)$/,
          exclude: /node_modules/,
          use: ['file-loader?name=[name].[ext]'] // ?name=[name].[ext] is only necessary to preserve the original file name
        },
      ],
    },
    output: {
      // Add /* filename */ comments to generated require()s in the output.
      pathinfo: isEnvDevelopment,
      path: path.resolve(__dirname, 'build'),
      filename: "bundle.js",
      publicPath: "/",
    },
    devServer: {
      historyApiFallback: true,
    },
    plugins:
      [
        // Careful not to include any tokens in any of the dashboard scripts
        new DotenvPlugin(),
        new CopyWebpackPlugin({
          patterns: [
            {
              from: path.resolve(__dirname, 'public'), to: path.resolve(__dirname, 'build'),
              globOptions: {
                ignore: ["**/index.html"],
              },
            },
          ],
        }),
        isDevelopment && new ReactRefreshWebpackPlugin(),
        // Inlines the webpack runtime script. This script is too small to warrant
        // a network request.
        // https://github.com/facebook/create-react-app/issues/5358
        isEnvProduction &&
        shouldInlineRuntimeChunk &&
        new InlineChunkHtmlPlugin(HtmlWebpackPlugin, [/runtime-.+[.]js/]),
        // Makes some environment variables available in index.html.
        // The public URL is available as %PUBLIC_URL% in index.html, e.g.:
        // <link rel="icon" href="%PUBLIC_URL%/favicon.ico">
        // It will be an empty string unless you specify "homepage"
        // in `package.json`, in which case it will be the pathname of that URL.
        new InterpolateHtmlPlugin(HtmlWebpackPlugin, {
          'NODE_ENV': 'production',
          'PUBLIC_URL': `${process.env.PUBLIC_URL}:${process.env.PORT}`
        }),
        // Generates an `index.html` file with the <script> injected.
        new HtmlWebpackPlugin(
          Object.assign(
            {},
            {
              inject: true,
              template: path.resolve(__dirname, 'public/index.html'),
            },
            isEnvProduction
              ? {
                minify: {
                  removeComments: true,
                  collapseWhitespace: true,
                  removeRedundantAttributes: true,
                  useShortDoctype: true,
                  removeEmptyAttributes: true,
                  removeStyleLinkTypeAttributes: true,
                  keepClosingSlash: true,
                  minifyJS: true,
                  minifyCSS: true,
                  minifyURLs: true,
                },
              }
              : undefined
          )
        ),
      ].filter(Boolean),
    // For alias resolving purposes
    context: path.resolve(__dirname, 'src/dashboard'),
    resolve: {
      extensions: ['.js', '.jsx', '.json', '.ts', '.tsx'],
      modules: [__dirname, 'node_modules', path.resolve(__dirname, 'src/dashboard'), path.resolve(__dirname, 'src')],
      plugins: [new TsconfigPathsPlugin({
        extensions: ['.js', '.jsx', '.json', '.ts', '.tsx']
      })],
    }
  }
};