import emailjs from '@emailjs/browser';

emailjs.init({
    publicKey: 'TzOyCSDwTHnIDp-DN'
});

export async function sendVerificationCode({
    email,
    name,
    passcode,
    expiresIn
}) {
    return emailjs.send(
        'service_6a534o8',
        'template_mx4dnx9',
        {
            email,
            name,
            passcode,
            time: expiresIn
        }
    );
}