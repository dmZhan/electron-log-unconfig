'use strict';

var fs = require('fs');
var path = require('path');
var os = require('os');
var util = require('util');
var transform = require('../../transform');
var FileRegistry = require('./file').FileRegistry;
var variables = require('./variables');
var electronApi = require('../../electronApi');
var template = require('../../transform/template');

module.exports = fileTransportFactory;

// Shared between multiple file transport instances
var globalRegistry = new FileRegistry();
// 支持的配置文件名
var configFileNames = ['.logrc', '.logrc.json'];

function fileTransportFactory(electronLog, customRegistry) {
  var pathVariables = variables.getPathVariables(process.platform);

  var registry = customRegistry || globalRegistry;
  if (registry.listenerCount('error') < 1) {
    registry.on('error', function (e, file) {
      logConsole('Can\'t write to ' + file, e);
    });
  }

  /* eslint-disable no-multi-spaces */
  transport.archiveLog   = archiveLog;
  transport.depth        = 5;
  transport.fileName     = getDefaultFileName();
  transport
    .format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}]{scope} {text}';
  transport.getFile      = getFile;
  transport.level        = 'silly';
  transport.maxSize      = 1024 * 1024;
  transport.readAllLogs  = readAllLogs;
  transport.resolvePath  = resolvePath;
  transport.sync         = true;
  transport.writeOptions = {
    flag: 'a',
    mode: 438, // 0666
    encoding: 'utf8',
  };
  transport.inspectOptions = {};

  initDeprecated();

  return transport;

  function transport(message) {
    var file = getFile(message);

    var needLogRotation = transport.maxSize > 0
      && file.size > transport.maxSize;

    if (needLogRotation) {
      transport.archiveLog(file);
      file.reset();
    }

    var scopeOptions = electronLog.scope.getOptions();
    var inspectOptions = Object.assign(
      { depth: transport.depth },
      transport.inspectOptions
    );
    var content = transform.transform(message, [
      transform.removeStyles,
      transform.customFormatterFactory(transport.format, false, scopeOptions),
      transform.concatFirstStringElements,
      transform.toStringFactory(inspectOptions),
    ]);

    file.writeLine(content);
  }

  function archiveLog(file) {
    var oldPath = file.toString();
    var inf = path.parse(oldPath);
    try {
      fs.renameSync(oldPath, path.join(inf.dir, inf.name + '.old' + inf.ext));
    } catch (e) {
      logConsole('Could not rotate log', e);
      var quarterOfMaxSize = Math.round(transport.maxSize / 4);
      file.crop(Math.min(quarterOfMaxSize, 256 * 1024));
    }
  }

  function logConsole(message, error) {
    var data = ['electron-log.transports.file: ' + message];

    if (error) {
      data.push(error);
    }

    electronLog.transports.console({
      data: data,
      date: new Date(),
      level: 'warn',
    });
  }

  function getFile(msg) {
    var vars = Object.assign({}, pathVariables, {
      fileName: transport.fileName,
    });

    var filePath = transport.resolvePath(vars, msg);
    if (typeof filePath === 'object') {
      const p = path.resolve(filePath.prefix + resolveNumber(filePath.curNum, filePath.countLength) + filePath.suffix);
      const fileP = registry.provide(p, transport.writeOptions, !transport.sync);
      if (fileP.size >= filePath.maxSize * 1024) {
        return registry.provide(path.resolve(filePath.prefix + resolveNumber(filePath.curNum + 1, filePath.countLength) + filePath.suffix), transport.writeOptions, !transport.sync);
      }
      return registry.provide(p, transport.writeOptions, !transport.sync);
    }
    return registry.provide(filePath, transport.writeOptions, !transport.sync);
  }

  /**
   * @param {PathVariables} vars
   */
  function resolvePath(vars) {
    return getConfigs() || path.join(vars.libraryDefaultDir, vars.fileName);
  }

  function readAllLogs(options) {
    var fileFilter = options && typeof options.fileFilter === 'function'
      ? options.fileFilter
      : function (fileName) { return fileName.endsWith('.log') };

    var vars = Object.assign({}, pathVariables, {
      fileName: transport.fileName,
    });
    var logsPath = path.dirname(transport.resolvePath(vars));

    return fs.readdirSync(logsPath)
      .map(function (fileName) { return path.join(logsPath, fileName) })
      .filter(fileFilter)
      .map(function (logPath) {
        try {
          return {
            path: logPath,
            lines: fs.readFileSync(logPath, 'utf8').split(os.EOL),
          };
        } catch (e) {
          return null;
        }
      })
      .filter(Boolean);
  }

  function initDeprecated() {
    var isDeprecatedText = ' is deprecated and will be removed in v5.';
    var isDeprecatedProp = ' property' + isDeprecatedText;

    Object.defineProperties(transport, {
      bytesWritten: {
        get: util.deprecate(getBytesWritten, 'bytesWritten' + isDeprecatedProp),
      },

      file: {
        get: util.deprecate(getLogFile, 'file' + isDeprecatedProp),
        set: util.deprecate(setLogFile, 'file' + isDeprecatedProp),
      },

      fileSize: {
        get: util.deprecate(getFileSize, 'file' + isDeprecatedProp),
      },
    });

    transport.clear = util.deprecate(clear, 'clear()' + isDeprecatedText);
    transport.findLogPath = util.deprecate(
      getLogFile,
      'findLogPath()' + isDeprecatedText
    );
    transport.init = util.deprecate(init, 'init()' + isDeprecatedText);

    function getBytesWritten() {
      return getFile().bytesWritten;
    }

    function getLogFile() {
      return getFile().path;
    }

    function setLogFile(filePath) {
      transport.resolvePath = function () {
        return filePath;
      };
    }

    function getFileSize() {
      return getFile().size;
    }

    function clear() {
      getFile().clear();
    }

    function init() {}
  }
}

function getDefaultFileName() {
  switch (process.type) {
    case 'renderer': return 'renderer.log';
    case 'worker': return 'worker.log';
    default: return 'main.log';
  }
}

function getConfigs() {
  const p = configFileNames.find(i => {
    return fs.existsSync(path.join(electronApi.getAppPath() || '', '../..', i));
  });

  if (p) {
    const {
      segmentation = false,
      maxSize = 1024,
      filePath = null,
      fileName = null,
      prefixPkgName = false,
      countLength = 3,
    } = JSON.parse(fs.readFileSync(path.join(electronApi.getAppPath() || '', '../..', p)));
    // fileName: SMSC-{y}-{m}-{d}
    if (segmentation && filePath && fileName) {
      const existP = path.join(filePath, template.generateFileNameFromTemp(prefixPkgName ? electronApi.getName() + fileName : fileName, new Date()));

      if (fs.existsSync(filePath) && fs.lstatSync(filePath).isDirectory()) {
        // existP as D:/log/SMSC-2024-1-21
        const nums = fs.readdirSync(filePath, { encoding: 'utf8' }).filter(i => {
          const pp = path.join(filePath, i);
          return fs.lstatSync(pp).isFile() && pp.startsWith(existP) && pp.endsWith('.log');
        }).map(j => {
          const pp = path.join(filePath, j);
          return Number(pp.replace(existP, '').replace('.log', ''));
        }).filter(i => !Number.isNaN(i));

        return {
          prefix: existP,
          curNum: nums.length ? Math.max(...nums) : 1,
          suffix: '.log',
          maxSize,
          countLength,
        };
      }
      return {
        prefix: existP,
        curNum: 1,
        suffix: '.log',
        maxSize,
        countLength,
      };
    }
  } else if (electronApi.isDev()) {
    const pkg = path.join(electronApi.getAppPath() || '', '../..', 'package.json');

    if (fs.existsSync(pkg)) {
      const {
        '.logrc': {
          segmentation = false,
          maxSize = 1024,
          filePath = null,
          fileName = null,
          prefixPkgName = false,
          countLength = 3,
        } = {},
      } = JSON.parse(fs.readFileSync(pkg, 'utf8'));

      if (segmentation && filePath && fileName) {
        const existP = path.join(filePath, template.generateFileNameFromTemp(prefixPkgName ? electronApi.getName() + fileName : fileName, new Date()));

        if (fs.existsSync(filePath) && fs.lstatSync(filePath).isDirectory()) {
          // existP as D:/log/SMSC-2024-1-21
          const num = Math.max(...fs.readdirSync(filePath, { encoding: 'utf8' }).filter(i => {
            const pp = path.join(filePath, i);
            return fs.lstatSync(pp).isFile() && pp.startsWith(existP) && pp.endsWith('.log');
          }).map(j => {
            const pp = path.join(filePath, j);
            return Number(pp.replace(existP, '').replace('.log', ''));
          }).filter(i => !Number.isNaN(i)));

          if (num) {
            return {
              prefix: existP,
              curNum: num,
              suffix: '.log',
              maxSize,
              countLength,
            };
          }
        }
        return {
          prefix: existP,
          curNum: 1,
          suffix: '.log',
          maxSize,
          countLength,
        };
      }
    }
  }
  return undefined;
}

function resolveNumber(num, len) {
  const n = Math.floor(num).toString().length;
  return '0'.repeat(len - n);
}
