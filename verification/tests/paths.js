// verification/tests 共享路径解析：发布包内可移植（不依赖开发机绝对路径）
// 用法：const { CLIENT_SRC, HOST_MODULE, DEMO_SCRIPT } = require('./paths')
'use strict'
const path = require('path')

// 本文件位于 <发布包>/verification/tests/ 下
const testsDir = __dirname
const publishRoot = path.resolve(testsDir, '../..')

module.exports = {
  // renpy-client/lib/client.js 源码文本（客户端 bundle，测试用 readFileSync 提取纯函数）
  CLIENT_SRC: path.join(publishRoot, 'renpy-client', 'lib', 'client.js'),
  // renpy-client/lib/host.js（CJS 模块，可直接 require）
  HOST_MODULE: path.join(publishRoot, 'renpy-client', 'lib', 'host.js'),
  // renpy-client/lib/renpy-core.js（共享纯函数模块）
  CORE_MODULE: path.join(publishRoot, 'renpy-client', 'lib', 'renpy-core.js'),
  // 验证项目 demo-script（lint/行为验证）
  DEMO_SCRIPT: path.join(publishRoot, 'verification', 'projects', 'demo-script'),
  // eq-test（Python 等价形式验证）
  EQ_TEST: path.join(publishRoot, 'verification', 'projects', 'eq-test'),
  // host.apply 的最小 config（测试不跑真实 SDK，仅需通过初始化；sdkPath 指向 SDK 占位）
  HOST_CONFIG: { sdkPath: '<sdk-required>', userDir: path.join(publishRoot, 'verification', '.test-user'), skillRoot: path.join(publishRoot, 'skills') },
}
