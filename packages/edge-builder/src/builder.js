/* eslint-disable max-params, max-statements, complexity */

import fs from "fs"
import webpack from "webpack"
import { get as getRoot } from "app-root-dir"
import { resolve } from "path"
import chalk from "chalk"

import webpackPkg from "webpack/package.json"

import VerboseProgress from "./plugins/VerboseProgress"

import { getServerExternals } from "./webpack/util"

// CSS Support
import ExtractCssChunks from "extract-css-chunks-webpack-plugin"

// Core
import StatsPlugin from "stats-webpack-plugin"
import CaseSensitivePathsPlugin from "case-sensitive-paths-webpack-plugin"

// Generating static HTML pages
// import HtmlWebpackPlugin from "html-webpack-plugin"
import SriPlugin from "webpack-subresource-integrity"

import BundleAnalyzerPlugin from "webpack-bundle-analyzer"
// import ZopfliPlugin from "zopfli-webpack-plugin"

import { getHashDigest } from "loader-utils"

// https://github.com/mishoo/UglifyJS2#compress-options
const UGLIFY_OPTIONS = {
  /* eslint-disable camelcase */

  compress: {
    // Only risky for some rare floating point situations
    unsafe_math: true,

    // optimize expressions like Array.prototype.slice.call(a) into [].slice.call(a)
    unsafe_proto: true,

    // Good for Chrome performance
    keep_infinity: true,

    // Try harder to export less code
    passes: 2
  },

  output: {
    // Fix for problematic code like emoticons
    ascii_only: true,

    // More readable output
    // Whenever possible we will use a newline instead of a semicolon
    // semicolons: false,

    // Remove all comments, don't even keep tons of copyright comments
    comments: false
  }
}

const ROOT = getRoot()

const assetFiles = /\.(eot|woff|woff2|ttf|otf|svg|png|jpg|jpeg|jp2|jpx|jxr|gif|webp|mp4|mp3|ogg|pdf|html|ico)$/
const babelFiles = /\.(js|mjs|jsx)$/
const postcssFiles = /\.(css|sss|pcss)$/
const compressableAssets = /\.(ttf|otf|svg|pdf|html|ico|txt|md|html|js|css|json|xml)$/

const identityFnt = (item) => item

export default function builder(target, env = "development", config = {}) {
  const SERVER_OUTPUT = config.output.server
  const CLIENT_OUTPUT = config.output.client

  // const HTML_TEMPLATE = config.entry.htmlTemplate
  const BABEL_ENV = `${config.build.babelEnvPrefix}-${env}-${target}`

  const PROJECT_CONFIG = require(resolve(ROOT, "package.json"))

  const CACHE_HASH_TYPE = "sha256"
  const CACHE_DIGEST_TYPE = "base62"
  const CACHE_DIGEST_LENGTH = 4
  const CACHE_HASH = getHashDigest(JSON.stringify(PROJECT_CONFIG), CACHE_HASH_TYPE, CACHE_DIGEST_TYPE, CACHE_DIGEST_LENGTH)

  const PREFIX = chalk.bold(target.toUpperCase())

  const DEFAULT_LOCALE = config.locale.default
  const SUPPORTED_LOCALES = config.locale.supported

  const isServer = target === "server"
  const isClient = target === "client"

  const isDevelopment = env === "development"
  const isProduction = env === "production"

  // Extract plain languages from configured locales
  const SUPPORTED_LANGUAGES = (() => {
    const languages = new Set()
    for (const entry of SUPPORTED_LOCALES) {
      languages.add(entry.split("-")[0])
    }
    return Array.from(languages.keys())
  })()

  const LEAN_INTL_REGEXP = new RegExp("\\b" + SUPPORTED_LOCALES.join("\\b|\\b") + "\\b")
  const REACT_INTL_REGEXP = new RegExp("\\b" + SUPPORTED_LANGUAGES.join("\\b|\\b") + "\\b")

  const name = isServer ? "server" : "client"
  const webpackTarget = isServer ? "node" : "web"
  const devtool = config.build.enableSourceMaps ? "source-map" : false

  console.log(chalk.underline(`${PREFIX} Configuration:`))
  console.log(`→ Environment: ${env}`)
  console.log(`→ Webpack Target: ${webpackTarget}`)

  if (config.verbose) {
    console.log(`→ Babel Environment: ${BABEL_ENV}`)
    console.log(`→ Enable Source Maps: ${devtool}`)
    console.log(`→ Use Cache Loader: ${config.build.useCacheLoader} [Hash: ${CACHE_HASH}]`)
    console.log(`→ Default Locale: ${DEFAULT_LOCALE}`)
    console.log(`→ Supported Locales: ${SUPPORTED_LOCALES}`)
    console.log(`→ Supported Languages: ${SUPPORTED_LANGUAGES}`)
  }

  const CACHE_LOADER_DIRECTORY = resolve(ROOT, `.cache/loader-${CACHE_HASH}-${target}-${env}`)

  const cacheLoader = config.build.useCacheLoader ? {
    loader: "cache-loader",
    options: {
      cacheDirectory: CACHE_LOADER_DIRECTORY
    }
  } : null

  const cssLoaderOptions = {
    modules: true,
    localIdentName: "[local]-[hash:base62:8]",
    import: false,

    // We are using CSS-O as part of our PostCSS-Chain
    minimize: false,
    sourceMap: config.build.enableSourceMaps
  }

  const postCSSLoaderRule = {
    loader: "postcss-loader",
    query: {
      sourceMap: config.build.enableSourceMaps
    }
  }

  // Just bundle the NodeJS files which are from the local project instead
  // of a deep self-contained bundle.
  // See also: https://nolanlawson.com/2016/08/15/the-cost-of-small-modules/
  const useLightNodeBundle = isDevelopment

  const HMR_MIDDLEWARE = "webpack-hot-middleware/client?path=/__webpack_hmr&timeout=10000&reload=true&noInfo=true&overlay=false"

  const VENDOR_ENTRY = isServer ? config.entry.serverVendor : config.entry.clientVendor
  const MAIN_ENTRY = isServer ? config.entry.serverMain : config.entry.clientMain

  const HAS_MAIN = fs.existsSync(MAIN_ENTRY)

  const WEBPACK_HOOK = config.hook.webpack ? config.hook.webpack : identityFnt

  return WEBPACK_HOOK({
    mode: isDevelopment ? "development" : "production",
    name,
    target: webpackTarget,
    devtool,
    context: ROOT,
    externals: isServer ? getServerExternals(useLightNodeBundle, [ VENDOR_ENTRY, MAIN_ENTRY ]) : undefined,

    entry: {
      main: [
        isClient && isDevelopment ? HMR_MIDDLEWARE : null,
        MAIN_ENTRY
      ].filter(Boolean)
    },

    output: {
      libraryTarget: isServer ? "commonjs2" : "var",
      filename: isDevelopment || isServer ? "[name].js" : "[name]-[chunkhash].js",
      chunkFilename: isDevelopment || isServer ? "[name].js" : "[name]-[chunkhash].js",
      path: isServer ? SERVER_OUTPUT : CLIENT_OUTPUT,

      // This is required for loading dynamic chunks and other files. Should point
      // to the CDN URL if that is used.
      publicPath: config.output.public,

      // Tell webpack to include comments in bundles with information about the
      // contained modules. This option defaults to false and should not be used
      // in production, but it's very useful in development when reading the generated code.
      // https://webpack.js.org/configuration/output/#output-pathinfo
      pathinfo: isDevelopment,

      // Enable cross-origin loading without credentials - Useful for loading files from CDN
      // when React server is hosted on a different domain.
      crossOriginLoading: "anonymous"
    },

    module: {
      rules: [
        {
          test: babelFiles,
          loader: "source-map-loader",
          enforce: "pre",
          options: {
            quiet: true
          },
          exclude: [
            // These packages point to sources which do not exist
            // See also: https://github.com/webpack-contrib/source-map-loader/issues/18
            // Waiting for PR: https://github.com/webpack-contrib/source-map-loader/pull/50
            /intl-/,
            /apollo-/,
            /react-apollo/,
            /zen-observable-ts/
          ]
        },

        // References to images, fonts, movies, music, etc.
        {
          test: assetFiles,
          loader: "file-loader",
          options: {
            name: isProduction ? "file-[hash:base62:8].[ext]" : "[path][name].[ext]",
            emitFile: isClient
          }
        },

        // YAML
        {
          test: /\.(yml|yaml)$/,
          loaders: [ "json-loader", "yaml-loader" ]
        },

        // GraphQL support
        // @see http://dev.apollodata.com/react/webpack.html
        {
          test: /\.(graphql|gql)$/,
          loader: "graphql-tag/loader"
        },

        // Transpile our own JavaScript files using the setup in `.babelrc`.
        {
          test: babelFiles,
          exclude: /node_modules/,
          use:
          [
            // Note:
            // We prefer cache-loader over babel cache mechanism. Reason:
            // "They both serve the same purpose and are interchangeable, with cache-loader being the 'newer and official' way to cache a loader in general"
            cacheLoader,
            {
              loader: "babel-loader",
              options: {
                babelrc: true,
                envName: BABEL_ENV
              }
            }
          ].filter(Boolean)
        },

        // Use either
        {
          test: postcssFiles,
          use: [
            isClient ? ExtractCssChunks.loader : null,
            cacheLoader,
            {
              loader: isClient ? "css-loader" : "css-loader/locals",
              options: cssLoaderOptions
            },
            postCSSLoaderRule
          ].filter(Boolean)
        },

        // Special support for application manifest files
        {
          test: /manifest.json|\.webmanifest$/,
          type: "javascript/auto",
          use: [
            {
              loader: "file-loader",
              options: {
                name: isProduction ? "file-[hash:base62:8].[ext]" : "[path][name].[ext]"
              }
            },
            {
              loader: "app-manifest-loader"
            }
          ]
        },
      ].filter(Boolean)
    },

    plugins: [
      // Completely filter out locale data for locales we definitely do not support
      // This is actually massive for bundling times, bundle sizes and all.
      // Currently supports lean-intl and react-intl. We should propbably add more libraries
      // here over time e.g. momentjs and other locale data dependent stuff.
      new webpack.ContextReplacementPlugin(/lean-intl\/locale-data/, LEAN_INTL_REGEXP),
      new webpack.ContextReplacementPlugin(/react-intl\/locale-data/, REACT_INTL_REGEXP),

      new webpack.DefinePlugin({
        // Important:
        // We keep all these env-variables separate as this allows for
        // parallel usage of libraries like `dotenv` do make non compile-time
        // environment variables accessible.
        "process.env.NODE_ENV": JSON.stringify(env),
        "process.env.BUILD_TARGET": JSON.stringify(webpackTarget)
      }),

      // Generating static HTML page for simple static deployment
      // https://github.com/jantimon/html-webpack-plugin
      /*
      isProduction && isClient ?
        new HtmlWebpackPlugin({
          template: HTML_TEMPLATE
        }) :
        null,
      */

      // Subresource Integrity (SRI) is a security feature that enables browsers to verify that
      // files they fetch (for example, from a CDN) are delivered without unexpected manipulation.
      // https://www.npmjs.com/package/webpack-subresource-integrity
      // Browser-Support: http://caniuse.com/#feat=subresource-integrity
      new SriPlugin({
        hashFuncNames: [ "sha256", "sha512" ],
        enabled: isProduction && isClient
      }),

      // Improve OS compatibility
      // https://github.com/Urthen/case-sensitive-paths-webpack-plugin
      new CaseSensitivePathsPlugin(),

      // Custom progress plugin
      process.stdout.isTTY ? new VerboseProgress({
        prefix: PREFIX
      }) : null,

      // Analyse bundle in production
      isClient && isProduction ? new BundleAnalyzerPlugin.BundleAnalyzerPlugin({
        analyzerMode: "static",
        defaultSizes: "gzip",
        logLevel: "silent",
        openAnalyzer: false,
        reportFilename: "report.html"
      }) : null,

      // Analyse bundle in production
      isServer && isProduction ? new BundleAnalyzerPlugin.BundleAnalyzerPlugin({
        analyzerMode: "static",
        defaultSizes: "parsed",
        logLevel: "silent",
        openAnalyzer: false,
        reportFilename: "report.html"
      }) : null,

      // Let the server side renderer know about our client side assets
      // https://github.com/FormidableLabs/webpack-stats-plugin
      isProduction && isClient ? new StatsPlugin("stats.json") : null,

      isClient ? new ExtractCssChunks({
        filename: isDevelopment ? "[name].css" : "[name]-[contenthash:base62:8].css",
        hot: isDevelopment
      }) : null,

      isClient && isDevelopment ? new webpack.HotModuleReplacementPlugin() : null
    ].filter(Boolean)
  }, {
    isServer,
    isClient,
    isProduction,
    isDevelopment
  })
}
