import axios from 'axios';

const API_URL = 'http://localhost:5000/auth';

const testAuth = async () => {
    try {
        // 1. Register
        console.log('Testing Registration...');
        const user = {
            name: 'Test User',
            email: `test${Date.now()}@example.com`,
            password: 'password123'
        };

        let res = await axios.post(`${API_URL}/register`, user);
        console.log('Registration Success:', res.status);
        const token = res.data.token;

        // 2. Login
        console.log('Testing Login...');
        res = await axios.post(`${API_URL}/login`, {
            email: user.email,
            password: user.password
        });
        console.log('Login Success:', res.status);

        // 3. Get Me
        console.log('Testing Get Profile...');
        res = await axios.get(`${API_URL}/me`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        console.log('Get Profile Success:', res.data.email === user.email);

        console.log('ALL TESTS PASSED');
    } catch (error: any) {
        console.error('Test Failed:', error.response ? error.response.data : error.message);
    }
};

testAuth();
