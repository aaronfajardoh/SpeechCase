# Email Service Setup

This document explains how to set up the email service for sending support emails automatically.

## Overview

The support email functionality uses nodemailer with SMTP to send emails automatically. You need to configure SMTP credentials as Firebase secrets.

## Required Firebase Secrets

You need to set the following secrets using Firebase CLI:

1. **SMTP_HOST** - Your SMTP server hostname (e.g., `smtp.gmail.com`, `smtp-mail.outlook.com`)
2. **SMTP_PORT** - SMTP port (usually `587` for TLS or `465` for SSL)
3. **SMTP_USER** - Your SMTP username/email address
4. **SMTP_PASS** - Your SMTP password or app-specific password
5. **SUPPORT_EMAIL** - The email address to receive support requests (defaults to `aaronfajardoh@hotmail.com` if not set)

## Setting Up Secrets

### Important: Two Different Email Addresses

- **SMTP_USER** (`your-email@gmail.com`): The email account that will **SEND** the emails (the "from" address)
- **SUPPORT_EMAIL** (`aaronfajardoh@hotmail.com`): The email address that will **RECEIVE** the support emails (the "to" address)

These can be the same account, or different accounts. For example:
- You could use a Gmail account to send emails TO your Hotmail account
- Or use your Hotmail account to send emails TO itself

### Using Firebase CLI

**Example 1: Using Gmail to send to Hotmail**
```bash
# Set SMTP configuration (using Gmail to send)
echo -n "smtp.gmail.com" | firebase functions:secrets:set SMTP_HOST
echo -n "587" | firebase functions:secrets:set SMTP_PORT
echo -n "your-gmail-account@gmail.com" | firebase functions:secrets:set SMTP_USER
echo -n "your-gmail-app-password" | firebase functions:secrets:set SMTP_PASS
# SUPPORT_EMAIL defaults to aaronfajardoh@hotmail.com, so you can skip this line
```

**Example 2: Using Hotmail to send to itself**
```bash
# Set SMTP configuration (using Hotmail to send)
echo -n "smtp-mail.outlook.com" | firebase functions:secrets:set SMTP_HOST
echo -n "587" | firebase functions:secrets:set SMTP_PORT
echo -n "aaronfajardoh@hotmail.com" | firebase functions:secrets:set SMTP_USER
echo -n "your-hotmail-password" | firebase functions:secrets:set SMTP_PASS
# SUPPORT_EMAIL defaults to aaronfajardoh@hotmail.com, so you can skip this line
```

### Gmail Setup

If using Gmail to **SEND** emails:

1. **SMTP_USER**: Use your Gmail address (e.g., `yourname@gmail.com`)
   - This is the account that will send the emails

2. **SMTP_PASS**: You need to generate an App Password (NOT your regular Gmail password):
   - Enable 2-Step Verification on your Google account (if not already enabled)
   - Go to [Google Account settings](https://myaccount.google.com/)
   - Security → 2-Step Verification → App passwords
   - Generate a new app password for "Mail"
   - Copy the 16-character password (it will look like: `abcd efgh ijkl mnop`)
   - Use this app password as `SMTP_PASS`

3. Use these settings:
   - **SMTP_HOST**: `smtp.gmail.com`
   - **SMTP_PORT**: `587`
   - **SMTP_USER**: Your Gmail address (e.g., `yourname@gmail.com`)
   - **SMTP_PASS**: The 16-character app password (no spaces)

### Outlook/Hotmail Setup

If using Outlook/Hotmail to **SEND** emails:

1. **SMTP_USER**: Use your Outlook/Hotmail address (e.g., `aaronfajardoh@hotmail.com`)
   - This is the account that will send the emails

2. **SMTP_PASS**: Use your Outlook/Hotmail account password
   - If you have 2FA enabled, you may need to generate an app password instead
   - Go to [Microsoft Account Security](https://account.microsoft.com/security) → Advanced security options → App passwords

3. Use these settings:
   - **SMTP_HOST**: `smtp-mail.outlook.com`
   - **SMTP_PORT**: `587`
   - **SMTP_USER**: Your Outlook/Hotmail address (e.g., `aaronfajardoh@hotmail.com`)
   - **SMTP_PASS**: Your account password or app password

### Other SMTP Providers

You can use any SMTP provider. Common ones:
- **SendGrid**: `smtp.sendgrid.net` (port 587)
- **Mailgun**: `smtp.mailgun.org` (port 587)
- **AWS SES**: Check AWS SES documentation for your region's SMTP endpoint

## Installing Dependencies

Make sure to install nodemailer in the functions directory:

```bash
cd functions
npm install nodemailer
```

## Testing

After setting up the secrets and deploying the function, test it by:

1. Going to the Dashboard → Support
2. Filling out the form with your email and a test message
3. Optionally attaching a screenshot
4. Clicking "Send Message"

The email should be sent automatically to the configured support email address.

## Troubleshooting

### Error: "SMTP configuration not set"
- Make sure all required secrets are set using `firebase functions:secrets:set`
- Redeploy the function after setting secrets: `firebase deploy --only functions:sendSupportEmail`

### Error: "Authentication failed"
- Verify your SMTP credentials are correct
- For Gmail, make sure you're using an App Password, not your regular password
- Check that 2-Step Verification is enabled (for Gmail)

### Error: "Connection timeout"
- Verify the SMTP_HOST and SMTP_PORT are correct
- Check your firewall/network settings
- Some providers require specific IP whitelisting

## Security Notes

- Never commit SMTP credentials to version control
- Always use Firebase secrets for sensitive configuration
- Consider using app-specific passwords instead of main account passwords
- Regularly rotate your SMTP passwords

