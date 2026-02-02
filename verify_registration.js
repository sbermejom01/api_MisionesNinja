const axios = require('axios');

const API_URL = 'http://localhost:3000';

async function verifyRegistration() {
    console.log('--- Starting Registration Verification ---');

    const testUser = {
        username: 'sasuke_' + Date.now(),
        password: 'uchihapower',
        rank: 'Genin'
    };

    try {
        // 1. Register
        console.log('1. Testing Registration...');
        const registerRes = await axios.post(`${API_URL}/auth/register`, testUser);
        console.log('✅ Registration successful');
        console.log('User data:', JSON.stringify(registerRes.data.ninja, null, 2));

        const token = registerRes.data.token;
        const headers = { Authorization: `Bearer ${token}` };

        // 2. Verify Login with new user
        console.log('\n2. Testing Login with new user...');
        const loginRes = await axios.post(`${API_URL}/auth/login`, {
            username: testUser.username,
            password: testUser.password
        });
        console.log('✅ Login successful for new user');

        // 3. Verify Stats for new user
        console.log('\n3. Testing Get Stats for new user...');
        const statsRes = await axios.get(`${API_URL}/ninjas/me/stats`, { headers });
        console.log('✅ Stats retrieved:', JSON.stringify(statsRes.data, null, 2));

        if (statsRes.data.profile.rank === testUser.rank) {
            console.log('✅ Rank correctly assigned');
        } else {
            console.error('❌ Rank mismatch!');
        }

        console.log('\n--- Registration Verification Completed Successfully ---');
    } catch (error) {
        if (error.response) {
            console.error('❌ Verification failed (Response):', error.response.status, error.response.data);
        } else {
            console.error('❌ Verification failed:', error.message);
        }
    }
}

verifyRegistration();
