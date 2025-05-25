import nodemailer from 'nodemailer';

import globalVariable from './index.js'

export const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: globalVariable.emailAcount,
    pass: globalVariable.emailPass
  }
});

