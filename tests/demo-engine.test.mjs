import test from 'node:test';
import assert from 'node:assert/strict';
import {SCENARIOS, parseMoney, parseInvoice, createLedger, evaluateInvoice, registerInvoice} from '../dist/demo-engine.js';

test('a valid invoice requires approval before a receipt is created', () => {
  const ledger = createLedger();
  const result = evaluateInvoice(SCENARIOS.valid, ledger);
  assert.equal(result.status, 'ready');
  assert.equal(result.invoice.amountMinor, 48_000_000);
  assert.equal(ledger.size, 1);
  const saved = registerInvoice(SCENARIOS.valid, ledger, 'manager', '2026-09-11T12:00:00Z');
  assert.equal(saved.status, 'registered');
  assert.equal(saved.receipt.demonstration, true);
  assert.equal(saved.receipt.id, 'DEMO-0002');
  assert.equal(ledger.size, 2);
});

test('repeated registration returns the original record without creating another', () => {
  const ledger = createLedger();
  const first = registerInvoice(SCENARIOS.valid, ledger, 'manager');
  const second = registerInvoice(SCENARIOS.valid, ledger, 'manager');
  assert.equal(second.status, 'duplicate');
  assert.equal(second.existing.id, first.receipt.id);
  assert.equal(ledger.size, 2);
});

test('duplicate detection is insensitive to ID case, spacing and amount changes', () => {
  const document = SCENARIOS.duplicate.replace('NL-1041', ' nl-1041 ').replace('DEMO-01', 'demo-01').replace('480 000,00', '1,00');
  assert.equal(evaluateInvoice(document, createLedger()).status, 'duplicate');
});

test('the same invoice number from a different supplier remains distinct', () => {
  const document = SCENARIOS.duplicate.replace('DEMO-01', 'DEMO-02');
  assert.equal(evaluateInvoice(document, createLedger()).status, 'ready');
});

test('a missing supplier blocks registration for every role', () => {
  for (const role of ['manager', 'finance']) {
    const ledger = createLedger();
    const result = registerInvoice(SCENARIOS.missing, ledger, role);
    assert.equal(result.status, 'invalid');
    assert.ok(result.errors.some(message => message.includes('Код поставщика')));
    assert.equal(ledger.size, 1);
  }
});

test('the approval limit is inclusive and one tiyn over requires finance', () => {
  const atLimit = SCENARIOS.valid.replace('480 000,00', '500 000,00');
  const overLimit = atLimit.replace('500 000,00', '500 000,01');
  assert.equal(evaluateInvoice(atLimit, createLedger()).requiredRole, 'manager');
  const ledger = createLedger();
  assert.equal(registerInvoice(overLimit, ledger, 'manager').status, 'permission');
  assert.equal(ledger.size, 1);
  assert.equal(registerInvoice(overLimit, ledger, 'finance').status, 'registered');
});

test('unknown roles cannot approve even an invoice within the limit', () => {
  const ledger = createLedger();
  assert.equal(registerInvoice(SCENARIOS.valid, ledger, 'admin').status, 'permission');
  assert.equal(ledger.size, 1);
});

test('edited fields are revalidated at registration, including a new approval route', () => {
  const ledger = createLedger();
  evaluateInvoice(SCENARIOS.valid, ledger);
  assert.equal(registerInvoice(SCENARIOS.limit, ledger, 'manager').status, 'permission');
  assert.equal(registerInvoice(SCENARIOS.missing, ledger, 'finance').status, 'invalid');
  assert.equal(ledger.size, 1);
});

test('money parsing preserves tiyn precision and supports ordinary pasted spacing', () => {
  assert.equal(parseMoney('0,01 KZT'), 1);
  assert.equal(parseMoney('1,10 ₸'), 110);
  assert.equal(parseMoney('480\u00a0000,09 KZT'), 48_000_009);
  assert.equal(parseMoney('480\u202f000.99 тенге'), 48_000_099);
});

test('ambiguous, negative, unsupported and unsafe amounts are rejected', () => {
  for (const value of ['0', '-10', '1e5', '1,001', '1,000.00', '48 00', '500 USD', 'NaN', 'Infinity', '9999999999999999999999']) {
    assert.equal(parseMoney(value), null, value);
  }
});

test('duplicate and unknown document fields fail closed', () => {
  assert.equal(parseInvoice(SCENARIOS.valid + '\nСумма: 1 KZT').invoice, null);
  assert.equal(parseInvoice(SCENARIOS.valid + '\nСчет: NL-1043').invoice, null);
  assert.equal(parseInvoice(SCENARIOS.valid + '\nПолучатель: Другой').invoice, null);
});

test('calendar validation rejects impossible dates and accepts a leap day', () => {
  assert.equal(parseInvoice(SCENARIOS.valid.replace('11.09.2026', '31.02.2026')).invoice, null);
  assert.equal(parseInvoice(SCENARIOS.valid.replace('11.09.2026', '29.02.2026')).invoice, null);
  assert.ok(parseInvoice(SCENARIOS.valid.replace('11.09.2026', '29.02.2028')).invoice);
});

test('reset creates an independent ledger with only the labelled sample record', () => {
  const first = createLedger();
  registerInvoice(SCENARIOS.valid, first, 'manager');
  const reset = createLedger();
  assert.equal(reset.size, 1);
  assert.equal(evaluateInvoice(SCENARIOS.valid, reset).status, 'ready');
  assert.equal(evaluateInvoice(SCENARIOS.duplicate, reset).status, 'duplicate');
});

test('text and field-size limits return validation errors', () => {
  for (const text of ['', null, 'x'.repeat(2401), SCENARIOS.valid.replace('DEMO-01', 'x'.repeat(33))]) {
    const result = parseInvoice(text);
    assert.equal(result.invoice, null);
    assert.ok(result.errors.length > 0);
  }
});
