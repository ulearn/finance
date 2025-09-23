const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
const MySQLDataProvider = require('./mysql-data');

const router = express.Router();
const dataProvider = new MySQLDataProvider();

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '../../../uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `sales-data-${timestamp}-${file.originalname}`;
        cb(null, filename);
    }
});

const upload = multer({
    storage: storage,
    fileFilter: (req, file, cb) => {
        const allowedTypes = [
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-excel',
            'text/csv'
        ];

        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Please upload Excel (.xlsx) or CSV files only.'));
        }
    },
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    }
});

// Upload endpoint
router.post('/upload', upload.single('salesFile'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'No file uploaded'
            });
        }

        console.log(`Processing uploaded file: ${req.file.filename}`);

        // Parse the Excel/CSV file
        const workbook = XLSX.readFile(req.file.path);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);

        console.log(`Parsed ${jsonData.length} rows from ${sheetName}`);

        // Validate and transform data
        const validationResult = validateAndTransformData(jsonData);

        if (!validationResult.success) {
            // Clean up uploaded file
            fs.unlinkSync(req.file.path);
            return res.status(400).json(validationResult);
        }

        // Insert data into database
        const insertResult = await dataProvider.insertSalesData(validationResult.data);

        // Clean up uploaded file after processing
        fs.unlinkSync(req.file.path);

        res.json({
            success: insertResult.success,
            message: insertResult.message,
            inserted: insertResult.inserted,
            validation: {
                totalRows: jsonData.length,
                validRows: validationResult.data.length,
                invalidRows: jsonData.length - validationResult.data.length
            },
            error: insertResult.error || null
        });

    } catch (error) {
        console.error('Upload processing error:', error);

        // Clean up uploaded file on error
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }

        res.status(500).json({
            success: false,
            error: 'Failed to process uploaded file: ' + error.message
        });
    }
});

// Get upload form
router.get('/', (req, res) => {
    res.send(getUploadFormHTML());
});

// Data validation and transformation
function validateAndTransformData(jsonData) {
    const validData = [];
    const errors = [];

    for (let i = 0; i < jsonData.length; i++) {
        const row = jsonData[i];
        const rowNumber = i + 2; // +2 because Excel starts at 1 and we skip header

        try {
            // Required fields validation
            if (!row.surname || !row.first_name) {
                errors.push(`Row ${rowNumber}: Missing surname or first_name`);
                continue;
            }

            if (!row.amount || isNaN(parseFloat(row.amount))) {
                errors.push(`Row ${rowNumber}: Invalid or missing amount`);
                continue;
            }

            if (!row.payment_date) {
                errors.push(`Row ${rowNumber}: Missing payment_date`);
                continue;
            }

            // Parse and validate date
            let paymentDate;
            try {
                paymentDate = new Date(row.payment_date);
                if (isNaN(paymentDate.getTime())) {
                    throw new Error('Invalid date');
                }
            } catch (dateError) {
                errors.push(`Row ${rowNumber}: Invalid payment_date format`);
                continue;
            }

            // Determine channel (B2C vs B2B)
            const channel = determineChannel(row);

            // Create month_year for indexing
            const monthYear = paymentDate.toISOString().slice(0, 7); // YYYY-MM

            // Transform data to match database schema
            const transformedRow = {
                surname: String(row.surname || '').trim(),
                first_name: String(row.first_name || '').trim(),
                invoice_numbers: String(row.invoice_numbers || '').trim(),
                student_id: String(row.student_id || '').trim(),
                payment_method: String(row.payment_method || '').trim(),
                salesperson: String(row.salesperson || '').trim(),
                group_name: String(row.group_name || '').trim(),
                student_status: String(row.student_status || '').trim(),
                agent: String(row.agent || '').trim(),
                agency_category: String(row.agency_category || '').trim(),
                agency_number: String(row.agency_number || '').trim(),
                course: String(row.course || '').trim(),
                course_end: parseDate(row.course_end),
                course_start: parseDate(row.course_start),
                course_absolute_weeks: parseInt(row.course_absolute_weeks) || null,
                accommodation: String(row.accommodation || '').trim(),
                accommodation_start_date: parseDate(row.accommodation_start_date),
                accommodation_end_date: parseDate(row.accommodation_end_date),
                note: String(row.note || '').trim(),
                receipt_number: String(row.receipt_number || '').trim(),
                amount: parseFloat(row.amount) || 0,
                course_fee: parseFloat(row.course_fee) || 0,
                accommodation_fee: parseFloat(row.accommodation_fee) || 0,
                transfer_fee: parseFloat(row.transfer_fee) || 0,
                insurance_fee: parseFloat(row.insurance_fee) || 0,
                additional_course_fees: parseFloat(row.additional_course_fees) || 0,
                additional_accommodation_fees: parseFloat(row.additional_accommodation_fees) || 0,
                general_additional_fees: parseFloat(row.general_additional_fees) || 0,
                manually_entered_positions: parseFloat(row.manually_entered_positions) || 0,
                overpayment: parseFloat(row.overpayment) || 0,
                payment_date: paymentDate.toISOString().slice(0, 10), // YYYY-MM-DD
                data_source: 'excel_upload',
                channel: channel,
                month_year: monthYear
            };

            validData.push(transformedRow);

        } catch (error) {
            errors.push(`Row ${rowNumber}: ${error.message}`);
        }
    }

    return {
        success: errors.length === 0 || validData.length > 0,
        data: validData,
        errors: errors,
        message: errors.length > 0 ?
            `Processed with ${errors.length} errors. ${validData.length} valid rows.` :
            `Successfully validated ${validData.length} rows.`
    };
}

// Determine if transaction is B2C or B2B based on data patterns
function determineChannel(row) {
    // Check for agency indicators (B2B)
    if (row.agent && row.agent.trim() !== '' && row.agent.toLowerCase() !== 'direct') {
        return 'B2B';
    }

    if (row.agency_category && row.agency_category.trim() !== '') {
        return 'B2B';
    }

    if (row.agency_number && row.agency_number.trim() !== '') {
        return 'B2B';
    }

    // Check for group bookings (typically B2B)
    if (row.group_name && row.group_name.trim() !== '' && row.group_name.toLowerCase() !== 'individual') {
        return 'B2B';
    }

    // Default to B2C for direct bookings
    return 'B2C';
}

// Parse date safely
function parseDate(dateValue) {
    if (!dateValue) return null;

    try {
        const date = new Date(dateValue);
        if (isNaN(date.getTime())) return null;
        return date.toISOString().slice(0, 10); // YYYY-MM-DD
    } catch (error) {
        return null;
    }
}

// HTML form for file upload
function getUploadFormHTML() {
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Sales Data Upload</title>
        <style>
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }

            body {
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                min-height: 100vh;
                padding: 20px;
            }

            .container {
                max-width: 800px;
                margin: 0 auto;
                background: rgba(255, 255, 255, 0.95);
                border-radius: 20px;
                padding: 40px;
                box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
            }

            .header {
                text-align: center;
                margin-bottom: 40px;
            }

            .header h1 {
                color: #2c3e50;
                font-size: 2.5em;
                margin-bottom: 10px;
            }

            .header p {
                color: #7f8c8d;
                font-size: 1.1em;
            }

            .upload-section {
                background: white;
                border-radius: 15px;
                padding: 30px;
                box-shadow: 0 5px 15px rgba(0, 0, 0, 0.08);
                margin-bottom: 30px;
            }

            .file-upload {
                border: 2px dashed #667eea;
                border-radius: 10px;
                padding: 40px;
                text-align: center;
                margin-bottom: 20px;
                transition: all 0.3s ease;
            }

            .file-upload:hover {
                border-color: #764ba2;
                background: rgba(102, 126, 234, 0.05);
            }

            .file-upload input[type="file"] {
                display: none;
            }

            .file-upload label {
                cursor: pointer;
                color: #667eea;
                font-size: 1.2em;
                font-weight: 600;
            }

            .file-upload .file-info {
                margin-top: 10px;
                color: #7f8c8d;
                font-size: 0.9em;
            }

            .upload-btn {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                border: none;
                padding: 15px 30px;
                border-radius: 8px;
                font-size: 1.1em;
                font-weight: 600;
                cursor: pointer;
                width: 100%;
                transition: all 0.3s ease;
            }

            .upload-btn:hover {
                transform: translateY(-2px);
                box-shadow: 0 10px 20px rgba(102, 126, 234, 0.3);
            }

            .upload-btn:disabled {
                opacity: 0.6;
                cursor: not-allowed;
                transform: none;
            }

            .requirements {
                background: #f8f9fa;
                border-radius: 10px;
                padding: 20px;
                margin-bottom: 20px;
            }

            .requirements h3 {
                color: #2c3e50;
                margin-bottom: 15px;
            }

            .requirements ul {
                color: #7f8c8d;
                padding-left: 20px;
            }

            .requirements li {
                margin-bottom: 8px;
            }

            .result-container {
                display: none;
                margin-top: 20px;
                padding: 20px;
                border-radius: 10px;
            }

            .result-success {
                background: #d4edda;
                border: 1px solid #c3e6cb;
                color: #155724;
            }

            .result-error {
                background: #f8d7da;
                border: 1px solid #f5c6cb;
                color: #721c24;
            }

            .loading {
                display: none;
                text-align: center;
                margin-top: 20px;
            }

            .spinner {
                border: 4px solid #f3f3f3;
                border-top: 4px solid #667eea;
                border-radius: 50%;
                width: 40px;
                height: 40px;
                animation: spin 1s linear infinite;
                margin: 0 auto 10px;
            }

            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>Sales Data Upload</h1>
                <p>Upload Excel or CSV files to update commission calculations</p>
            </div>

            <div class="upload-section">
                <div class="requirements">
                    <h3>File Requirements:</h3>
                    <ul>
                        <li>Excel (.xlsx) or CSV files only</li>
                        <li>Maximum file size: 10MB</li>
                        <li>Required columns: surname, first_name, amount, payment_date</li>
                        <li>Optional columns: course_fee, accommodation_fee, agent, agency_category, etc.</li>
                        <li>Channel (B2C/B2B) will be auto-detected based on agent/agency data</li>
                    </ul>
                </div>

                <form id="uploadForm" enctype="multipart/form-data">
                    <div class="file-upload">
                        <input type="file" id="salesFile" name="salesFile" accept=".xlsx,.xls,.csv">
                        <label for="salesFile">
                            📁 Click to select file or drag and drop
                            <div class="file-info">Excel (.xlsx) or CSV files accepted</div>
                        </label>
                    </div>

                    <button type="submit" class="upload-btn" disabled>Upload Sales Data</button>
                </form>

                <div class="loading" id="loadingIndicator">
                    <div class="spinner"></div>
                    <p>Processing your file...</p>
                </div>

                <div class="result-container" id="resultContainer">
                    <div id="resultMessage"></div>
                </div>
            </div>
        </div>

        <script>
            const fileInput = document.getElementById('salesFile');
            const uploadBtn = document.querySelector('.upload-btn');
            const form = document.getElementById('uploadForm');
            const loadingIndicator = document.getElementById('loadingIndicator');
            const resultContainer = document.getElementById('resultContainer');
            const resultMessage = document.getElementById('resultMessage');

            fileInput.addEventListener('change', function() {
                if (this.files.length > 0) {
                    uploadBtn.disabled = false;
                    uploadBtn.textContent = 'Upload ' + this.files[0].name;
                } else {
                    uploadBtn.disabled = true;
                    uploadBtn.textContent = 'Upload Sales Data';
                }
            });

            form.addEventListener('submit', async function(e) {
                e.preventDefault();

                const formData = new FormData();
                formData.append('salesFile', fileInput.files[0]);

                uploadBtn.disabled = true;
                loadingIndicator.style.display = 'block';
                resultContainer.style.display = 'none';

                try {
                    const response = await fetch('/fins/scripts/payroll/sales/upload-xl/upload', {
                        method: 'POST',
                        body: formData
                    });

                    const result = await response.json();

                    if (result.success) {
                        resultContainer.className = 'result-container result-success';
                        resultMessage.innerHTML = \`
                            <h4>✅ Upload Successful!</h4>
                            <p>\${result.message}</p>
                            <ul>
                                <li>Total rows processed: \${result.validation.totalRows}</li>
                                <li>Valid rows inserted: \${result.validation.validRows}</li>
                                <li>Invalid rows skipped: \${result.validation.invalidRows}</li>
                            </ul>
                        \`;
                    } else {
                        resultContainer.className = 'result-container result-error';
                        resultMessage.innerHTML = \`
                            <h4>❌ Upload Failed</h4>
                            <p>\${result.error}</p>
                        \`;
                    }

                } catch (error) {
                    resultContainer.className = 'result-container result-error';
                    resultMessage.innerHTML = \`
                        <h4>❌ Upload Error</h4>
                        <p>Failed to upload file: \${error.message}</p>
                    \`;
                }

                loadingIndicator.style.display = 'none';
                resultContainer.style.display = 'block';
                uploadBtn.disabled = false;
                uploadBtn.textContent = 'Upload Sales Data';
                fileInput.value = '';
            });
        </script>
    </body>
    </html>
    `;
}

// Cleanup function for graceful shutdown
process.on('SIGINT', async () => {
    console.log('Upload script: Closing database connections...');
    await dataProvider.disconnect();
    process.exit(0);
});

module.exports = router;