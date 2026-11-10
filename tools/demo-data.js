// Демонстрационные операции для показа и скриншотов: карта, вклад, кредит, платежи, переводы, анкета на проверке,
// заявка на ручном рассмотрении и задержанный перевод. Запускается после npm run db:seed на пустой базе.
// Использование: npm run db:demo
import { pool } from '../server/db/pool.js';
import { config } from '../server/config/index.js';
import * as userModel from '../server/modules/auth/user.model.js';
import * as clientModel from '../server/modules/clients/client.model.js';
import * as accountModel from '../server/modules/accounts/account.model.js';
import { register } from '../server/modules/auth/auth.service.js';
import { issueCard, purchase } from '../server/modules/cards/card.service.js';
import { openDeposit } from '../server/modules/deposits/deposit.service.js';
import { apply, requestSignCode, sign } from '../server/modules/loans/loan.service.js';
import { pay } from '../server/modules/payments/payment.service.js';
import * as transferService from '../server/modules/transfers/transfer.service.js';
import * as interbankService from '../server/modules/transfers/interbank.service.js';
import { buildIban } from '../server/shared/iban.js';

if (config.isProd) {
  console.error('db:demo создаёт демонстрационные операции и не запускается при NODE_ENV=production');
  process.exit(1);
}

const one = async (sql, params) => (await pool.query(sql, params)).rows[0];
const userOf = async (login) => {
  const user = await userModel.findByLogin(login);
  const client = await clientModel.findByUserId(user.id);
  const [account] = await accountModel.listByClient(client.id);
  return { user, client, account };
};

if ((await one("SELECT count(*) AS n FROM cards")).n > 0) {
  console.log('Демонстрационные операции уже есть, ничего не меняю.');
} else {
  const anna = await userOf('anna');
  const igor = await userOf('igor');

  const card = await issueCard(anna.user.id, { accountId: anna.account.id, system: 'visa', pin: '1234' });
  await purchase(anna.user.id, card.id, { amount: 1890, online: false, place: 'Евроопт, Минск' });
  await purchase(anna.user.id, card.id, { amount: 4500, online: true, place: 'Интернет-магазин' });

  const product = await one("SELECT id FROM deposit_products WHERE name = 'Талер 12'");
  await openDeposit(anna.user.id, { productId: product.id, sourceAccountId: anna.account.id, amount: 100000 });

  const provider = await one("SELECT id FROM payment_providers WHERE name = 'Энергосбыт'");
  await pay(anna.user.id, { providerId: provider.id, fromAccountId: anna.account.id, amount: 4250, requisite: '12345678', templateName: 'Свет, квартира' });
  const mobile = await one("SELECT id FROM payment_providers WHERE name = 'Мобильный оператор «Синий»'");
  await pay(anna.user.id, { providerId: mobile.id, fromAccountId: anna.account.id, amount: 1500, requisite: '+375291112233' });

  await transferService.createTransfer(anna.user.id, { kind: 'client', fromAccountId: anna.account.id, toIban: igor.account.iban, amount: 5000, comment: 'За обед' });

  // кредит Анны: заявка, подпись кодом, выдача
  const loanProduct = await one("SELECT id FROM loan_products WHERE name LIKE 'Потребительский «Талер»'");
  const application = await apply(anna.user.id, {
    productId: loanProduct.id, amount: 300000, termMonths: 12, scheduleType: 'annuity', targetAccountId: anna.account.id,
    income: 350000, obligations: 0, experienceMonths: 72, dependents: 0
  });
  if (application.status === 'approved') {
    const code = await requestSignCode(anna.user.id, application.id);
    await sign(anna.user.id, application.id, code);
  }

  // перевод в другой банк, ждёт клиринга
  const ib = await interbankService.createTransfer(anna.user.id, {
    fromAccountId: anna.account.id, iban: buildIban('DRZH', '3014', 777), name: 'Сидоров Павел', amount: 12000, purpose: 'Возврат долга'
  });
  await interbankService.confirm(anna.user.id, ib.transfer.id, ib.otpCode);

  // заявка Игоря на ручное рассмотрение: сумма выше лимита автоодобрения
  await apply(igor.user.id, {
    productId: loanProduct.id, amount: 900000, termMonths: 36, scheduleType: 'annuity', targetAccountId: igor.account.id,
    income: 280000, obligations: 20000, experienceMonths: 30, dependents: 1
  });

  // крупный перевод новому получателю задерживается антифродом
  await transferService.createTransfer(anna.user.id, { kind: 'client', fromAccountId: anna.account.id, toIban: igor.account.iban, amount: 320000, comment: 'Покупка автомобиля' });

  // анкета нового клиента на проверке
  await register({
    login: 'petr', password: 'Taler2026', passwordRepeat: 'Taler2026', lastName: 'Сидоров', firstName: 'Пётр', patronymic: 'Андреевич',
    idNumber: '3150390C003PB7', passport: 'MP2345678', phone: '+375447654321', birthDate: '1990-03-15', email: 'petr@example.by'
  });
  console.log('Демонстрационные операции созданы.');
}
await pool.end();
