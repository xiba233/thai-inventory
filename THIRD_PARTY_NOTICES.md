# 运行组件与许可证

本项目使用 Pyodide 0.28.3，在浏览器中运行原有 Python、SQLite 和 Excel 解析功能。

上游代码与许可证：

- Pyodide：Mozilla Public License 2.0；https://github.com/pyodide/pyodide/tree/0.28.3 。
- CPython：Python Software Foundation License；https://docs.python.org/3/license.html 。
- SQLite：Public Domain；https://sqlite.org/copyright.html 。
- openpyxl：MIT；许可证位于 `business.zip/licenses/openpyxl-LICENCE.rst`。
- et_xmlfile：MIT；许可证位于 `business.zip/licenses/et_xmlfile-LICENCE.rst`。
- tzdata：Apache 2.0，时区数据库为 Public Domain；许可证包含在对应 wheel 中。

原始下载地址及逐文件 SHA256 位于 `运行组件来源.json`；wheel 的校验值与 Pyodide 锁定清单一致。本站供应完整运行文件，用户业务数据不传给这些上游服务。
