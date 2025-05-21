import globalVariable from '../config/index.js'
import {transporter} from '../config/email.config.js'

export async function sendResetEmail(toEmail, resetLink) {

  const mailOptions = {
    from: globalVariable.emailAcount,
    to: toEmail,
    subject: 'Restablece tu contraseña',
    html: `<p>Haz clic en el siguiente enlace para restablecer tu contraseña:</p>
           <a href="${resetLink}">${resetLink}</a>
           <p>Si no solicitaste este cambio, ignora este correo.</p>`
  };

  try {
    await transporter.sendMail(mailOptions);
  } catch (error) {
    throw {
        error: "Error al enviar enlace."
    }
  }
}