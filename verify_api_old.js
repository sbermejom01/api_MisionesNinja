const axios = require('axios');

const API_URL = 'http://localhost:3000';

async function verify() {
    console.log('--- Starting API Verification ---');

    let token;
    let ninjaId;

    try {
        // 1. Login
        console.log('1. Testing Login...');
        const loginRes = await axios.post(`${API_URL}/auth/login`, {
            username: 'naruto',
            password: 'ramen123'
        });
        token = loginRes.data.token;
        ninjaId = loginRes.data.ninja.id;
        console.log('✅ Login successful');

        const headers = { Authorization: `Bearer ${token}` };

        // 2. Get Missions
        console.log('\n2. Testing Get Missions...');
        const missionsRes = await axios.get(`${API_URL}/missions`, { headers });
        console.log(`✅ Found ${missionsRes.data.total} missions`);

        // 3. Accept Mission (Rank D - Success)
        console.log('\n3. Testing Accept Mission (Rank D)...');
        const acceptRes = await axios.patch(`${API_URL}/missions/1/accept`, {}, { headers });
        console.log(`✅ ${acceptRes.data.message}`);

        // 4. Accept Mission (Rank S - Failure, Genin vs S)
        console.log('\n4. Testing Accept Mission (Rank S - Should Fail)...');
        try {
            await axios.patch(`${API_URL}/missions/3/accept`, {}, { headers });
        } catch (error) {
            console.log(`✅ Expected failure: ${error.response.data.message}`);
        }

        // 5. Submit Report
        console.log('\n5. Testing Submit Report...');
        const reportRes = await axios.post(`${API_URL}/missions/1/report`, {
            reportText: 'Tora has been rescued. Naruto took some scratches.',
            evidenceImageUrl: 'https://naruto.fandom.com/wiki/Tora?file=Tora.png'
        }, { headers });
        console.log(`✅ ${reportRes.data.message}. Experience gained: ${reportRes.data.experienceGained}`);

        // 6. Get Stats
        console.log('\n6. Testing Get Stats...');
        const statsRes = await axios.get(`${API_URL}/ninjas/me/stats`, { headers });
        console.log('✅ Stats retrieved:', JSON.stringify(statsRes.data, null, 2));

        console.log('\n--- Verification Completed Successfully ---');
    } catch (error) {
        if (error.response) {
            console.error('❌ Verification failed (Response):', error.response.status, error.response.data);
        } else if (error.request) {
            console.error('❌ Verification failed (Request): No response received. Is the server running?');
        } else {
            console.error('❌ Verification failed (Setup):', error.message);
        }
    }
}

verify();
