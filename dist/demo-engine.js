// A deliberately bounded, local demonstration. No production data or integrations.
export const APPROVAL_LIMIT = 50_000_000;
const MAX_AMOUNT = 99_999_999_999_999;
const base = `Счёт: NL-1042
Поставщик: Демо-поставщик
Код поставщика: DEMO-01
Дата: 11.09.2026
Назначение: Поддержка ИТ-инфраструктуры
Сумма: 480 000,00 KZT`;

export const SCENARIOS = Object.freeze({
  valid: base,
  duplicate: base.replace('NL-1042', 'NL-1041'),
  missing: base.replace('Код поставщика: DEMO-01', 'Код поставщика:'),
  limit: base.replace('480 000,00', '840 000,00')
});

const labels = new Map([
  ['счёт', 'number'], ['счет', 'number'], ['поставщик', 'supplier'],
  ['код поставщика', 'supplierId'], ['дата', 'date'],
  ['назначение', 'purpose'], ['сумма', 'amount']
]);
const fieldNames = {number: 'Счёт', supplier: 'Поставщик', supplierId: 'Код поставщика', date: 'Дата', purpose: 'Назначение', amount: 'Сумма'};
const canonical = value => value.normalize('NFKC').trim().toUpperCase();
const keyFor = invoice => JSON.stringify([canonical(invoice.supplierId), canonical(invoice.number)]);

export function parseMoney(value) {
  const cleaned = value.normalize('NFKC').trim();
  const match = cleaned.match(/^(\d{1,3}(?: \d{3})+|\d+)(?:[,.](\d{1,2}))?(?:\s*(?:KZT|₸|тенге))?$/i);
  if (!match) return null;
  const integer = Number(match[1].replaceAll(' ', ''));
  const fractional = Number((match[2] || '').padEnd(2, '0'));
  const minor = integer * 100 + fractional;
  return Number.isSafeInteger(minor) && minor > 0 && minor <= MAX_AMOUNT ? minor : null;
}

function validDate(value) {
  const match = value.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) return false;
  const [, day, month, year] = match.map(Number);
  if (year < 2000 || year > 2100) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function parseInvoice(text) {
  const fields = Object.create(null), errors = [];
  if (typeof text !== 'string' || text.length > 2400) return {invoice: null, errors: ['Документ должен содержать не больше 2 400 символов.']};
  for (const line of text.split(/\r?\n/).filter(line => line.trim())) {
    const colon = line.indexOf(':');
    const label = line.slice(0, colon).trim().toLowerCase();
    const field = labels.get(label);
    if (colon < 0 || !field) { errors.push('Используйте поля и формат из примера: «Название: значение».'); continue; }
    if (Object.hasOwn(fields, field)) { errors.push(`Поле «${fieldNames[field]}» указано дважды. Оставьте одно значение.`); continue; }
    fields[field] = line.slice(colon + 1).trim();
  }
  for (const [field, label] of Object.entries(fieldNames)) {
    if (!fields[field]) errors.push(`Заполните поле «${label}».`);
  }
  const identifier = /^[A-ZА-ЯЁ0-9][A-ZА-ЯЁ0-9./-]{0,31}$/i;
  for (const field of ['number', 'supplierId']) {
    if (fields[field] && !identifier.test(fields[field].normalize('NFKC'))) errors.push(`В поле «${fieldNames[field]}» используйте до 32 букв или цифр, без пробелов; допустимы «-», «/» и «.».`);
  }
  if (fields.supplier?.length > 120) errors.push('Сократите название поставщика до 120 символов.');
  if (fields.purpose?.length > 250) errors.push('Сократите назначение до 250 символов.');
  if (fields.date && !validDate(fields.date)) errors.push('Укажите существующую дату в формате ДД.ММ.ГГГГ.');
  const amountMinor = fields.amount ? parseMoney(fields.amount) : null;
  if (fields.amount && amountMinor === null) errors.push('Укажите положительную сумму в тенге, например 480 000,00 KZT. Допустимо до двух знаков после запятой.');
  const invoice = errors.length ? null : {
    number: canonical(fields.number), supplier: fields.supplier,
    supplierId: canonical(fields.supplierId), date: fields.date,
    purpose: fields.purpose, amountMinor, currency: 'KZT'
  };
  return {invoice, errors: [...new Set(errors)]};
}

export function createLedger() {
  const invoice = parseInvoice(SCENARIOS.duplicate).invoice;
  return new Map([[keyFor(invoice), {
    demonstration: true, id: 'DEMO-0001', invoice,
    approvedBy: 'manager', registeredAt: '2026-09-11T08:00:00.000Z', seeded: true
  }]]);
}

export function evaluateInvoice(text, ledger) {
  const parsed = parseInvoice(text);
  if (parsed.errors.length) return {status: 'invalid', ...parsed};
  const {invoice} = parsed;
  const existing = ledger.get(keyFor(invoice));
  if (existing) return {status: 'duplicate', invoice, existing, errors: []};
  const requiredRole = invoice.amountMinor > APPROVAL_LIMIT ? 'finance' : 'manager';
  return {status: 'ready', invoice, requiredRole, errors: []};
}

export function canApprove(requiredRole, role) {
  return role === 'finance' || (requiredRole === 'manager' && role === 'manager');
}

export function registerInvoice(text, ledger, role, now = new Date().toISOString()) {
  // Revalidate the current document and unique key at the mutation boundary.
  const evaluation = evaluateInvoice(text, ledger);
  if (evaluation.status !== 'ready') return evaluation;
  if (!canApprove(evaluation.requiredRole, role)) return {...evaluation, status: 'permission'};
  const receipt = {
    demonstration: true, id: `DEMO-${String(ledger.size + 1).padStart(4, '0')}`,
    invoice: evaluation.invoice, approvedBy: role, registeredAt: now,
    storage: 'Memory of this browser page; no external registration or payment'
  };
  ledger.set(keyFor(evaluation.invoice), receipt);
  return {...evaluation, status: 'registered', receipt};
}
