# Swap 端到端验证清单 (Prompt 5)

部署完成后按此清单验证。

## 1. 确认合约有代码

```bash
# 替换 <address> 为 deployed-addresses.json 中的任一项
curl -s -X POST https://testnet-rpc.monad.xyz \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_getCode","params":["<address>","latest"],"id":1}'
```

结果不应为 `"0x"`（空代码）。

## 2. 确认池子存在且有流动性

- 调用 `Factory.getPool(USDC, WMON, 3000)` 确认返回非零地址
- 调用 Pool 的 `slot0()` 确认 `sqrtPriceX96` 非零
- 调用 Pool 的 `liquidity()` 确认流动性 > 0

（若部署脚本在 NFPM 步骤失败，则尚未创建池子/加流动性，需先完成 deploy.mjs 全流程。）

## 3. 测试 Quote

前端输入 1 USDC，应能看到对应 MON 数量（约 2.5 MON）。若 Quote 为 null / "pool may not exist"：

- 检查 QuoterV2 地址与 useQuote 中 ABI、fee 3000
- 确认 Factory 与 Pool 地址一致

## 4. 测试 Swap

- 水龙头领取 MON，TestUSDC.mint 领取 USDC
- 执行 USDC → MON swap
- 确认交易成功、余额变化正确

## 当前部署状态

- WMON / TestUSDC / Factory / SwapRouter / QuoterV2 已部署并写入 `deployed-addresses.json`
- 若 NFPM 部署失败：可重跑 `node deploy.mjs`（已为 NFPM 设置 gas 上限），或单独部署 NFPM 后手动执行创建池子 + 初始化 + 添加流动性
