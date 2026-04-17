const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_APP_PASSWORD
    }
});

/**
 * Send OTP email
 * @param {string} to - recipient email
 * @param {string} otp - 6-digit OTP code
 */
const sendOtpEmail = async (to, otp) => {
    const mailOptions = {
        from: `"College Pe Charcha" <${process.env.EMAIL_USER}>`,
        to,
        subject: '🔐 Your Verification Code - College Pe Charcha',
        html: `
            <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 480px; margin: 0 auto; background: #FFFBF2; border-radius: 16px; overflow: hidden; border: 1px solid #fed7aa;">
                <div style="background: linear-gradient(135deg, #f68014, #ea580c); padding: 32px 24px; text-align: center;">
                    <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 800;">College Pe Charcha</h1>
                    <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0; font-size: 14px;">Official Portal</p>
                </div>
                <div style="padding: 32px 24px; text-align: center;">
                    <h2 style="color: #1f2937; margin: 0 0 8px; font-size: 20px;">Verify Your Email</h2>
                    <p style="color: #6b7280; margin: 0 0 24px; font-size: 14px; line-height: 1.5;">
                        Use the code below to complete your registration. This code expires in <strong>5 minutes</strong>.
                    </p>
                    <div style="background: white; border: 2px dashed #f68014; border-radius: 12px; padding: 20px; margin: 0 auto; display: inline-block;">
                        <span style="font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #f68014; font-family: 'Courier New', monospace;">${otp}</span>
                    </div>
                    <p style="color: #9ca3af; margin: 24px 0 0; font-size: 12px; line-height: 1.5;">
                        If you didn't request this code, you can safely ignore this email.
                    </p>
                </div>
                <div style="background: #f9fafb; padding: 16px 24px; text-align: center; border-top: 1px solid #e5e7eb;">
                    <p style="color: #9ca3af; margin: 0; font-size: 11px;">© College Pe Charcha • Do not share this code with anyone</p>
                </div>
            </div>
        `
    };

    await transporter.sendMail(mailOptions);
};

/**
 * Send password reset OTP email
 * @param {string} to - recipient email
 * @param {string} otp - 6-digit OTP code
 */
const sendResetOtpEmail = async (to, otp) => {
    const mailOptions = {
        from: `"College Pe Charcha" <${process.env.EMAIL_USER}>`,
        to,
        subject: '🔑 Password Reset Code - College Pe Charcha',
        html: `
            <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 480px; margin: 0 auto; background: #FFFBF2; border-radius: 16px; overflow: hidden; border: 1px solid #fed7aa;">
                <div style="background: linear-gradient(135deg, #f68014, #ea580c); padding: 32px 24px; text-align: center;">
                    <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 800;">College Pe Charcha</h1>
                    <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0; font-size: 14px;">Official Portal</p>
                </div>
                <div style="padding: 32px 24px; text-align: center;">
                    <h2 style="color: #1f2937; margin: 0 0 8px; font-size: 20px;">Reset Your Password</h2>
                    <p style="color: #6b7280; margin: 0 0 24px; font-size: 14px; line-height: 1.5;">
                        Use the code below to reset your password. This code expires in <strong>5 minutes</strong>.
                    </p>
                    <div style="background: white; border: 2px dashed #f68014; border-radius: 12px; padding: 20px; margin: 0 auto; display: inline-block;">
                        <span style="font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #f68014; font-family: 'Courier New', monospace;">${otp}</span>
                    </div>
                    <p style="color: #9ca3af; margin: 24px 0 0; font-size: 12px; line-height: 1.5;">
                        If you didn't request a password reset, you can safely ignore this email.
                    </p>
                </div>
                <div style="background: #f9fafb; padding: 16px 24px; text-align: center; border-top: 1px solid #e5e7eb;">
                    <p style="color: #9ca3af; margin: 0; font-size: 11px;">© College Pe Charcha • Do not share this code with anyone</p>
                </div>
            </div>
        `
    };

    await transporter.sendMail(mailOptions);
};

module.exports = { sendOtpEmail, sendResetOtpEmail };
