#!/bin/bash
# Extract all months for years 2018-2024

cd /home/hub/public_html/fins/scripts/fidelo/hourly

for year in 2018 2019 2020 2021 2022 2023 2024; do
    echo "========================================="
    echo "Starting extraction for $year"
    echo "========================================="

    for month in 01 02 03 04 05 06 07 08 09 10 11 12; do
        # Calculate last day of month
        if [ "$month" == "02" ]; then
            # Check for leap year
            if [ $((year % 4)) -eq 0 ] && ([ $((year % 100)) -ne 0 ] || [ $((year % 400)) -eq 0 ]); then
                lastday="29"
            else
                lastday="28"
            fi
        elif [ "$month" == "04" ] || [ "$month" == "06" ] || [ "$month" == "09" ] || [ "$month" == "11" ]; then
            lastday="30"
        else
            lastday="31"
        fi

        echo "Extracting $year-$month..."
        node extract-all-invoices-2025.js ${year}-${month}-01 ${year}-${month}-${lastday}
    done

    echo "Merging $year..."
    node merge-year.js $year

    echo "✅ Completed $year"
    echo ""
done

echo "========================================="
echo "ALL YEARS COMPLETE!"
echo "========================================="
