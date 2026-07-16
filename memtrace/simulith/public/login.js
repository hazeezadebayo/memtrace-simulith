async function sendIdTokenToBackend(idToken) {
    const statusDiv = document.querySelector('.status');
    statusDiv.innerHTML = 'VALIDATING_CREDENTIALS...';
    try {
        const res = await fetch('/api/auth/google', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: idToken })
        });
        const data = await res.json();
        if (data.success) {
            window.location.href = '/simulith/workspace.html';
        } else {
            alert('Login failed: ' + data.error);
            statusDiv.innerHTML = 'SECURE_ACCESS_REQUIRED';
        }
    } catch (err) {
        console.error('Login error:', err);
        alert('An error occurred during login.');
        statusDiv.innerHTML = 'SECURE_ACCESS_REQUIRED';
    }
}

function initGoogleAuth(retries = 10) {
    if (typeof google === 'undefined' || !google.accounts) {
        if (retries > 0) setTimeout(() => initGoogleAuth(retries - 1), 300);
        return;
    }
    let tokenClient;
    document.getElementById('customGoogleBtn').addEventListener('click', () => {
        if (!tokenClient) {
            tokenClient = google.accounts.oauth2.initTokenClient({
                client_id: '624961239870-bu25msh0hsbki5c14cca9ucudacu17ge.apps.googleusercontent.com',
                scope: 'openid email profile',
                callback: (response) => {
                    if (response.error) {
                        alert('Login failed: ' + response.error);
                        return;
                    }
                    sendIdTokenToBackend(response.id_token);
                },
                error_callback: (error) => {
                    console.error('Google OAuth error:', error);
                    alert('Authentication error: ' + (error.message || 'Unknown error'));
                }
            });
        }
        tokenClient.requestAccessToken();
    });
}
document.addEventListener('DOMContentLoaded', initGoogleAuth);
