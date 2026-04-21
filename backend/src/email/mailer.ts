import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const sesClient = new SESClient({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

function loadTemplate(templateName: string, variables: Record<string, string>): string {
  const templatePath = path.join(__dirname, 'templates', templateName);
  let html = fs.readFileSync(templatePath, 'utf-8');

  for (const [key, value] of Object.entries(variables)) {
    html = html.replaceAll(`{%${key}%}`, value);
  }

  return html;
}

export async function sendVerificationEmail(to: string, code: string): Promise<void> {
  const html = loadTemplate('verification-template.html', {
    verification_code:  code.toString().split('').join(' '),
  });

  await sesClient.send(
    new SendEmailCommand({
      Source: `"Transcendence Team" <${process.env.SES_FROM_EMAIL}>`,
      Destination: { ToAddresses: [to] },
      Message: {
        Subject: { Data: 'Your Verification Code', Charset: 'UTF-8' },
        Body: { Html: { Data: html, Charset: 'UTF-8' } },
      },
    }),
  );
}
