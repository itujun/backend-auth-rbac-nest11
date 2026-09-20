import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';

const sendMailMock = jest.fn().mockResolvedValue(undefined);
const createTransportMock = jest.fn(() => ({ sendMail: sendMailMock }));

jest.mock('nodemailer', () => ({
  createTransport: (...args: Parameters<typeof createTransportMock>) =>
    createTransportMock(...args),
}));

describe('MailService', () => {
  let service: MailService;
  let configValues: Record<string, unknown>;

  beforeEach(async () => {
    jest.clearAllMocks();
    configValues = {
      'mail.host': 'localhost',
      'mail.port': 1025,
      'mail.secure': false,
      'mail.user': undefined,
      'mail.password': undefined,
      'mail.from': '"Access Console" <no-reply@access-console.local>',
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        MailService,
        {
          provide: ConfigService,
          useValue: { get: (key: string) => configValues[key] },
        },
      ],
    }).compile();

    service = moduleRef.get(MailService);
    service.onModuleInit();
  });

  it('membentuk transporter dari config Maildev (tanpa auth) saat init', () => {
    expect(createTransportMock).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'localhost',
        port: 1025,
        secure: false,
        auth: undefined,
      }),
    );
  });

  it('meneruskan from/to/subject/html apa adanya ke transporter.sendMail', async () => {
    await service.sendMail({
      to: 'user@example.com',
      subject: 'Halo',
      html: '<p>Hi</p>',
    });

    expect(sendMailMock).toHaveBeenCalledWith({
      from: '"Access Console" <no-reply@access-console.local>',
      to: 'user@example.com',
      subject: 'Halo',
      html: '<p>Hi</p>',
    });
  });

  it('menyertakan auth kalau SMTP_USER diisi (mis. sudah pindah ke provider asli)', () => {
    configValues['mail.user'] = 'apikey';
    configValues['mail.password'] = 'secret';

    service.onModuleInit();

    expect(createTransportMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ auth: { user: 'apikey', pass: 'secret' } }),
    );
  });
});
