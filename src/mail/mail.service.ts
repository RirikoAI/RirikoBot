import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { I18nContext } from 'nestjs-i18n';
import { MailData } from './interfaces/mail-data.interface';
import { AllConfigType } from 'src/config/config.type';
import { MaybeType } from '#util/types/maybe.type';
import { MailerService } from '#mail/mailer/mailer.service';
import path from 'path';

@Injectable()
export class MailService {
  constructor(
    private readonly mailerService: MailerService,
    private readonly configService: ConfigService<AllConfigType>,
  ) {}

  async userSignUp(mailData: MailData<{ hash: string }>): Promise<void> {
    const i18n = I18nContext.current();
    let emailConfirmTitle: MaybeType<string>;
    let text1: MaybeType<string>;
    let text2: MaybeType<string>;
    let text3: MaybeType<string>;

    if (i18n) {
      [emailConfirmTitle, text1, text2, text3] = await Promise.all([
        i18n.t('common.confirmEmail'),
        i18n.t('confirm-email.text1'),
        i18n.t('confirm-email.text2'),
        i18n.t('confirm-email.text3'),
      ]);
    }

    await this.mailerService.sendMail({
      to: mailData.to,
      subject: emailConfirmTitle,
      text: `${this.configService.get('app.frontendURL', {
        infer: true,
      })}/confirm-email/${mailData.data.hash} ${emailConfirmTitle}`,
      templatePath: path.join(
        this.configService.getOrThrow('app.workingDirectory', {
          infer: true,
        }),
        'src',
        'mail',
        'mail-templates',
        'activation.hbs',
      ),
      context: {
        title: emailConfirmTitle,
        url: `${this.configService.get('app.frontendURL', {
          infer: true,
        })}/confirm-email/${mailData.data.hash}`,
        actionTitle: emailConfirmTitle,
        app_name: this.configService.get('app.name', { infer: true }),
        text1,
        text2,
        text3,
      },
    });
  }

  async userCreatedByAdmin(mailData: {
    initialPass: string | undefined;
    to: string | null;
  }): Promise<void> {
    const i18n = I18nContext.current();
    let accountCreatedTitle: MaybeType<string>;
    let text1: MaybeType<string>;
    let text2: MaybeType<string>;
    let text3: MaybeType<string>;
    let loginButton: MaybeType<string>;
    let initialPassText: MaybeType<string>;

    if (i18n) {
      [accountCreatedTitle, text1, text2, text3, loginButton, initialPassText] =
        await Promise.all([
          i18n.t('common.accountCreatedTitle'),
          i18n.t('account-created.text1'),
          i18n.t('account-created.text2'),
          i18n.t('account-created.text3'),
          i18n.t('account-created.loginButton'),
          i18n.t('account-created.initialPassText'),
        ]);
    }

    await this.mailerService.sendMail({
      to: mailData.to,
      subject: accountCreatedTitle,
      text: `${this.configService.get('app.frontendURL', {
        infer: true,
      })}/login} ${accountCreatedTitle}`,
      templatePath: path.join(
        this.configService.getOrThrow('app.workingDirectory', {
          infer: true,
        }),
        'src',
        'mail',
        'mail-templates',
        'new-account.hbs',
      ),
      context: {
        title: accountCreatedTitle,
        url: `${this.configService.get('app.frontendURL', {
          infer: true,
        })}/login`,
        actionTitle: loginButton,
        app_name: this.configService.get('app.name', { infer: true }),
        text1,
        text2,
        text3,
        initialPassText,
        initPassword: mailData.initialPass,
      },
    });
  }

  async forgotPassword(mailData: MailData<{ hash: string }>): Promise<void> {
    const i18n = I18nContext.current();
    let resetPasswordTitle: MaybeType<string>;
    let text1: MaybeType<string>;
    let text2: MaybeType<string>;
    let text3: MaybeType<string>;
    let text4: MaybeType<string>;

    if (i18n) {
      [resetPasswordTitle, text1, text2, text3, text4] = await Promise.all([
        i18n.t('common.resetPassword'),
        i18n.t('reset-password.text1'),
        i18n.t('reset-password.text2'),
        i18n.t('reset-password.text3'),
        i18n.t('reset-password.text4'),
      ]);
    }

    await this.mailerService.sendMail({
      to: mailData.to,
      subject: resetPasswordTitle,
      text: `${this.configService.get('app.frontendURL', {
        infer: true,
      })}/password-change/${mailData.data.hash} ${resetPasswordTitle}`,
      templatePath: path.join(
        this.configService.getOrThrow('app.workingDirectory', {
          infer: true,
        }),
        'src',
        'mail',
        'mail-templates',
        'reset-password.hbs',
      ),
      context: {
        title: resetPasswordTitle,
        url: `${this.configService.get('app.frontendURL', {
          infer: true,
        })}/password-change/${mailData.data.hash}`,
        actionTitle: resetPasswordTitle,
        app_name: this.configService.get('app.name', {
          infer: true,
        }),
        text1,
        text2,
        text3,
        text4,
      },
    });
  }
}
