import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

const gmailUser = process.env.GMAIL_USER ? process.env.GMAIL_USER.trim() : '';
const gmailPass = process.env.GMAIL_APP_PASSWORD ? process.env.GMAIL_APP_PASSWORD.trim() : '';

export const isMailConfigured = Boolean(
  gmailUser &&
  gmailPass &&
  !gmailPass.includes('placeholder')
);

/**
 * Gmail SMTP Transporter using Nodemailer
 * Host: smtp.gmail.com
 * Port: 465
 * Secure: true (SSL/TLS)
 */
export const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: {
    user: gmailUser,
    pass: gmailPass
  }
});

export default transporter;
