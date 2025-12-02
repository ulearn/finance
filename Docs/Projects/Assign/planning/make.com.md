INPUT
[
    {
        "ca": null,
        "qs": [
            {
                "name": "filter[accommodation_from_original]",
                "value": "23/09/2025,23/12/2025"
            },
            {
                "name": "filter[accommodation_until_original]",
                "value": "08/11/2025,23/07/2026"
            },
            {
                "name": "filter[filter_payment_status]",
                "value": "payed"
            },
            {
                "name": "filter[accommodation_category_original][]",
                "value": "4"
            },
            {
                "name": "filter[search]",
                "value": "29147"
            }
        ],
        "url": "https://ulearn.fidelo.com/api/1.0/ts/bookings",
        "data": null,
        "gzip": true,
        "method": "get",
        "headers": [
            {
                "name": "Authorization",
                "value": "Bearer 54b1c34031393ae0bafb5cd4874deb17"
            }
        ],
        "timeout": null,
        "useMtls": false,
        "authPass": null,
        "authUser": null,
        "bodyType": "raw",
        "contentType": "application/json",
        "serializeUrl": false,
        "shareCookies": true,
        "parseResponse": true,
        "followRedirect": true,
        "useQuerystring": false,
        "followAllRedirects": true,
        "rejectUnauthorized": false
    }
]


OUTPUT
[
    {
        "statusCode": 200,
        "headers": [
            {
                "name": "server",
                "value": "nginx"
            },
            {
                "name": "content-type",
                "value": "application/json"
            },
            {
                "name": "transfer-encoding",
                "value": "chunked"
            },
            {
                "name": "connection",
                "value": "close"
            },
            {
                "name": "cache-control",
                "value": "max-age=0, private, must-revalidate, no-cache, private"
            },
            {
                "name": "set-cookie",
                "value": "PHPSESSID=b5nb0ump7miu6o53evqrko0hbe; path=/"
            },
            {
                "name": "date",
                "value": "Sun, 23 Nov 2025 18:57:43 GMT"
            },
            {
                "name": "content-encoding",
                "value": "gzip"
            }
        ],
        "cookieHeaders": [
            "PHPSESSID=b5nb0ump7miu6o53evqrko0hbe; path=/"
        ],
        "data": {
            "hits": 0,
            "entries": []
        },
        "fileSize": 23
    }
]