const state = {
  config: null,
  db: {},
  activeTab: ''
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function fmtDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString('zh-CN', { hour12: false });
}

function fmtNum(value, digits = 1) {
  const num = Number(value);
  return Number.isFinite(num) ? num.toFixed(digits) : '-';
}

function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 1800);
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || '请求失败');
  }
  if (res.status === 204) return null;
  return res.json();
}

function valueByPath(source, pathName) {
  return pathName.split('.').reduce((value, key) => value?.[key], source);
}

function displayField(item, field) {
  const value = item[field.name] ?? '';
  if (field.type === 'select' && field.options) return value || field.options[0];
  return value;
}

function collectionLabel(collection) {
  return state.config.collections[collection]?.label || collection;
}

function relationLabel(relation, id) {
  const item = state.db[relation.collection]?.find((entry) => entry.id === id);
  if (!item) return '未关联';
  return relation.labelFields.map((field) => item[field]).filter(Boolean).join(' / ');
}

function optionList(items, labelFields) {
  return items.map((item) => {
    const label = labelFields.map((field) => item[field]).filter(Boolean).join(' / ');
    return `<option value="${item.id}">${escapeHtml(label)}</option>`;
  }).join('');
}

function formField(field) {
  const required = field.required ? 'required' : '';
  const value = field.default ? `value="${escapeHtml(field.default)}"` : '';
  if (field.type === 'textarea') {
    return `<label class="${field.wide ? 'wide' : ''}">${field.label}<textarea name="${field.name}" ${required}></textarea></label>`;
  }
  if (field.type === 'select') {
    return `<label class="${field.wide ? 'wide' : ''}">${field.label}<select name="${field.name}" ${required}>${field.options.map((option) => `<option>${escapeHtml(option)}</option>`).join('')}</select></label>`;
  }
  if (field.type === 'relation') {
    const items = state.db[field.collection] || [];
    return `<label class="${field.wide ? 'wide' : ''}">${field.label}<select name="${field.name}" ${required}>${optionList(items, field.labelFields)}</select></label>`;
  }
  const inputType = field.type === 'datetime-local' ? 'datetime-local' : (field.type || 'text');
  return `<label class="${field.wide ? 'wide' : ''}">${field.label}<input type="${inputType}" name="${field.name}" placeholder="${escapeHtml(field.placeholder || '')}" ${value} ${required}></label>`;
}

function pill(value, tone = '') {
  return `<span class="pill ${tone}">${escapeHtml(value || '-')}</span>`;
}

function toneFor(value) {
  return state.config.tones?.[value] || '';
}

function historyHtml(item) {
  const history = item.history || [];
  if (!history.length) return '';
  return `<div class="history">${history.slice(0, 5).map((entry) => `
    <div class="history-item"><span>${fmtDate(entry.at)}</span><span>${escapeHtml(entry.action)}${entry.note ? '：' + escapeHtml(entry.note) : ''}</span></div>
  `).join('')}</div>`;
}

function values(form, view) {
  const payload = Object.fromEntries(new FormData(form).entries());
  for (const field of view.fields) {
    if (field.type === 'number') payload[field.name] = Number(payload[field.name] || 0);
  }
  return { ...view.defaults, ...payload };
}

function renderTabs() {
  $('#tabs').innerHTML = state.config.views.map((view, index) => `
    <button class="tab${index === 0 ? ' active' : ''}" data-tab="${view.id}">${escapeHtml(view.label)}</button>
  `).join('');
  state.activeTab = state.config.views[0].id;
}

function setTab(tabId) {
  state.activeTab = tabId;
  $$('.tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.tab === tabId));
  $$('.view').forEach((view) => view.classList.toggle('active', view.id === tabId));
}

function renderStats() {
  return `<div class="stats">${state.config.stats.map((stat) => {
    const items = state.db[stat.collection] || [];
    const value = stat.filter ? items.filter((item) => item[stat.filter.field] === stat.filter.value).length : items.length;
    return `<div class="stat"><span>${escapeHtml(stat.label)}</span><strong>${value}</strong></div>`;
  }).join('')}</div>`;
}

function renderCard(item, collection, view) {
  if (view.card === 'windRecord') return renderWindCard(item);
  const title = view.titleFields.map((field) => item[field]).filter(Boolean).join(' / ') || item.id;
  const statusValue = item[view.statusField];
  const relation = view.relation ? `<div class="meta">${escapeHtml(relationLabel(view.relation, item[view.relation.localKey]))}</div>` : '';
  const details = (view.detailFields || []).map((field) => {
    let raw = item[field.name];
    if (field.type === 'relation') raw = relationLabel(field, raw);
    if (field.type === 'datetime') raw = raw ? fmtDate(raw) : '';
    return `<div>${escapeHtml(field.label)}<br><strong>${escapeHtml(raw ?? '') || '-'}</strong></div>`;
  }).join('');
  const summary = (view.summaryFields || []).map((field) => item[field]).filter(Boolean).join(' · ');
  const actions = state.config.actions
    .filter((action) => action.collection === collection)
    .map((action) => `<button class="${action.danger ? 'danger' : 'ghost'}" data-action="${action.id}" data-id="${item.id}">${escapeHtml(action.label)}</button>`)
    .join('');
  return `<article class="card">
    <div class="card-head"><h3>${escapeHtml(title)}</h3>${statusValue ? pill(statusValue, toneFor(statusValue)) : ''}</div>
    ${relation}
    ${summary ? `<p>${escapeHtml(summary)}</p>` : ''}
    ${details ? `<div class="detail">${details}</div>` : ''}
    ${actions ? `<div class="actions">${actions}</div>` : ''}
    ${historyHtml(item)}
  </article>`;
}

function renderList(view) {
  const collection = view.collection;
  const query = $(`#search-${view.id}`)?.value.trim() || '';
  const status = $(`#status-${view.id}`)?.value || '';
  let items = [...(state.db[collection] || [])];
  if (query) {
    items = items.filter((item) => view.searchFields.some((field) => String(item[field] || '').includes(query)));
  }
  if (status) {
    items = items.filter((item) => item[view.statusField] === status);
  }
  return items.length ? items.map((item) => renderCard(item, collection, view)).join('') : `<div class="empty">暂无${escapeHtml(collectionLabel(collection))}</div>`;
}

function latestSurveyFor(siteId) {
  const surveys = (state.db.surveys || []).filter((item) => item.siteId === siteId && item.status !== '复测');
  return surveys.sort(sortByCreatedDesc)[0] || null;
}

function sortByCreatedDesc(a, b) {
  return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
}

function latestRecheckFor(siteId) {
  const surveys = (state.db.surveys || []).filter((item) => item.siteId === siteId && item.status === '复测');
  return surveys.sort(sortByCreatedDesc)[0] || null;
}

function renderWindBoard(board) {
  const sites = state.db.sites || [];
  const rows = sites.map((site) => {
    const latest = latestSurveyFor(site.id);
    const recheck = latestRecheckFor(site.id);
    const open = (state.db.windRecords || []).find((item) => item.siteId === site.id && item.status !== '已结束');
    const diff = latest?.tempDiff;
    const limit = Number(site.tempDiffLimit);
    const over = diff !== undefined && diff !== null && Number.isFinite(limit) && Math.abs(Number(diff)) > limit;
    const tone = open ? (open.status === '待调风' ? 'bad' : 'warn') : (over ? 'warn' : 'ok');
    const name = [site.cave, site.zone, site.pointCode].filter(Boolean).join(' / ');
    return `<tr>
      <td>${escapeHtml(name)}</td>
      <td class="metric ${over ? 'metric-bad' : 'metric-ok'}">${diff === undefined || diff === null ? '-' : `${fmtNum(diff, 2)}℃`}<span class="sub">限值 ${escapeHtml(site.tempDiffLimit)}℃</span></td>
      <td>${latest ? `${escapeHtml(latest.lowerHumidity)}%<span class="sub">基准 ${escapeHtml(site.baselineHumidity)}%</span>` : '-'}</td>
      <td>${open ? pill(open.status, tone) : pill('正常', 'ok')}</td>
      <td>${recheck ? escapeHtml(recheck.surveyor) : '<span class="muted">暂无</span>'}</td>
      <td class="muted">${recheck ? fmtDate(recheck.createdAt) : '-'}</td>
    </tr>`;
  }).join('');
  return `<div class="panel wind-board">
    <h2>${escapeHtml(board.title || '当前风况')}</h2>
    <table>
      <thead><tr><th>样点</th><th>当前温差</th><th>下层湿度</th><th>调风状态</th><th>最近复测人</th><th>复测时间</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="6" class="empty">暂无样点</td></tr>'}</tbody>
    </table>
  </div>`;
}

function renderRechecks(item) {
  const rechecks = item.rechecks || [];
  if (!rechecks.length) return '';
  return `<div class="rechecks"><div class="meta">复测履历</div>${rechecks.map((entry) => `
    <div class="recheck-item ${entry.recovered ? 'ok' : 'bad'}">
      <span>${escapeHtml(entry.surveyor)} · ${fmtDate(entry.at)}</span>
      <span>上层 ${escapeHtml(entry.upperTemp)}℃ / ${escapeHtml(entry.upperHumidity)}% · 下层 ${escapeHtml(entry.lowerTemp)}℃ / ${escapeHtml(entry.lowerHumidity)}% · 温差 ${fmtNum(entry.tempDiff, 2)}℃</span>
      <strong>${entry.recovered ? '两层恢复' : '未恢复'}</strong>
    </div>`).join('')}</div>`;
}

function renderWindCard(item) {
  const relation = config_relation(item);
  const tone = toneFor(item.status);
  const reasons = (item.judgeReasons || []).map((reason) => escapeHtml(reason)).join('；');
  let body = '';
  if (item.status === '待调风') {
    body = `<form class="wind-form" data-wind-action="wind-adjust" data-id="${item.id}">
      <div class="wind-form-row">
        <label>调风执行人<input name="operator" required placeholder="执行调风的人员"></label>
        <label class="grow">调风措施<input name="note" placeholder="如：开启导流风门、暂停该段讲解"></label>
      </div>
      <div class="actions"><button>完成调风（进入30分钟复测等待）</button></div>
    </form>`;
  } else if (item.status === '待复测') {
    const earliest = new Date(new Date(item.adjustedAt).getTime() + 30 * 60 * 1000);
    body = `<form class="wind-form" data-wind-action="wind-recheck" data-id="${item.id}">
      <div class="meta">调风人：${escapeHtml(item.adjustedBy)} · 调风时间：${fmtDate(item.adjustedAt)} · 满30分钟可复测：${fmtDate(earliest.toISOString())}（复测人须不同于原巡测员 ${escapeHtml(item.surveyor)}）</div>
      <div class="wind-form-row">
        <label>复测巡测员<input name="surveyor" required></label>
        <label>上层温度<input name="upperTemp" type="number" step="0.1" required></label>
        <label>下层温度<input name="lowerTemp" type="number" step="0.1" required></label>
        <label>上层湿度<input name="upperHumidity" type="number" step="0.1" required></label>
        <label>下层湿度<input name="lowerHumidity" type="number" step="0.1" required></label>
      </div>
      <div class="actions"><button>登记复测（两层恢复即结束）</button></div>
    </form>`;
  } else {
    body = `<div class="meta">调风人：${escapeHtml(item.adjustedBy)} · 最近复测人：${escapeHtml(item.lastRecheckSurveyor)}（${fmtDate(item.lastRecheckAt)}）</div>`;
  }
  return `<article class="card wind-card">
    <div class="card-head"><h3>${escapeHtml(relation)}</h3>${pill(item.status, tone)}</div>
    <div class="meta">原巡测员：${escapeHtml(item.surveyor)} · 风向：${escapeHtml(item.windDirection || '-')} · 层位：${escapeHtml(item.layerPosition || '-')} · 离场：${item.leaveAt ? fmtDate(item.leaveAt) : '-'}</div>
    <div class="detail">
      <div>两层温差<br><strong class="${Math.abs(Number(item.tempDiff)) > Number(item.tempDiffLimit) ? 'metric-bad' : ''}">${fmtNum(item.tempDiff, 2)}℃ / 限值 ${escapeHtml(item.tempDiffLimit)}℃</strong></div>
      <div>上层<br><strong>${escapeHtml(item.upperTemp)}℃ · ${escapeHtml(item.upperHumidity)}%</strong></div>
      <div>下层<br><strong>${escapeHtml(item.lowerTemp)}℃ · ${escapeHtml(item.lowerHumidity)}%（基准 ${escapeHtml(item.baselineHumidity)}%）</strong></div>
      <div>异常累计<br><strong>${escapeHtml(item.hitCount)} 次</strong></div>
    </div>
    ${reasons ? `<p class="reasons">${reasons}</p>` : ''}
    ${item.adjustNote ? `<p class="meta">调风措施：${escapeHtml(item.adjustNote)}</p>` : ''}
    ${body}
    ${renderRechecks(item)}
    ${historyHtml(item)}
  </article>`;
}

function config_relation(item) {
  const view = state.config.views.find((entry) => entry.collection === 'windRecords');
  return relationLabel(view.relation, item.siteId);
}

function renderDashboardView(view) {
  const source = view.focus;
  let items = [...(state.db[source.collection] || [])];
  if (source.field) items = items.filter((item) => source.values.includes(item[source.field]));
  items = items.slice(0, source.limit || 8);
  const cardView = state.config.views.find((entry) => entry.collection === source.collection) || source;
  return `<section class="view active" id="${view.id}">
    ${renderStats()}
    ${view.board ? renderWindBoard(view.board) : ''}
    <div class="panel" ${view.board ? 'style="margin-top:18px"' : ''}><h2>${escapeHtml(view.focusTitle)}</h2><div class="list">${items.length ? items.map((item) => renderCard(item, source.collection, cardView)).join('') : '<div class="empty">暂无重点事项</div>'}</div></div>
  </section>`;
}

function renderCrudView(view) {
  const statusOptions = view.statusOptions || [];
  return `<section class="view" id="${view.id}">
    <div class="grid${view.hideForm ? ' no-form' : ''}">
      ${view.hideForm ? '' : `<form class="panel" data-create="${view.collection}" data-view="${view.id}">
        <h2>${escapeHtml(view.formTitle)}</h2>
        <div class="form-grid">${view.fields.map(formField).join('')}</div>
        <div class="actions"><button>${escapeHtml(view.submitLabel || '保存')}</button></div>
      </form>`}
      <div class="panel">
        <h2>${escapeHtml(view.listTitle)}</h2>
        <div class="toolbar">
          <input id="search-${view.id}" placeholder="${escapeHtml(view.searchPlaceholder || '搜索')}">
          <select id="status-${view.id}">
            <option value="">全部状态</option>
            ${statusOptions.map((option) => `<option>${escapeHtml(option)}</option>`).join('')}
          </select>
        </div>
        <div class="list" id="list-${view.id}">${renderList(view)}</div>
      </div>
    </div>
  </section>`;
}

function render() {
  $('#title').textContent = state.config.title;
  document.title = state.config.title;
  $('#lede').textContent = state.config.lede;
  $('#main').innerHTML = state.config.views.map((view) => view.type === 'dashboard' ? renderDashboardView(view) : renderCrudView(view)).join('');
  setTab(state.activeTab || state.config.views[0].id);
}

async function load() {
  state.db = await api('/api/db');
  render();
}

document.addEventListener('click', async (event) => {
  const tab = event.target.closest('.tab');
  const action = event.target.closest('[data-action]');
  if (tab) setTab(tab.dataset.tab);
  if (action) {
    try {
      await api(`/api/action/${action.dataset.action}/${action.dataset.id}`, { method: 'POST' });
      await load();
      toast('已更新');
    } catch (error) {
      toast(error.message);
    }
  }
});

document.addEventListener('input', (event) => {
  const view = state.config.views.find((entry) => entry.id && (event.target.id === `search-${entry.id}` || event.target.id === `status-${entry.id}`));
  if (view) $(`#list-${view.id}`).innerHTML = renderList(view);
});

document.addEventListener('submit', async (event) => {
  const windForm = event.target.closest('[data-wind-action]');
  if (windForm) {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(windForm).entries());
    for (const key of ['upperTemp', 'lowerTemp', 'upperHumidity', 'lowerHumidity', 'co2', 'dripRate']) {
      if (payload[key] !== undefined) payload[key] = Number(payload[key]);
    }
    try {
      await api(`/api/action/${windForm.dataset.windAction}/${windForm.dataset.id}`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      await load();
      toast(windForm.dataset.windAction === 'wind-adjust' ? '调风已完成，等待复测' : '复测已登记');
    } catch (error) {
      toast(error.message);
    }
    return;
  }

  const form = event.target.closest('[data-create]');
  if (!form) return;
  event.preventDefault();
  const view = state.config.views.find((entry) => entry.id === form.dataset.view);
  const saved = await api(`/api/${form.dataset.create}`, { method: 'POST', body: JSON.stringify(values(form, view)) });
  form.reset();
  await load();
  toast(saved?._notice || '已保存');
});

$('#refreshBtn').addEventListener('click', () => load().then(() => toast('已刷新')));

async function boot() {
  state.config = await api('/api/config');
  renderTabs();
  await load();
}

boot().catch((error) => toast(error.message));
