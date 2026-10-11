/**
 * Ошибка, понятная пользователю. Её сообщение можно показывать в интерфейсе.
 */
export class AppError extends Error {
  /**
   * @param {string} message сообщение на русском
   * @param {number} [status] HTTP-статус
   * @param {string} [code] машинный код ошибки
   */
  constructor(message, status = 400, code = 'app_error') {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
  }
}

/** Неверные данные формы. fields: { имяПоля: 'сообщение' } */
export class ValidationError extends AppError {
  constructor(fields, message = 'Проверьте введённые данные') {
    super(message, 422, 'validation');
    this.fields = fields;
  }
}

/** Нарушено бизнес-правило (недостаточно средств, превышен лимит и т. п.). */
export class BusinessError extends AppError {
  constructor(message, code = 'business_rule') {
    super(message, 409, code);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Недостаточно прав для этого действия') {
    super(message, 403, 'forbidden');
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Страница или запись не найдена') {
    super(message, 404, 'not_found');
  }
}
