// Test Hours Calculation Logic
console.log('Testing Hours Calculation Logic...\n');

function calculateHours(clockIn, clockOut, date = '2024-01-01') {
  const clockInTime = new Date(`${date}T${clockIn}`);
  const clockOutTime = new Date(`${date}T${clockOut}`);
  
  if (clockOutTime > clockInTime) {
    const diffMs = clockOutTime.getTime() - clockInTime.getTime();
    const diffHours = diffMs / (1000 * 60 * 60); // Convert milliseconds to hours
    const hoursWorked = Math.round(diffHours * 100) / 100; // Round to 2 decimal places
    return hoursWorked;
  }
  return 0;
}

// Test cases
const testCases = [
  { clockIn: '09:00', clockOut: '17:00', expected: 8.0 },
  { clockIn: '09:00', clockOut: '17:30', expected: 8.5 },
  { clockIn: '08:30', clockOut: '16:45', expected: 8.25 },
  { clockIn: '10:15', clockOut: '18:30', expected: 8.25 },
  { clockIn: '09:00', clockOut: '12:00', expected: 3.0 },
  { clockIn: '14:00', clockOut: '22:30', expected: 8.5 }
];

console.log('Test Results:');
console.log('=============');

testCases.forEach((test, index) => {
  const result = calculateHours(test.clockIn, test.clockOut);
  const passed = result === test.expected;
  
  console.log(`Test ${index + 1}: ${passed ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  Clock In: ${test.clockIn}`);
  console.log(`  Clock Out: ${test.clockOut}`);
  console.log(`  Expected: ${test.expected} hours`);
  console.log(`  Got: ${result} hours`);
  console.log('');
});

// Test edge cases
console.log('Edge Cases:');
console.log('===========');

// Same time (should be 0)
const sameTime = calculateHours('09:00', '09:00');
console.log(`Same time (09:00 - 09:00): ${sameTime} hours ${sameTime === 0 ? '✅' : '❌'}`);

// Clock out before clock in (should be 0)
const invalidTime = calculateHours('17:00', '09:00');
console.log(`Invalid time (17:00 - 09:00): ${invalidTime} hours ${invalidTime === 0 ? '✅' : '❌'}`);

// Midnight crossing (23:00 to 01:00 next day)
const midnightCrossing = calculateHours('23:00', '01:00');
console.log(`Midnight crossing (23:00 - 01:00): ${midnightCrossing} hours`);
console.log('Note: This should be handled with proper date handling for overnight shifts');

console.log('\nCalculation Formula:');
console.log('===================');
console.log('1. Create Date objects: new Date(`${date}T${time}`)');
console.log('2. Calculate difference: clockOut.getTime() - clockIn.getTime()');
console.log('3. Convert to hours: diffMs / (1000 * 60 * 60)');
console.log('4. Round to 2 decimals: Math.round(hours * 100) / 100');