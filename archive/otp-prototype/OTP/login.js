// Request OTP
await httpsCallable(getFunctions(), "requestOtp")({
    uid: userCredential.user.uid,
    email: userCredential.user.email
});

// Show OTP input UI
document.getElementById("otp-section").style.display = "block";


async function verifyOtp() {
    const code = document.getElementById("otp-input").value;

    const result = await httpsCallable(getFunctions(), "verifyOtp")({
        uid: auth.currentUser.uid,
        code: code
    });

    if (result.data.success) {
        window.location.href = "Dashboard.html";  
    } else {
        alert("Invalid or expired OTP");
    }
}
