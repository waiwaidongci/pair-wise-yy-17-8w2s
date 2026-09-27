# 钟乳石洞穴微环境巡测

## 启动

```bash
npm install
npm start
```

默认地址：http://localhost:3912

数据保存在`data/db.json`，后续可以继续增量迭代。

## 换班分层巡测与调风闭环

针对讲解换班时上下风段温差大、接队拿不准能否进洞的问题：

1. **两层读数**：在「换班分层读数」按层位（上风段/下风段）分别登记，记录风向、温湿度与离场时间。
2. **自动建单**：同一样点两层读数齐全后，温差超过样点「温差限值」或下风段湿度低于「基准湿度」，自动建立「待调风」记录；同一样点记录未结束前再次触发只累加次数，不重复建单。
3. **调风与复测**：在「调风记录」登记调风人后进入「复测中」，30 分钟后由**另一位巡测员**（不能是调风人或原巡测员）复测两层；两层都恢复才结束，未恢复则继续累加并顺延 30 分钟。
4. **重判**：样点基准或原巡测读数被修改（卡片「编辑」）后，未结束记录按新值自动重判，恢复则结束；履历只增不删，旧记录完整保留。
5. **看板**：「趋势看板」展示当前未结束的调风记录，含当前温差、触发次数与最近复测人。

## 主要接口

- `POST /api/shift-readings` 登记分层读数（自动评估触发）
- `POST /api/vent-adjusts/:id/adjust` 登记调风（body: `adjustBy`，可选 `adjustAt`）
- `POST /api/vent-adjusts/:id/recheck` 复测（body: `recheckBy`、`upperTemp`、`upperHumidity`、`lowerTemp`、`lowerHumidity`，可选 `recheckAt`）
- `PATCH /api/sites/:id`、`PATCH /api/shift-readings/:id` 修改基准或原读数（自动重判未结束记录）
