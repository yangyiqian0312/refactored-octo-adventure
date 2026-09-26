# 本机打印工作台

这个网页直接控制本机 Windows 打印代理。保留原来的左对齐标签格式，使用 Windows 默认打印机。

## 启动

1. 安装依赖：`pnpm install`，按 `.env.example` 配置订单服务器及 token。
2. 先关闭旧版打印代理窗口，避免两个代理收到同一单后重复出纸。
3. 运行 `pnpm print-console`，打开 <http://127.0.0.1:3002/print-control>。
4. 下拉选择“店铺 / 打印仓库”。程序恢复上次保存的选择；首次启动使用环境变量指定的店铺与仓库，否则使用首个完整配置。身份核对通过后才允许出纸。
5. 初次建议使用 `PRINT_AGENT_DRY_RUN=true`，点击“生成测试预览”。预览 HTML 默认保存在系统临时目录的 `live-alert-labels` 中，不会出纸。
6. 正式打印时设置 `PRINT_AGENT_DRY_RUN=false`，重启代理。Windows 默认打印机应为标签打印机。

PowerShell 如果禁止运行 `pnpm.ps1`，使用 `pnpm.cmd print-console`。

仍可使用原来的 `pnpm print-agent:warehouse-758` / `pnpm print-agent:warehouse-749` 命令预选仓库。它们也会启动本机管理接口；首次使用请先 `pnpm build` 构建网页。一个端口只允许一个代理启动。

## 功能及状态含义

- Order printing 直接显示 History 和搜索，不展示 Waiting to print 标签、待处理数量或其他仓库等待数量。后台仍按顺序处理已经收到的 API 订单，界面不预测后续号码。

- 顶部只显示所选仓库最近成功处理的 `Last print number`，失败任务不会覆盖它。预览模式仍明确标记不出纸。
- History 默认打开，仅显示 Number、Username、Status。绿色 `Printed` 表示系统打印接口成功接受任务，红色 `Failed` 表示付款暂挂或打印失败，黄色 `Fixed` 表示曾失败的订单补打成功，或已有号码顺序逻辑识别出的补打。预览保持 `Preview ready`，不冒充真实出纸。
- 未付款和付款失败在右侧统一为“号码 + Failed”，不再提供状态筛选。同一订单从付款暂挂到成功补打时，原 History 行更新为 Fixed；关联使用完整内部订单标识，不能仅凭 A123 或订单尾号合并。付款状态移出暂挂列表不等于补打成功。
- Username 只接受安全的账号形式，包含空格、邮箱或疑似电话号码的值回退到 Someone。商品或取货码缺失时显示 `—`，不会编造号码。

- 右上角点击“中文 / EN”切换界面语言，浏览器会记住选择；按钮、状态、提示和时间格式随语言更新。订单商品名和实际打印标签内容保持原样。

- 下拉框同时切换店铺和仓库。跨店时断开旧连接，等待已开始的一张完成，使用新店铺的 token 和服务器地址重新认证。收到的旧店铺队列留在各自内存中；切回并验证身份后才能继续处理。
- 点击 ⏸ 暂停打印，暂停后点击 ▶ 继续；悬停提示随中英文选择切换。暂停只阻止后续任务，不撤回已交给系统的任务。正式模式不再显示“本机打印”标签。
- Last print number 只显示所选仓库最近成功提交的号码，不显示正在处理或失败的号码。
- “已提交打印机”是 Windows 打印接口接受任务，不保证已经出纸；缺纸或脱机请查看系统打印队列。
- 打印异常会暂停队列，保留失败记录。因为超时也可能发生在系统已接单之后，代理不会自动重试该张，避免重复标签。检查系统队列后再继续后续任务。
- 每张订单都必须匹配当前店铺的 shop ID 和允许的仓库 ID，新版服务还检查认证返回的 store ID。其他店铺的消息、旧连接的迟到消息不能触发打印。History、Failed、Last print number 和去重都按店铺隔离。

## 两家店的独立连接配置

Otaku 和 Crossing TCG 不共享连接 token。浏览器只接收店铺名、配置 ID 和仓库，不接收 token 或 TikTok 凭据。

```dotenv
# 与云端店铺配置的实际 ID 保持一致，不要从旧标签规则猜测店铺身份。
PRINT_AGENT_OTAKU_SHOP_ID=<Otaku 的实际 shop ID>
PRINT_AGENT_OTAKU_WAREHOUSE_IDS=<Otaku 的仓库 ID，可逗号分隔>
PRINT_AGENT_CROSSING_SHOP_ID=<Crossing TCG 的实际 shop ID>
PRINT_AGENT_CROSSING_WAREHOUSE_IDS=<Crossing TCG 的仓库 ID，可逗号分隔>
```

- Otaku 使用 `PRINT_AGENT_OTAKU_TOKEN`，未填写时使用 `TIKTOK_STORE2_OVERLAY_TOKEN`。
- Crossing 使用 `PRINT_AGENT_CROSSING_TOKEN`，未填写时使用 `TIKTOK_STORE3_OVERLAY_TOKEN`。
- shop ID 未指定时分别使用 `TIKTOK_STORE2_SHOP_ID` / `TIKTOK_STORE3_SHOP_ID`。缺少店铺 ID 或 token 的配置不会成为可选项。不能把单个旧 `PRINT_AGENT_TOKEN` 自动套用到两家店。
- 可分别设置 `PRINT_AGENT_OTAKU_SERVER_URL` / `PRINT_AGENT_CROSSING_SERVER_URL`；否则使用公共 `PRINT_AGENT_SERVER_URL`。
- TikTok access token、refresh token 和 shop cipher 仍保留在云端对应店铺配置中。客户端切换的是认证身份，云端按该身份选择各店独立的 TikTok API 客户端，不把 TikTok 密钥下载到本机网页。
- 新后端提供认证的 `GET /api/print-identity` 并校验 Socket.IO `auth.shopId`，返回实际 store/shop 和允许仓库。配置不符时停止打印，不能仅因 Socket 已连接就认为身份正确。
- 对未部署新接口的旧后端，只有接口返回 404 时才只读检查该 token 可见的历史 webhook 店铺 ID。必须有实际事件且全部匹配预期店铺，否则停止打印。这个兼容核对不能验证仓库归属；仍严格检查每条打印任务的 shop ID 与仓库 ID。云端 `LABEL_PRINT_SHOP_ID* / LABEL_PRINT_WAREHOUSE_ID*` 也必须正确配对，客户端选择不会替云端修改这些规则。

最后选择保存在 `PRINT_AGENT_OUTPUT_DIR/print-selection.json`（默认系统临时目录 `live-alert-labels`），只保存店铺配置 ID 和仓库 ID。优先级为显式 `--warehouse` > 已保存选择 > `PRINT_AGENT_PROFILE_ID` / `PRINT_AGENT_WAREHOUSE_ID` > 首个完整配置。过期或损坏的保存文件会阻止启动，修正配置或删除该选择文件后再启动。更改店铺的真实凭据后需重启代理。

## Order payment failed / 暂未打印

云端新增 `print:context` 和 `print:payment-holds` 事件。需要部署本次 `apps/server` 改动，旧版云服务不会提供这一栏的数据。重连时服务器发送当前内存中的付款待处理列表。

界面按业务操作统一把 `UNPAID` 和付款失败标为 `Failed`，底层仍保留原始状态；`UNPAID` 本身不能证明付款被拒绝。`PAYMENT_FAILED` / `ORDER_PAYMENT_FAILED` 仅作为本地测试或未来适配器的明确失败状态输入；未声称它们是官方 TikTok webhook 枚举。上线前应通过 [TikTok Shop Order status change 文档](https://partner.tiktokshop.com/docv2/page/order-status-change) 与真实脱敏事件确认店铺可用的付款失败字段和事件订阅。目前官方文档页面需要 JavaScript / 登录，未据此臆造新的支付失败 webhook。

待付款/失败事件只进入此栏，不发打印任务。收到后续非付款等待状态时移除此栏，只有现有 `AWAITING_SHIPMENT` 逻辑会尝试按仓库规则打印。详情接口不可用或缺少凭据时仍保留状态；商品、号码或仓库显示“待同步/待确认”。未知仓库订单保留显示，避免静默隐藏。

没有收到事件不代表平台没有未付款订单。此版本不抓取 TikTok 页面，不保证获取买家尚未生成订单的支付失败尝试，也不回补历史未付款订单。

## 本地验证

1. `pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm lint`。
2. 预览模式选择一个仓库，点击“生成测试预览”，检查处理记录为“预览已生成”。
3. 点击暂停，再生成两个预览任务，确认排队；继续后应依次处理。
4. 暂停时为仓库 A 生成任务，切至仓库 B，确认 A 的任务留存且未被 B 打印；切回 A 并继续。
5. 本地后端设置 `TIKTOK_WEBHOOK_VERIFY_BYPASS=true`（仅本地），发送测试 webhook：

```powershell
$body = @{ event_id = 'demo-unpaid'; data = @{ order_id = 'demo-order-1'; order_status = 'UNPAID' } } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri http://localhost:3001/webhooks/tiktok -ContentType 'application/json' -Body $body
```

代理必须连接该本地后端，并使用同一店铺的 token。付款栏及 History 应出现红色 Failed，不产生标签；再发送该订单的 `AWAITING_SHIPMENT` 事件，它会移出付款栏。只有补打成功后 History 原行才更新为黄色 Fixed；缺少订单详情、仓库、SKU 时保留 Failed，不假装已经打印。可用两个不同完整订单 ID、相同号码验证不会错误合并。

## 当前限制

### Otaku 有订单但无打印记录时

兼容旧版空历史时，页面显示“等待店铺订单确认”。代理也可用同一已认证 Socket.IO 连接收到的真实 `label:print` 任务核对身份：必须匹配所选店铺与配置仓库，并通过令牌认证的历史接口；随后检查缓冲任务的 store ID 一致性才允许打印。401、历史中的其他店铺 ID 或新版身份接口不匹配均不能被任务证据覆盖。本地 demo 不能作为证据。

旧云端重启后历史会清空，且没有 `/api/print-identity` 接口，此时无法从历史核对店铺身份。本机保持停止打印，每 5 秒重新核对一次；收到可验证的历史后恢复，期间同一连接收到的有效打印任务暂存，核对成功后再执行。切换店铺或停止代理会使旧重试失效。部署新版身份接口可避免依赖订单历史。

先检查 Render 的 `label print job skipped` 日志：`shopId`、`warehouseId`、`printRuleMatched` 以及字段完整性标记。云端能收到 webhook 和生成 alert，不代表已生成 `label:print` 任务；本机 History 不会显示云端未下发的任务。

2026-09-26 的实际订单日志已确认 Otaku 店铺 ID 是 `7495169240868424019`，仓库 ID 是 `7499833317727225642`。旧店铺 ID `7495180900215261343` 和旧仓库 ID `7263214411597498155` 均不匹配。Render 必须将 `LABEL_PRINT_SHOP_ID_2` 与 `LABEL_PRINT_WAREHOUSE_ID_2` 更新为这组实际值；仅更新本机代码不会修改云端变量。新代码未显式设置打印店铺时优先使用 `TIKTOK_STORE2_SHOP_ID`，并保留店铺与仓库的双重校验。本机 `PRINT_AGENT_OTAKU_WAREHOUSE_IDS` 和已保存选择也须同步更新。

上线核验：更新云端变量并部署后，用 Otaku 凭据访问 `/api/print-identity`，确认店铺和仓库；再核对一笔新订单从 `label print job emitted` 到本机 History 和实际出纸。旧版本该接口返回 404。现有漏单没有自动回放，需要单独核对后补打，不能通过重复创建测试订单代替真实订单恢复。

- 打印队列、去重和记录是单次运行内存状态，按店铺隔离。重启清空；每家店处理记录最多显示最近 100 条。店铺与仓库选择单独保存，可跨重启恢复。
- 云端订单发送目前没有持久化回放，断线期间或切至其他店铺期间的打印订单不自动补取；已收到的队列仍保留。开始营业前应确认当前店铺和连接；不要在有待打印任务时关闭代理。
- 本机接口只绑定 `127.0.0.1`，限制 Host 和写请求的 Origin，不把云端 token 发给网页。不支持直接从 Vercel 页面控制本机打印；请打开上面的本机地址。
- 此页不用于 OBS。OBS 继续使用原来的 `/overlay` 地址。

环境变量新增 `PRINT_AGENT_UI_PORT=3002`；`PRINT_AGENT_WAREHOUSE_ID` 可预选仓库，其余沿用现有配置。
