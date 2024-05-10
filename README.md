# electron-log

[![NPM version](https://img.shields.io/npm/v/electron-log-unconfig)](https://www.npmjs.com/packages/electron-log-unconfig)

## Declare

Forked from [`electron-log`](https://github.com/megahertz/electron-log/tree/v4.4.8)@4.4.8

### changes in this fork

- You can add a `.logrc` or `.logrc.json` file in the project root directory and configure the log output method.
- You can add a `.logrc` field to `package.json` and configure the log output method.
- If you don't add config file or field, it works as normal `electron-log`.

## Usage

```bash
npm install electron-log-unconfig -D
```

And then you can add a config file named `.logrc` or `.logrc.json` to root or add a `.logrc` field to `package.json`.

### Options

Both config file and field have samed options.

```json
{
  "filePath": "D:/logs",
  "fileName": "Test-{y}-{m}-{d}",
  "maxSize": 100,
  "segmentation": true
}
```

#### filePath

- Required: `false`
- Type: `string`

The log output path.

#### fileName

- Required: `false`
- Type: `string`

File name's template. It will replace with date.

For example(Today is 2024/2/1):

```txt
Test-{y}-{m}-{d}      ->  filename: Test-2024-2-1.log
Test-{y}-{m}          ->  filename: Test-2024-2.log
Test-{y}              ->  filename: Test-2024.log
Test-{y}-AA{m}-BB{d}  ->  filename: Test-2024-AA2-BB1.log
```

#### maxSize

- Required: `false`
- Type: `number`
- Default: `1024`

Single file's size. The unit ofmeasurement is magabytes.

#### segmentation

- Required: `false`
- Type: `boolean`
- Default: `false`

Whether to enable file splitting.

## Future

Maybe i will rewrite electron-log.But for now i'm just going to add a few methods to meet my needs.
