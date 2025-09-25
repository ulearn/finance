// api-test.js v5 - Test Payment Detail API endpoint (READ ONLY)
const axios = require('axios');

class PaymentDetailTester {
    constructor() {
        // Payment Detail API endpoint (what we want to get working)
        this.paymentDetailKey = 'e012597a49e0b3d0306f48e499505673';
        
        // Incoming Payment API endpoint (this one works - for reference)
        this.incomingPaymentKey = '4e289ca973cc2b424d58ec10197bd160';
        
        this.token = '9feb2576ba97b2743550120aa5dd935c';
        this.baseURL = 'https://ulearn.fidelo.com/api/1.0/gui2';
        
        // 30 second timeout
        this.timeout = 30000;
        
        // Test dates: Sept 1-2, 2025
        this.testDateFrom = '2025-09-01';
        this.testDateTo = '2025-09-02';
    }

    // Test 1: Simple GET with token and date filter
    async test1_SimpleGet() {
        console.log('\n=== Test 1: Payment Detail - Simple GET ===');
        const url = `${this.baseURL}/${this.paymentDetailKey}/search`;
        const params = `_token=${this.token}&filter[date]=${this.testDateFrom},${this.testDateTo}`;
        const fullUrl = `${url}?${params}`;
        
        console.log('URL:', fullUrl);
        console.log('Waiting up to 30 seconds...');
        
        try {
            const response = await axios.get(fullUrl, { 
                timeout: this.timeout,
                validateStatus: (status) => true 
            });
            
            console.log('Status:', response.status);
            if (response.status === 200) {
                console.log('✓ SUCCESS! Data received');
                console.log('Hits:', response.data.hits || 0);
            } else {
                console.log('✗ Error status:', response.status);
            }
        } catch (error) {
            console.log('✗ Failed:', error.message);
        }
    }

    // Test 2: POST method
    async test2_PostMethod() {
        console.log('\n=== Test 2: Payment Detail - POST method ===');
        const url = `${this.baseURL}/${this.paymentDetailKey}/search`;
        
        const postData = `token=${this.token}&filter[date]=${this.testDateFrom},${this.testDateTo}`;
        
        console.log('URL:', url);
        console.log('POST data:', postData);
        
        try {
            const response = await axios.post(url, postData, {
                timeout: this.timeout,
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                validateStatus: (status) => true
            });
            
            console.log('Status:', response.status);
            if (response.status === 200) {
                console.log('✓ SUCCESS via POST!');
                console.log('Hits:', response.data.hits || 0);
            } else {
                console.log('✗ Error status:', response.status);
            }
        } catch (error) {
            console.log('✗ Failed:', error.message);
        }
    }

    // Test 3: Try original Payment Detail format
    async test3_OriginalFormat() {
        console.log('\n=== Test 3: Payment Detail - Original format ===');
        const url = `${this.baseURL}/${this.paymentDetailKey}/search`;
        
        // Using the format from the Payment Detail documentation
        const params = `_token=${this.token}&filter[search_time_from_1]=01/09/2025&filter[search_time_until_1]=02/09/2025&filter[timefilter_basedon]=kip.payment_date`;
        
        console.log('URL:', `${url}?${params}`);
        
        try {
            const response = await axios.get(`${url}?${params}`, {
                timeout: this.timeout,
                validateStatus: (status) => true
            });
            
            console.log('Status:', response.status);
            if (response.status === 200) {
                console.log('✓ SUCCESS! Original format works');
                console.log('Hits:', response.data.hits || 0);
            } else {
                console.log('✗ Error status:', response.status);
            }
        } catch (error) {
            console.log('✗ Failed:', error.message);
        }
    }

    // Reference: Show Incoming Payment API (working)
    async testReference() {
        console.log('\n=== REFERENCE: Incoming Payment API (this works) ===');
        const url = `${this.baseURL}/${this.incomingPaymentKey}/search`;
        const params = `_token=${this.token}&filter[date]=${this.testDateFrom},${this.testDateTo}`;
        
        console.log('URL:', `${url}?${params}`);
        
        try {
            const response = await axios.get(`${url}?${params}`, {
                timeout: this.timeout,
                validateStatus: (status) => true
            });
            
            console.log('Status:', response.status);
            if (response.status === 200) {
                console.log('✓ Working as expected');
                console.log('Hits:', response.data.hits || 0);
                
                // Check for commission fields
                if (response.data.entries && Object.keys(response.data.entries).length > 0) {
                    const firstEntry = Object.values(response.data.entries)[0];
                    console.log('\nChecking for commission fields:');
                    Object.keys(firstEntry).forEach(key => {
                        if (key.includes('amount') || key.includes('fee') || key.includes('course')) {
                            console.log(`  - ${key}: ${firstEntry[key]}`);
                        }
                    });
                }
            }
        } catch (error) {
            console.log('✗ Failed:', error.message);
        }
    }

    // Run all tests
    async runAll() {
        console.log('========================================');
        console.log('PAYMENT DETAIL API TESTING v5');
        console.log('Target: e012597a49e0b3d0306f48e499505673');
        console.log('Dates: Sept 1-2, 2025');
        console.log('READ ONLY - No database writes');
        console.log('========================================');
        
        await this.test1_SimpleGet();
        await this.test2_PostMethod();
        await this.test3_OriginalFormat();
        await this.testReference();
        
        console.log('\n========================================');
        console.log('Testing complete');
    }
}

// Run the tests
if (require.main === module) {
    const tester = new PaymentDetailTester();
    tester.runAll().catch(console.error);
}

module.exports = PaymentDetailTester;