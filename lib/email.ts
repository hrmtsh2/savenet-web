import { SendEmailCommand, SESv2Client } from "@aws-sdk/client-sesv2"
import { awsCredentialsProvider } from "@vercel/functions/oidc"

const client = new SESv2Client({
  region: process.env.AWS_REGION,
  credentials: awsCredentialsProvider({
    roleArn: process.env.AWS_ROLE_ARN!,
    clientConfig: { region: process.env.AWS_REGION },
  }),
})

export async function sendEmail(input: { to: string; subject: string; html: string; text: string }) {
  const from = process.env.SES_FROM_EMAIL
  if (!from) throw new Error("SES_FROM_EMAIL is not configured")
  await client.send(new SendEmailCommand({
    FromEmailAddress: from,
    Destination: { ToAddresses: [input.to] },
    Content: {
      Simple: {
        Subject: { Data: input.subject, Charset: "UTF-8" },
        Body: {
          Html: { Data: input.html, Charset: "UTF-8" },
          Text: { Data: input.text, Charset: "UTF-8" },
        },
      },
    },
  }))
}
