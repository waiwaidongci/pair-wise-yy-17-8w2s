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

function sortNewest(a, b) {
  return new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0);
}

// ---------- 两层风况判定 ----------

function tempDiffOf(survey) {
  if (survey.upperTemp === undefined || survey.lowerTemp === undefined) return null;
  return Math.round((Number(survey.lowerTemp) - Number(survey.upperTemp)) * 100) / 100;
}

// 判定依据：上下两层温差是否超过样点限值；下层（下风段）湿度是否较基准下降
function evaluateWind(site, survey) {
  const diff = tempDiffOf(survey);
  const limit = Number(site?.tempDiffLimit);
  const reasons = [];
  if (diff !== null && Number.isFinite(limit) && Math.abs(diff) > limit) {
    reasons.push(`两层温差${diff}℃超过限值${limit}℃`);
  }
  const baselineHumidity = Number(site?.baselineHumidity);
  const lowerHumidity = Number(survey?.lowerHumidity);
  if (survey?.lowerHumidity !== undefined && Number.isFinite(lowerHumidity)
    && Number.isFinite(baselineHumidity) && lowerHumidity < baselineHumidity) {
    reasons.push(`下层湿度${lowerHumidity}%低于基准${baselineHumidity}%`);
  }
  return { diff, abnormal: reasons.length > 0, reasons };
}

function openWindRecord(db, siteId) {
  return db.windRecords.find((entry) => entry.siteId === siteId && entry.status !== '已结束');
}

function rejudgeWindRecord(db, record, notePrefix = '按新值重判') {
  const site = db.sites.find((entry) => entry.id === record.siteId);
  const trigger = db.surveys.find((entry) => entry.id === record.triggerSurveyId);
  if (!site || !trigger) return record;
  const result = evaluateWind(site, trigger);
  record.tempDiff = result.diff;
  record.tempDiffLimit = Number(site.tempDiffLimit);
  record.lowerHumidity = Number(trigger.lowerHumidity);
  record.baselineHumidity = Number(site.baselineHumidity);
  record.judgeReasons = result.abnormal ? result.reasons : ['两层温差与下层湿度已恢复（待复测确认）'];
  record.updatedAt = new Date().toISOString();
  record.history = record.history || [];
  record.history.unshift(stamp(notePrefix, record.judgeReasons.join('；')));
  return record;
}

function ingestAbnormalSurvey(db, site, survey) {
  const result = evaluateWind(site, survey);
  survey.tempDiff = result.diff;
  survey.status = result.abnormal ? '异常' : '正常';

  if (!result.abnormal) return null;

  const open = openWindRecord(db, site.id);
  if (open) {
    // 同一样点记录未结束前，只累加异常次数，不另建记录
    open.hitCount = Number(open.hitCount || 1) + 1;
    open.triggerSurveyId = survey.id;
    open.surveyor = survey.surveyor;
    open.windDirection = survey.windDirection;
    open.tempDiff = result.diff;
    open.lowerHumidity = Number(survey.lowerHumidity);
    open.upperTemp = Number(survey.upperTemp);
    open.lowerTemp = Number(survey.lowerTemp);
    open.upperHumidity = Number(survey.upperHumidity);
    open.judgeReasons = result.reasons;
    open.leaveAt = survey.leaveAt || open.leaveAt;
    open.updatedAt = new Date().toISOString();
    open.history = open.history || [];
    open.history.unshift(stamp('异常累加', `第${open.hitCount}次异常：${result.reasons.join('；')}（${survey.surveyor}）`));
    return { record: open, accumulated: true };
  }

  const now = new Date().toISOString();
  const record = {
    id: `wind-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`,
    siteId: site.id,
    triggerSurveyId: survey.id,
    surveyor: survey.surveyor,
    windDirection: survey.windDirection,
    layerPosition: survey.layerPosition || '',
    leaveAt: survey.leaveAt || '',
    upperTemp: Number(survey.upperTemp),
    lowerTemp: Number(survey.lowerTemp),
    upperHumidity: Number(survey.upperHumidity),
    lowerHumidity: Number(survey.lowerHumidity),
    tempDiff: result.diff,
    tempDiffLimit: Number(site.tempDiffLimit),
    baselineHumidity: Number(site.baselineHumidity),
    judgeReasons: result.reasons,
    hitCount: 1,
    status: '待调风',
    adjustNote: '',
    adjustedBy: '',
    adjustedAt: '',
    rechecks: [],
    lastRecheckSurveyor: '',
    lastRecheckAt: '',
    createdAt: now,
    updatedAt: now,
    history: [stamp('建立待调风', result.reasons.join('；'))]
  };
  db.windRecords.push(record);
  return { record, accumulated: false };
}

// ---------- 调风动作 ----------

function runWindAdjust(db, item, input) {
  if (item.status !== '待调风') return { error: '当前状态不允许调风' };
  const operator = String(input.operator || '').trim();
  if (!operator) return { error: '请填写执行调风人员' };
  item.status = '待复测';
  item.adjustedBy = operator;
  item.adjustedAt = new Date().toISOString();
  item.adjustNote = String(input.note || '').trim();
  item.updatedAt = item.adjustedAt;
  item.history = item.history || [];
  item.history.unshift(stamp('完成调风', `${operator}执行调风，待30分钟后由其他巡测员复测${item.adjustNote ? '；' + item.adjustNote : ''}`));
  return { item };
}

function runWindRecheck(db, item, input) {
  if (item.status !== '待复测') return { error: '请先完成调风再复测' };
  const surveyor = String(input.surveyor || '').trim();
  if (!surveyor) return { error: '请填写复测巡测员' };
  if (item.surveyor && surveyor === item.surveyor) {
    return { error: '复测必须由另一位巡测员执行' };
  }
  const elapsed = Date.now() - new Date(item.adjustedAt).getTime();
  if (elapsed < 30 * 60 * 1000) {
    const waitMin = Math.ceil((30 * 60 * 1000 - elapsed) / 60000);
    return { error: `距调风未满30分钟，还需等待约${waitMin}分钟` };
  }

  const upperTemp = Number(input.upperTemp);
  const lowerTemp = Number(input.lowerTemp);
  const upperHumidity = Number(input.upperHumidity);
  const lowerHumidity = Number(input.lowerHumidity);
  if ([upperTemp, lowerTemp, upperHumidity, lowerHumidity].some(Number.isNaN)) {
    return { error: '请填写完整的两层复测读数' };
  }
  const site = db.sites.find((entry) => entry.id === item.siteId);
  const surveyish = { upperTemp, lowerTemp, upperHumidity, lowerHumidity };
  const result = evaluateWind(site, surveyish);
  const at = new Date().toISOString();

  // 复测本身也是一次巡测，落巡测履历
  const recheckSurvey = {
    id: `survey-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`,
    siteId: item.siteId,
    surveyor,
    date: at.slice(0, 10),
    upperTemp,
    lowerTemp,
    upperHumidity,
    lowerHumidity,
    tempDiff: result.diff,
    co2: Number(input.co2) || 0,
    dripRate: Number(input.dripRate) || 0,
    windDirection: item.windDirection || '',
    layerPosition: item.layerPosition || '',
    leaveAt: '',
    photoUrl: '',
    disturbance: `待调风记录${item.id}复测`,
    status: '复测',
    reviewNote: '',
    createdAt: at,
    updatedAt: at,
    history: [stamp('复测登记', result.abnormal ? result.reasons.join('；') : '两层恢复')]
  };
  db.surveys.push(recheckSurvey);

  item.rechecks = item.rechecks || [];
  item.rechecks.unshift({
    surveyId: recheckSurvey.id,
    surveyor,
    at,
    upperTemp,
    lowerTemp,
    upperHumidity,
    lowerHumidity,
    tempDiff: result.diff,
    recovered: !result.abnormal
  });
  item.lastRecheckSurveyor = surveyor;
  item.lastRecheckAt = at;
  item.history = item.history || [];

  if (!result.abnormal) {
    // 两层均恢复（温差未超限且下层湿度回到基准），结束记录
    item.status = '已结束';
    item.closedAt = at;
    item.history.unshift(stamp('复测恢复', `${surveyor}复测：温差${result.diff}℃，下层湿度${lowerHumidity}%，两层恢复，记录结束`));
  } else {
    item.history.unshift(stamp('复测未恢复', `${surveyor}复测：${result.reasons.join('；')}，继续待复测`));
  }
  item.updatedAt = at;
  return { item, recheckSurvey };
}

// ---------- 通用状态动作（保留给样点等） ----------

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

function runGenericAction(db, action, item) {
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

// ---------- 接口 ----------

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

app.post('/api/:collection', async (req, res) => {
  const db = await readDb();
  const { collection } = req.params;
  if (!Array.isArray(db[collection])) return res.status(404).json({ error: 'unknown collection' });
  if (config.collections[collection]?.readonly) {
    return res.status(403).json({ error: '该记录由巡测自动建立，不能手工新增' });
  }
  const now = new Date().toISOString();
  const item = {
    id: `${collection}-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`,
    ...req.body,
    createdAt: now,
    updatedAt: now,
    history: [stamp('创建', req.body.note || req.body.memo || '')]
  };

  let notice = '';
  if (collection === 'surveys') {
    const site = db.sites.find((entry) => entry.id === item.siteId);
    if (!site) return res.status(400).json({ error: '请选择样点' });
    const outcome = ingestAbnormalSurvey(db, site, item);
    if (outcome) {
      notice = outcome.accumulated
        ? `异常已第${outcome.record.hitCount}次累加到现有待调风记录`
        : '已建立待调风记录';
    }
  }

  db[collection].push(item);
  await writeDb(db);
  res.status(201).json({ ...item, _notice: notice });
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

  if (collection === 'surveys') {
    // 原巡测读数被改动：重算温差与状态，并按新值重判相关未结束记录
    const site = db.sites.find((entry) => entry.id === item.siteId);
    if (site) {
      const result = evaluateWind(site, item);
      item.tempDiff = result.diff;
      item.status = result.abnormal ? '异常' : '正常';
      const open = openWindRecord(db, site.id);
      if (open && open.triggerSurveyId === item.id) {
        rejudgeWindRecord(db, open, '原巡测改动，按新值重判');
      }
    }
  } else if (collection === 'sites') {
    // 样点基准/限值改动：该样点所有未结束记录按新值重判，旧履历保留
    for (const record of db.windRecords.filter((entry) => entry.siteId === item.id && entry.status !== '已结束')) {
      rejudgeWindRecord(db, record, '样点基准改动，按新值重判');
    }
  }

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

  let result;
  if (action.kind === 'windAdjust') result = runWindAdjust(db, item, req.body || {});
  else if (action.kind === 'windRecheck') result = runWindRecheck(db, item, req.body || {});
  else result = runGenericAction(db, action, item);

  if (result.error) return res.status(409).json({ error: result.error });
  await writeDb(db);
  res.json(result.item);
});

app.listen(PORT, () => {
  console.log(`${config.title} running at http://localhost:${PORT}`);
});
