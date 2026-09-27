const express = require('express');
const fs = require('fs/promises');
const path = require('path');

const app = express();
const config = require('./project.config');
const PORT = process.env.PORT || config.port || 3900;
const DB_FILE = path.join(__dirname, 'data', 'db.json');

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

async function readDb() {
  const raw = await fs.readFile(DB_FILE, 'utf8');
  return JSON.parse(raw);
}

async function writeDb(db) {
  await fs.writeFile(DB_FILE, JSON.stringify(db, null, 2) + '\n');
}

function stamp(action, note) {
  return {
    at: new Date().toISOString(),
    action,
    note: note || ''
  };
}

const RECHECK_INTERVAL_MS = 30 * 60 * 1000;

function round1(value) {
  return Math.round(value * 10) / 10;
}

function latestReading(db, siteId, layer) {
  return (db['shift-readings'] || [])
    .filter((entry) => entry.siteId === siteId && entry.layer === layer)
    .sort((a, b) => new Date(b.departAt || b.createdAt || 0) - new Date(a.departAt || a.createdAt || 0))[0];
}

// 汇总样点最新两层读数，判断是否触发待调风条件
function evaluateLayers(db, siteId) {
  const site = (db.sites || []).find((entry) => entry.id === siteId);
  if (!site) return null;
  const upper = latestReading(db, siteId, '上风段');
  const lower = latestReading(db, siteId, '下风段');
  if (!upper || !lower) return null;
  const tempDiff = round1(Math.abs(Number(upper.temperature) - Number(lower.temperature)));
  const triggers = [];
  if (Number.isFinite(Number(site.tempDiffLimit)) && tempDiff > Number(site.tempDiffLimit)) triggers.push('温差超限');
  if (Number.isFinite(Number(site.baselineHumidity)) && Number(lower.humidity) < Number(site.baselineHumidity)) triggers.push('下层湿度下降');
  return { site, upper, lower, tempDiff, triggers };
}

function openAdjust(db, siteId) {
  return (db['vent-adjusts'] || []).find((entry) => entry.siteId === siteId && entry.status !== '已结束');
}

// 新读数入库后评估：同一样点未结束前只累加次数，不重复建单
function applyTrigger(db, siteId) {
  const result = evaluateLayers(db, siteId);
  if (!result) return null;
  const { tempDiff, triggers, upper, lower } = result;
  const now = new Date().toISOString();
  const open = openAdjust(db, siteId);
  if (!triggers.length) {
    if (open) {
      open.currentTempDiff = tempDiff;
      open.updatedAt = now;
    }
    return { adjust: open || null, tempDiff, triggered: false };
  }
  const triggerLabel = triggers.join('+');
  if (open) {
    open.count = (open.count || 1) + 1;
    open.trigger = triggerLabel;
    open.currentTempDiff = tempDiff;
    open.updatedAt = now;
    open.history = open.history || [];
    open.history.unshift(stamp('再次触发', `第${open.count}次：${triggerLabel}，温差${tempDiff}℃`));
    return { adjust: open, tempDiff, triggered: true };
  }
  const item = {
    id: `vent-adjusts-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`,
    siteId,
    status: '待调风',
    trigger: triggerLabel,
    count: 1,
    openTempDiff: tempDiff,
    currentTempDiff: tempDiff,
    surveyor: lower.surveyor || upper.surveyor || '',
    adjustBy: '',
    adjustAt: '',
    recheckDueAt: '',
    lastRecheckBy: '',
    lastRecheckAt: '',
    closedAt: '',
    closeReason: '',
    rechecks: [],
    createdAt: now,
    updatedAt: now,
    history: [stamp('建立待调风', `${triggerLabel}，温差${tempDiff}℃`)]
  };
  db['vent-adjusts'].push(item);
  return { adjust: item, tempDiff, triggered: true };
}

// 样点基准或原巡测改过后，未结束记录按新值重判；履历只增不删
function rejudgeOpenAdjusts(db, siteId) {
  const result = evaluateLayers(db, siteId);
  if (!result) return;
  const { tempDiff, triggers } = result;
  const now = new Date().toISOString();
  for (const adj of (db['vent-adjusts'] || []).filter((entry) => entry.siteId === siteId && entry.status !== '已结束')) {
    adj.currentTempDiff = tempDiff;
    adj.updatedAt = now;
    adj.history = adj.history || [];
    if (triggers.length) {
      adj.trigger = triggers.join('+');
      adj.history.unshift(stamp('按新值重判', `仍超限：${adj.trigger}，温差${tempDiff}℃`));
    } else {
      adj.status = '已结束';
      adj.closedAt = now;
      adj.closeReason = '重判恢复';
      adj.history.unshift(stamp('重判结束', `基准或原读数变更后恢复，温差${tempDiff}℃`));
    }
  }
}

function sortNewest(a, b) {
  return new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0);
}

app.get('/api/config', (req, res) => {
  res.json(config);
});

app.get('/api/db', async (req, res) => {
  const db = await readDb();
  for (const key of Object.keys(db)) {
    if (Array.isArray(db[key])) db[key].sort(sortNewest);
  }
  res.json(db);
});

app.post('/api/shift-readings', async (req, res) => {
  const db = await readDb();
  const now = new Date().toISOString();
  const item = {
    id: `shift-readings-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`,
    ...req.body,
    createdAt: now,
    updatedAt: now,
    history: [stamp('创建', req.body.note || '分层读数')]
  };
  db['shift-readings'].push(item);
  const outcome = applyTrigger(db, item.siteId);
  await writeDb(db);
  res.status(201).json({ item, adjust: outcome?.adjust || null, tempDiff: outcome?.tempDiff ?? null, triggered: Boolean(outcome?.triggered) });
});

app.post('/api/vent-adjusts/:id/adjust', async (req, res) => {
  const db = await readDb();
  const item = (db['vent-adjusts'] || []).find((entry) => entry.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'not found' });
  if (item.status !== '待调风') return res.status(409).json({ error: '仅待调风状态可登记调风' });
  const adjustBy = String(req.body.adjustBy || '').trim();
  if (!adjustBy) return res.status(409).json({ error: '请填写调风人' });
  const adjustAt = req.body.adjustAt ? new Date(req.body.adjustAt).toISOString() : new Date().toISOString();
  const recheckDueAt = new Date(new Date(adjustAt).getTime() + RECHECK_INTERVAL_MS).toISOString();
  Object.assign(item, { adjustBy, adjustAt, recheckDueAt, status: '复测中', updatedAt: new Date().toISOString() });
  item.history = item.history || [];
  item.history.unshift(stamp('登记调风', `${adjustBy} 已调风，30分钟后由另一位巡测员复测`));
  await writeDb(db);
  res.json(item);
});

app.post('/api/vent-adjusts/:id/recheck', async (req, res) => {
  const db = await readDb();
  const item = (db['vent-adjusts'] || []).find((entry) => entry.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'not found' });
  if (item.status !== '复测中') return res.status(409).json({ error: '请先登记调风，复测应在调风后进行' });
  const recheckBy = String(req.body.recheckBy || '').trim();
  if (!recheckBy) return res.status(409).json({ error: '请填写复测人' });
  if (recheckBy === item.adjustBy || recheckBy === item.surveyor) {
    return res.status(409).json({ error: '复测须由另一位巡测员完成（不能是调风人或原巡测员）' });
  }
  const at = req.body.recheckAt ? new Date(req.body.recheckAt) : new Date();
  if (item.recheckDueAt && at < new Date(item.recheckDueAt)) {
    return res.status(409).json({ error: `复测需间隔调风30分钟（${item.recheckDueAt} 后可测）` });
  }
  const upperTemp = Number(req.body.upperTemp);
  const upperHumidity = Number(req.body.upperHumidity);
  const lowerTemp = Number(req.body.lowerTemp);
  const lowerHumidity = Number(req.body.lowerHumidity);
  if ([upperTemp, upperHumidity, lowerTemp, lowerHumidity].some((value) => !Number.isFinite(value))) {
    return res.status(409).json({ error: '请填写两层温度与湿度读数' });
  }
  const site = (db.sites || []).find((entry) => entry.id === item.siteId);
  const tempDiff = round1(Math.abs(upperTemp - lowerTemp));
  const diffOk = !Number.isFinite(Number(site?.tempDiffLimit)) || tempDiff <= Number(site.tempDiffLimit);
  const humidityOk = !Number.isFinite(Number(site?.baselineHumidity)) || lowerHumidity >= Number(site.baselineHumidity);
  const passed = diffOk && humidityOk;
  const now = new Date().toISOString();
  const atIso = at.toISOString();
  // 复测读数回写为该样点最新分层读数，供后续评估与重判使用
  const mkReading = (layer, temperature, humidity) => ({
    id: `shift-readings-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`,
    siteId: item.siteId,
    surveyor: recheckBy,
    layer,
    windDirection: String(req.body.windDirection || ''),
    temperature,
    humidity,
    departAt: atIso,
    note: '调风复测',
    createdAt: now,
    updatedAt: now,
    history: [stamp('创建', '调风复测读数')]
  });
  db['shift-readings'].push(mkReading('上风段', upperTemp, upperHumidity), mkReading('下风段', lowerTemp, lowerHumidity));
  item.lastRecheckBy = recheckBy;
  item.lastRecheckAt = atIso;
  item.currentTempDiff = tempDiff;
  item.rechecks = item.rechecks || [];
  item.rechecks.unshift({ at: atIso, by: recheckBy, upperTemp, upperHumidity, lowerTemp, lowerHumidity, tempDiff, passed });
  item.history = item.history || [];
  if (passed) {
    item.status = '已结束';
    item.closedAt = now;
    item.closeReason = '复测恢复';
    item.history.unshift(stamp('复测结束', `${recheckBy} 复测两层恢复，温差${tempDiff}℃`));
  } else {
    item.count = (item.count || 1) + 1;
    item.recheckDueAt = new Date(at.getTime() + RECHECK_INTERVAL_MS).toISOString();
    const reasons = [!diffOk && '温差仍超限', !humidityOk && '下层湿度仍偏低'].filter(Boolean).join('、');
    item.history.unshift(stamp('复测未恢复', `${recheckBy}：${reasons}，温差${tempDiff}℃，30分钟后再复测`));
  }
  item.updatedAt = now;
  await writeDb(db);
  res.json(item);
});

app.post('/api/:collection', async (req, res) => {
  const db = await readDb();
  const { collection } = req.params;
  if (!Array.isArray(db[collection])) return res.status(404).json({ error: 'unknown collection' });
  const now = new Date().toISOString();
  const item = {
    id: `${collection}-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`,
    ...req.body,
    createdAt: now,
    updatedAt: now,
    history: [stamp('创建', req.body.note || req.body.memo || '')]
  };
  db[collection].push(item);
  await writeDb(db);
  res.status(201).json(item);
});

app.patch('/api/:collection/:id', async (req, res) => {
  const db = await readDb();
  const { collection, id } = req.params;
  if (!Array.isArray(db[collection])) return res.status(404).json({ error: 'unknown collection' });
  const item = db[collection].find((entry) => entry.id === id);
  if (!item) return res.status(404).json({ error: 'not found' });
  const historyAction = req.body.historyAction;
  delete req.body.historyAction;
  Object.assign(item, req.body, { updatedAt: new Date().toISOString() });
  item.history = item.history || [];
  if (historyAction || req.body.note || req.body.memo || req.body.status) {
    item.history.unshift(stamp(historyAction || req.body.status || '更新', req.body.note || req.body.memo || ''));
  }
  if (collection === 'sites') rejudgeOpenAdjusts(db, item.id);
  if (collection === 'shift-readings') rejudgeOpenAdjusts(db, item.siteId);
  await writeDb(db);
  res.json(item);
});

app.delete('/api/:collection/:id', async (req, res) => {
  const db = await readDb();
  const { collection, id } = req.params;
  if (!Array.isArray(db[collection])) return res.status(404).json({ error: 'unknown collection' });
  const before = db[collection].length;
  db[collection] = db[collection].filter((entry) => entry.id !== id);
  if (db[collection].length === before) return res.status(404).json({ error: 'not found' });
  await writeDb(db);
  res.status(204).end();
});

app.post('/api/action/:actionId/:id', async (req, res) => {
  const db = await readDb();
  const action = config.actions.find((entry) => entry.id === req.params.actionId);
  if (!action) return res.status(404).json({ error: 'unknown action' });
  const item = db[action.collection]?.find((entry) => entry.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'not found' });
  const result = runAction(db, action, item);
  if (result.error) return res.status(409).json({ error: result.error });
  await writeDb(db);
  res.json(result.item);
});

function getValue(source, pathName) {
  return pathName.split('.').reduce((value, key) => value?.[key], source);
}

function setValue(target, pathName, value) {
  const keys = pathName.split('.');
  let cursor = target;
  while (keys.length > 1) {
    const key = keys.shift();
    cursor[key] = cursor[key] || {};
    cursor = cursor[key];
  }
  cursor[keys[0]] = value;
}

function findRelated(db, relation, item) {
  return db[relation.collection]?.find((entry) => entry.id === item[relation.localKey]);
}

function runAction(db, action, item) {
  const related = action.relation ? findRelated(db, action.relation, item) : null;
  const context = { item, related };
  const levelRank = { '低': 1, '中': 2, '高': 3 };
  for (const guard of action.guards || []) {
    const left = getValue(context, guard.left);
    const right = guard.rightPath ? getValue(context, guard.rightPath) : guard.right;
    if (guard.op === 'missing' && left) continue;
    if (guard.op === 'missing' && !left) return { error: guard.message };
    if (guard.op === 'eq' && left !== right) return { error: guard.message };
    if (guard.op === 'neq' && left === right) return { error: guard.message };
    if (guard.op === 'gte' && Number(left) < Number(right)) return { error: guard.message };
    if (guard.op === 'levelGte' && (levelRank[left] || 0) < (levelRank[right] || 0)) return { error: guard.message };
    if (guard.op === 'notIn' && guard.values.includes(left)) return { error: guard.message };
  }
  for (const patch of action.patches || []) {
    const target = patch.target === 'related' ? related : item;
    if (!target) continue;
    const next = patch.valuePath ? getValue(context, patch.valuePath) : patch.value;
    setValue(target, patch.field, next);
    target.updatedAt = new Date().toISOString();
    target.history = target.history || [];
    target.history.unshift(stamp(action.label, action.note || '状态流转'));
  }
  for (const delta of action.deltas || []) {
    const target = delta.target === 'related' ? related : item;
    if (!target) continue;
    const sourceAmount = delta.amountPath ? Number(getValue(context, delta.amountPath)) : 1;
    const multiplier = delta.amount === undefined ? 1 : Number(delta.amount);
    const amount = sourceAmount * multiplier;
    const current = Number(getValue({ target }, `target.${delta.field}`) || 0);
    setValue(target, delta.field, current + amount);
    target.updatedAt = new Date().toISOString();
    target.history = target.history || [];
    target.history.unshift(stamp(action.label, action.note || '数量调整'));
  }
  return { item };
}

app.listen(PORT, () => {
  console.log(`${config.title} running at http://localhost:${PORT}`);
});
