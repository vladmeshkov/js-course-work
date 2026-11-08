import { pool, withTransaction } from '../server/db/pool.js';
import { openClientAccount, ensureInternalAccount } from '../server/modules/accounts/account.service.js';
import * as userModel from '../server/modules/auth/user.model.js';
import * as clientModel from '../server/modules/clients/client.model.js';
import { encrypt, lookupHash } from '../server/shared/crypto.js';

let counter = 0;

/** Создаёт верифицированного клиента с текущим счётом в BYN и заданным остатком (взнос через кассу). */
export async function createClientWithAccount(startBalance = 0, currency = 'BYN', passwordHash = 'x') {
  const n = ++counter + Math.floor(Math.random() * 1e6);
  return withTransaction(async (db) => {
    const userId = await userModel.create(db, { login: `client${n}`, passwordHash, roleCode: 'client' });
    const clientId = await clientModel.create(db, {
      userId, lastName: 'Тестов', firstName: 'Тест', birthDate: '1990-01-01', phone: '+375291234567',
      idNumberEnc: encrypt(`ID${n}`), idNumberHash: lookupHash(`ID${n}`), passportEnc: encrypt('MC1234567')
    });
    await clientModel.setKycStatus(db, clientId, 'verified');
    const account = await openClientAccount(db, { clientId, kind: 'current', currency });
    if (startBalance > 0) {
      const { post } = await import('../server/modules/ledger/ledger.service.js');
      const cash = await ensureInternalAccount(db, 'cash', currency);
      await post({ type: 'cash_in', entries: [{ debit: cash.id, credit: account.id, amount: startBalance, currency }] }, db);
    }
    return { userId, clientId, accountId: account.id, login: `client${n}` };
  });
}

export async function accountBalance(id) {
  const { rows } = await pool.query('SELECT balance FROM accounts WHERE id = ?', [id]);
  return rows[0].balance;
}

export async function closePool() {
  await pool.end();
}

/** Открывает клиенту ещё один счёт и кладёт на него деньги через кассу. */
export async function addAccount(clientId, currency, startBalance = 0, kind = 'current') {
  return withTransaction(async (db) => {
    const account = await openClientAccount(db, { clientId, kind, currency });
    if (startBalance > 0) {
      const { post } = await import('../server/modules/ledger/ledger.service.js');
      const cash = await ensureInternalAccount(db, 'cash', currency);
      await post({ type: 'cash_in', entries: [{ debit: cash.id, credit: account.id, amount: startBalance, currency }] }, db);
    }
    return account;
  });
}

export async function getAccount(id) {
  const { rows } = await pool.query('SELECT * FROM accounts WHERE id = ?', [id]);
  return rows[0];
}
