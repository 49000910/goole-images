# ocr-mes-tool —— OCR 规则维护 + MES+ 查询

拍照/图片里的关键字段(工单号、序列号、物料、批号……)通过 **OCR 自动提取**,
按 **固定维护的规则** 匹配校验,再 **调用 MES+ 查询接口** 核对,结果落盘 JSON。
整套依赖已打包进 `wheels/`,产线机器**不联网也能装**。

```
图片 ──> RapidOCR(离线) ──> 规则匹配/校验(rules/rules.yaml) ──> MES+ 查询接口 ──> 控制台 + out/*.json
```

## 目录结构

```
ocr-mes-tool/
├── main.py                 # 运行入口:python main.py 图片...
├── rule_manager.py         # 规则维护入口:python rule_manager.py --help
├── config.yaml             # 全局配置(MES+ 地址/鉴权/OCR 参数)——现场部署只改这里
├── rules/rules.yaml        # ★ OCR 规则库(固定维护文件,唯一维护入口)
├── ocr_mes/                # 核心代码
│   ├── ocr_engine.py       #   RapidOCR 封装(模型随包内置,离线可用)
│   ├── rule_engine.py      #   规则匹配 + 校验引擎
│   ├── mes_client.py       #   MES+ 查询客户端(可配鉴权、mock、重试)
│   └── pipeline.py         #   主流程串联
├── tests/                  # 端到端验证(生成样例标签图 → 全流程断言)
├── samples/                # 样例标签图
├── scripts/                # 依赖打包 + 离线安装脚本
└── wheels/                 # ★ 全部依赖 wheel(离线包,Windows 64 位 / CPython 3.14)
```

## 快速开始

### 方式一:目标机不联网(推荐,依赖已打包)

```bat
:: 1. 装好 Python 3.14(64 位)后,双击或执行:
scripts\install_offline.bat

:: 2. 验证(mock 模式,不发真实请求):
python main.py samples\sample_label.png
```

> wheels/ 里的二进制包对应 **Windows 64 位 + CPython 3.14**。
> 目标机是其他 Python 版本时,在联网机器上执行
> `python scripts\download_deps.py --python-version 311`(例)重新打包即可。

### 方式二:目标机可联网

```bash
python -m pip install -r requirements.txt
python main.py samples/sample_label.png
```

## 规则维护(固定维护规约)

**规约(必须遵守):**

1. `rules/rules.yaml` 是 OCR 规则的**唯一维护入口**,禁止在代码里写死规则;
2. 所有增删改一律通过 `python rule_manager.py ...` 进行(保留注释与格式);
3. 任何修改必须 **git 提交留痕**,便于追溯谁在何时改了哪条规则;
4. 提交前先跑 `python rule_manager.py test <规则ID> --text "..."` 和
   `python rule_manager.py check`。

**常用命令:**

```bash
python rule_manager.py list                      # 全部规则一览
python rule_manager.py show work_order_no        # 看单条规则
python rule_manager.py add --id sn_v2 --name 新序列号 \
       --match-type regex --pattern "SN[:：]?\s*([A-Z0-9]{8,24})" \
       --v-length 8:24 --mes-field sn --required # 新增规则
python rule_manager.py update work_order_no --pattern "..."   # 改规则
python rule_manager.py enable/disable 批次号对应ID             # 启用/停用(推荐停用而非删除)
python rule_manager.py delete 旧规则 --yes                     # 删除
python rule_manager.py test work_order_no --text "工单号: WO-20260925-001"   # 文本测试
python rule_manager.py test work_order_no --image 某图.jpg      # 走真实 OCR 测试
python rule_manager.py check                     # 规则文件体检(重复ID/正则可编译等)
```

**规则字段速查**(`rules/rules.yaml` 内有完整注释):

| 字段 | 说明 |
|---|---|
| `match.type` | `regex`(全文正则取捕获组)/ `after_keyword`(关键字后取值)/ `contains`(存在性) |
| `match.group` | regex 取第几个捕获组,默认 1 |
| `validate` | 叠加校验:`regex` 格式 / `length` 长度 / `choices` 枚举 / `numeric` 数值范围 |
| `required` | 必填字段识别不到时,整体结果判"存在问题" |
| `mes_query.field` | 提取值送去 MES+ 查询用的字段名;留空则只提取不查询 |

## 对接真实 MES+(上线必改 `config.yaml`)

```yaml
mes_plus:
  mock: false                                        # 1. 关掉 mock
  base_url: "http://现场MES服务器地址"                 # 2. 现场地址
  query_path: "/api/v1/query?field={field}&value={value}"   # 3. 真实接口,{field}/{value} 自动替换
  auth:
    type: bearer                                     # 4. bearer / basic / none
```

鉴权凭据走**环境变量**,严禁写进仓库:

```bat
set MES_PLUS_TOKEN=令牌          :: bearer
set MES_PLUS_USER=账号           :: basic(另需 MES_PLUS_PASSWORD)
```

运行:`python main.py 图片.jpg --real`

接口的具体路径与返回结构请向 MES+ 系统管理员确认;若返回是
`{"code":0,"message":"ok","data":{...}}` 以外的结构,改 `mes_client.py::_parse`
里的业务码判断即可(已集中在唯一一处)。

## 运行结果

每张图输出一份 `out/result_<图片名>_<时间戳>.json`,含 OCR 原文行、字段提取、
校验、MES+ 返回;控制台同步打印人读摘要,整体结论为"通过 / 存在问题"。

## 本地验证

```bash
python tests/test_pipeline.py    # 生成样例标签图 → OCR → 规则 → mock MES+ 全链路断言
```
