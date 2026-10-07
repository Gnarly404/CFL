const functions = require("firebase-functions");
const admin = require("firebase-admin");
const crypto = require("crypto");
const sgMail = require('@sendgrid/mail');

admin.initializeApp();
const db = admin.firestore();

sgMail.setApiKey(functions.config().sendgrid.key);

function generateOtp() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}
function hash(input) {
    return crypto.createHash('sha256').update(input).digest('hex');
}

exports.requestOtp = functions.https.onCall(async (data) => {
    const { uid, email } = data;

    const otp = generateOtp();
    const hashed = hash(otp);

    await db.collection("login_otps").doc(uid).set({
        otp: hashed,
        createdAt: Date.now(),
        expires: Date.now() + 5 * 60 * 1000   // 5 minutes
    });

    await sgMail.send({
        to: email,
        from: "no-reply@yourapp.com",
        subject: "Your Login OTP",
        text: `Your OTP is: ${otp}`
    });

    return { success: true };
});

exports.verifyOtp = functions.https.onCall(async (data) => {
    const { uid, code } = data;

    const ref = db.collection("login_otps").doc(uid);
    const doc = await ref.get();
    if (!doc.exists) return { success: false };

    const record = doc.data();
    if (Date.now() > record.expires) return { success: false };

    if (hash(code) !== record.otp) return { success: false };

    await ref.delete(); // DELETE OTP after successful login
    return { success: true };
});
