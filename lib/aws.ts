const configuredRoleArn = process.env.AWS_RUNTIME_ROLE_ARN || process.env.AWS_ROLE_ARN

if (!configuredRoleArn) {
  throw new Error("AWS_RUNTIME_ROLE_ARN or AWS_ROLE_ARN must be configured")
}

export const awsRoleArn: string = configuredRoleArn
