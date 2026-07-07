import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { InvalidPhoneError } from './phone';

@Catch(InvalidPhoneError)
export class InvalidPhoneFilter implements ExceptionFilter {
  catch(exception: InvalidPhoneError, host: ArgumentsHost) {
    host
      .switchToHttp()
      .getResponse()
      .status(400)
      .json({ statusCode: 400, message: exception.message, error: 'Bad Request' });
  }
}
