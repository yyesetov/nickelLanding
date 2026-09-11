import {SCENARIOS, APPROVAL_LIMIT, createLedger, evaluateInvoice, registerInvoice, canApprove} from './demo-engine.js';

const $ = selector => document.querySelector(selector);
const editor = $('#invoice-text');
const formatter = new Intl.NumberFormat('ru-RU', {style: 'currency', currency: 'KZT', maximumFractionDigits: 2});
const money = minor => formatter.format(minor / 100);
const roleNames = {manager: 'Руководитель подразделения', finance: 'Финансовый руководитель'};
let ledger = createLedger(), evaluation = null, receipt = null;

function setStatus(state, message) {
  $('#demo-output').dataset.state = state;
  $('#demo-status').textContent = message;
}

function resetResult(announce = false) {
  evaluation = null; receipt = null;
  $('#demo-result').hidden = true;
  $('#demo-empty').hidden = false;
  $('#demo-approval').hidden = true;
  $('#demo-receipt').hidden = true;
  editor.removeAttribute('aria-invalid');
  setStatus('idle', announce ? 'Документ изменён. Проверьте его снова.' : 'Готов к проверке');
}

function chooseScenario(key) {
  if (!SCENARIOS[key]) return;
  editor.value = SCENARIOS[key];
  document.querySelectorAll('[data-scenario]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.scenario === key)));
  $('#demo-role').value = 'manager';
  resetResult();
}

function addCheck(label, detail, state) {
  const row = document.createElement('li');
  row.dataset.state = state;
  const mark = document.createElement('span'); mark.className = 'check-symbol'; mark.setAttribute('aria-hidden', 'true');
  mark.textContent = state === 'ok' ? '✓' : state === 'error' ? '!' : '→';
  const copy = document.createElement('div');
  const strong = document.createElement('strong'); strong.textContent = label;
  const text = document.createElement('span'); text.textContent = detail;
  copy.append(strong, text); row.append(mark, copy); $('#validation-list').append(row);
}

function updateApproval() {
  if (evaluation?.status !== 'ready') return;
  const allowed = canApprove(evaluation.requiredRole, $('#demo-role').value);
  $('#approve-invoice').disabled = !allowed;
  $('#role-hint').textContent = allowed
    ? 'Эта роль может согласовать счёт. Запись появится в демо-реестре.'
    : 'Сумма выше лимита. Выберите роль финансового руководителя.';
}

function renderResult(result) {
  evaluation = result; receipt = null;
  $('#demo-empty').hidden = true; $('#demo-result').hidden = false;
  $('#demo-approval').hidden = true; $('#demo-receipt').hidden = true;
  $('#validation-list').replaceChildren();
  $('#result-number').textContent = result.invoice ? `Счёт ${result.invoice.number}` : 'Проверка документа';
  $('#result-amount').textContent = result.invoice ? money(result.invoice.amountMinor) : '';
  editor.setAttribute('aria-invalid', String(result.status === 'invalid'));

  if (result.status === 'invalid') {
    setStatus('error', 'Нужны исправления');
    result.errors.forEach(error => addCheck('Проверьте документ', error, 'error'));
    $('#demo-decision').textContent = 'Исправьте указанные поля слева и запустите проверку снова. Счёт не зарегистрирован.';
    return;
  }
  addCheck('Реквизиты заполнены', `${result.invoice.supplier} · ${result.invoice.date}`, 'ok');
  if (result.status === 'duplicate') {
    setStatus('warning', 'Повторная регистрация остановлена');
    addCheck('Найден дубликат', `Для этого поставщика и номера уже есть запись ${result.existing.id}.`, 'error');
    $('#demo-decision').textContent = 'Новая запись не создана. Проверьте номер счёта или начните другой сценарий.';
    return;
  }
  addCheck('Дубликатов нет', 'Код поставщика и номер счёта ещё не встречались вместе.', 'ok');
  const finance = result.requiredRole === 'finance';
  addCheck('Маршрут согласования', `${roleNames[result.requiredRole]}. ${finance ? 'Сумма выше' : 'Сумма в пределах'} лимита ${money(APPROVAL_LIMIT)}.`, finance ? 'review' : 'ok');
  setStatus(finance ? 'warning' : 'ready', finance ? 'Нужно финансовое согласование' : 'Готов к согласованию');
  $('#demo-decision').textContent = 'Проверка завершена. Для регистрации требуется подтверждение человека.';
  $('#demo-approval').hidden = false;
  updateApproval();
}

$('#invoice-form').addEventListener('submit', event => {
  event.preventDefault();
  renderResult(evaluateInvoice(editor.value, ledger));
});
document.querySelectorAll('[data-scenario]').forEach(button => button.addEventListener('click', () => chooseScenario(button.dataset.scenario)));
editor.addEventListener('input', () => {
  document.querySelectorAll('[data-scenario]').forEach(button => button.setAttribute('aria-pressed', 'false'));
  resetResult(true);
});
$('#demo-role').addEventListener('change', updateApproval);
$('#approve-invoice').addEventListener('click', () => {
  const result = registerInvoice(editor.value, ledger, $('#demo-role').value);
  if (result.status === 'permission') {
    renderResult({...result, status: 'ready'});
    setStatus('warning', 'Нужна роль финансового руководителя');
    return;
  }
  if (result.status !== 'registered') { renderResult(result); return; }
  receipt = result.receipt; evaluation = result;
  setStatus('success', 'Счёт зарегистрирован в демо-реестре');
  $('#demo-approval').hidden = true; $('#demo-receipt').hidden = false;
  $('#receipt-id').textContent = receipt.id;
  $('#demo-decision').textContent = 'Согласование подтверждено. Повторная проверка этого документа найдёт существующую запись.';
  addCheck('Согласовано и зарегистрировано', `${roleNames[receipt.approvedBy]} · ${new Intl.DateTimeFormat('ru-RU', {hour: '2-digit', minute: '2-digit'}).format(new Date(receipt.registeredAt))}`, 'ok');
  $('#download-receipt').focus({preventScroll: true});
});
$('#reset-demo').addEventListener('click', () => {
  ledger = createLedger(); chooseScenario('valid');
  setStatus('idle', 'Демо сброшено. Можно начать заново.');
});
$('#download-receipt').addEventListener('click', () => {
  if (!receipt) return;
  const blob = new Blob([JSON.stringify(receipt, null, 2)], {type: 'application/json'});
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = `nickel-${receipt.id.toLowerCase()}.json`;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

$('#demo-scenarios').disabled = false;
$('#check-invoice').disabled = false;
$('#reset-demo').disabled = false;
editor.readOnly = false;
